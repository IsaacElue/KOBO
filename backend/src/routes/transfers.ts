import { Router } from "express";
import type { Request } from "express";
import { supabase } from "../lib/supabase";
import { getMarketRate } from "../lib/transak";
import { creditBalance, debitBalanceIfSufficient } from "../lib/balances";
import { settleTransfer } from "../lib/settlement";
import { requireAuth, resolveKoboUser } from "../lib/auth";
import {
  listSenderTransfers,
  isTransferStatus,
  TRANSFER_STATUSES,
  type ListSenderTransfers,
  type TransferStatus,
} from "../lib/transfers-repo";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `GET /transfers` list-query defaults/ceilings. Param-less callers keep the
 * pre-pagination behaviour (up to 50 rows, newest first); the Activity page
 * opts into smaller pages explicitly via `?limit=`. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_Q_LENGTH = 200;
const MAX_STATUS_FILTERS = TRANSFER_STATUSES.length;

interface ParsedListQuery {
  q?: string;
  statuses?: TransferStatus[];
  limit: number;
  offset: number;
}

/** Parses/validates `?q=&status=&limit=&offset=`. Returns `{ error }` for any
 * malformed parameter so the route can 400 instead of passing junk to the DB. */
export function parseTransferListQuery(
  query: Request["query"]
): ParsedListQuery | { error: string } {
  const out: ParsedListQuery = { limit: DEFAULT_LIMIT, offset: 0 };

  if (query.limit !== undefined) {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return { error: `limit must be an integer between 1 and ${MAX_LIMIT}` };
    }
    out.limit = n;
  }

  if (query.offset !== undefined) {
    const n = Number(query.offset);
    if (!Number.isInteger(n) || n < 0) {
      return { error: "offset must be a non-negative integer" };
    }
    out.offset = n;
  }

  if (query.status !== undefined) {
    if (typeof query.status !== "string") {
      return { error: "status must be a string" };
    }
    const tokens = query.status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0 || tokens.length > MAX_STATUS_FILTERS) {
      return { error: `status must be 1–${MAX_STATUS_FILTERS} of: ${TRANSFER_STATUSES.join(", ")}` };
    }
    for (const token of tokens) {
      if (!isTransferStatus(token)) {
        return { error: `status must be one of: ${TRANSFER_STATUSES.join(", ")}` };
      }
    }
    out.statuses = [...new Set(tokens as TransferStatus[])];
  }

  if (query.q !== undefined) {
    if (typeof query.q !== "string") {
      return { error: "q must be a string" };
    }
    const trimmed = query.q.trim();
    if (trimmed.length > MAX_Q_LENGTH) {
      return { error: `q must be ${MAX_Q_LENGTH} characters or fewer` };
    }
    if (trimmed) out.q = trimmed;
  }

  return out;
}

/**
 * Transfers route factory. The read/list path (`GET /transfers`) goes through
 * the injected `ListSenderTransfers` so tests can supply an in-memory fake
 * (no live Supabase); the default wiring uses `listSenderTransfers`.
 *
 * `POST /transfers` and `GET /transfers/:id` are unchanged — the send /
 * settlement / balance pipeline is not touched by this sprint.
 */
export function createTransfersRouter(deps: { listTransfers?: ListSenderTransfers } = {}): Router {
  const listTransfers = deps.listTransfers ?? listSenderTransfers;
  const transfersRouter = Router();

// No parallel/legacy per-send Transak path is kept alongside this — every
// send is now balance-checked and, if funded, instant. Insufficient balance
// is a 400 telling the frontend to prompt Add Funds (POST /funding), not a
// fallback into a per-transfer Transak session. See KOBO_BUILD_PLAN.md
// "Sender-side balance — SUPERSEDED".
transfersRouter.post("/", requireAuth, async (req, res) => {
  const { sender_id, recipient_id, amount_eur } = req.body ?? {};

  if (!sender_id || !recipient_id || typeof amount_eur !== "number") {
    return res.status(400).json({
      error: "sender_id, recipient_id, and numeric amount_eur are required",
    });
  }
  if (amount_eur <= 0) {
    return res.status(400).json({ error: "amount_eur must be positive" });
  }
  if (!UUID_RE.test(sender_id)) {
    return res.status(400).json({ error: "sender_id must be a valid UUID" });
  }
  if (!UUID_RE.test(recipient_id)) {
    return res.status(400).json({ error: "recipient_id must be a valid UUID" });
  }

  // Identity now comes from the verified session, not the request body —
  // sender_id must actually be the caller's own account, not just any
  // existing user id. This is what makes the session check above meaningful
  // rather than cosmetic.
  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No sender account linked to this session" });
  }
  if (koboUser.id !== sender_id) {
    return res.status(403).json({ error: "sender_id does not match the authenticated user" });
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id, wallet_address")
    .eq("id", recipient_id)
    .maybeSingle();

  if (recipientError) {
    return res.status(500).json({ error: recipientError.message });
  }
  if (!recipient) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  let rate: number;
  try {
    rate = await getMarketRate("EUR");
  } catch (err) {
    return res.status(502).json({
      error: `Failed to fetch conversion rate: ${(err as Error).message}`,
    });
  }
  const amount_usdc = Number((amount_eur * rate).toFixed(6));

  const debited = await debitBalanceIfSufficient(sender_id, amount_usdc);
  if (!debited) {
    return res.status(400).json({
      error: "Insufficient balance — add funds before sending",
      code: "INSUFFICIENT_BALANCE",
      required_usdc: amount_usdc,
    });
  }

  const { data: transfer, error: insertError } = await supabase
    .from("transfers")
    .insert({
      sender_id,
      recipient_id,
      amount_eur,
      amount_usdc,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    // Balance already debited — refund immediately, since nothing
    // downstream was ever created to track this attempt.
    await creditBalance(sender_id, amount_usdc);
    return res.status(500).json({ error: insertError.message });
  }

  const result = await settleTransfer(transfer);

  const resultStatus = (result.body as { status?: string } | null)?.status;
  if (resultStatus === "failed") {
    // Every 'failed' outcome from settleTransfer happens either before a
    // successful broadcast or after the chain itself rejected the
    // transaction — no funds ever moved either way, so refunding here is
    // always correct. ('sent'/timeout and 'confirmed' are never refunded:
    // the send may still land, or already has.)
    await creditBalance(sender_id, amount_usdc);
  }

  return res.status(result.httpStatus).json(result.body);
});

/**
 * `GET /transfers` — the signed-in sender's own transfer history, newest
 * first, for the Activity page. Own resource only: rows are filtered by the
 * caller's `users.id` resolved from the verified session, never a
 * client-supplied id — same ownership model as `GET /transfers/:id`. Returns
 * existing `transfers` columns plus the recipient's `name` (joined from
 * `users`, not a new column) so the frontend can render a row without a
 * second lookup. No new fields on the table.
 *
 * Optional filters (all additive; a param-less call is unchanged behaviour):
 *   `q`      free-text — recipient name (substring), or an exact transfer
 *            id / Solana signature
 *   `status` one or more (comma-separated) raw `transfers.status` values
 *   `limit`  page size, default 50, max 100
 *   `offset` rows to skip, for "load more" pagination
 *
 * Response adds `total` / `limit` / `offset` / `has_more` alongside
 * `transfers` for pagination. `transfers` itself is unchanged.
 */
transfersRouter.get("/", requireAuth, async (req, res) => {
  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No sender account linked to this session" });
  }

  const parsed = parseTransferListQuery(req.query);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const { transfers, total } = await listTransfers({
      senderId: koboUser.id,
      q: parsed.q,
      statuses: parsed.statuses,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return res.json({
      transfers,
      total,
      limit: parsed.limit,
      offset: parsed.offset,
      has_more: parsed.offset + transfers.length < total,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

transfersRouter.get("/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "id must be a valid UUID" });
  }

  const { data, error } = await supabase
    .from("transfers")
    .select(
      "id, sender_id, status, solana_tx_signature, amount_eur, amount_usdc, failure_reason, retry_count, onramp_session_id, onramp_reference, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "Transfer not found" });
  }

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser || data.sender_id !== koboUser.id) {
    return res.status(403).json({ error: "This transfer does not belong to the authenticated user" });
  }

  const { sender_id, ...body } = data;
  return res.json(body);
});

  return transfersRouter;
}

export const transfersRouter = createTransfersRouter();
