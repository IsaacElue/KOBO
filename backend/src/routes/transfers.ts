import { Router } from "express";
import { supabase } from "../lib/supabase";
import { getMarketRate } from "../lib/transak";
import { creditBalance, debitBalanceIfSufficient } from "../lib/balances";
import { settleTransfer } from "../lib/settlement";
import { requireAuth, resolveKoboUser } from "../lib/auth";

export const transfersRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 */
transfersRouter.get("/", requireAuth, async (req, res) => {
  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No sender account linked to this session" });
  }

  const { data, error } = await supabase
    .from("transfers")
    .select(
      "id, recipient_id, amount_eur, amount_usdc, status, solana_tx_signature, failure_reason, created_at, recipient:users!transfers_recipient_id_fkey(name)"
    )
    .eq("sender_id", koboUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const transfers = (data ?? []).map((row) => {
    const { recipient, ...rest } = row as typeof row & { recipient: { name: string } | null };
    return { ...rest, recipient_name: recipient?.name ?? null };
  });

  return res.json({ transfers });
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
