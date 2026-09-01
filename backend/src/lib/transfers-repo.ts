import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * The raw `transfers.status` enum — the only values the DB check constraint
 * allows (see migrations). `GET /transfers`'s `status` filter accepts these
 * and nothing else; no new statuses are invented here.
 */
export const TRANSFER_STATUSES = [
  "pending",
  "onramp_complete",
  "sent",
  "confirmed",
  "failed",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export function isTransferStatus(value: unknown): value is TransferStatus {
  return typeof value === "string" && (TRANSFER_STATUSES as readonly string[]).includes(value);
}

/** A well-formed v4-ish UUID — the shape a transfer `id` (the user-facing "reference") has. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Base58, 32–120 chars — the shape a real Solana transaction signature has.
 * Deliberately loose (an exact 87/88-char check would reject valid edge
 * cases); it only needs to be distinct from "a person's name" so the search
 * dispatch below can tell a pasted signature from a typed name.
 */
const BASE58_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{32,120}$/;

const SELECT_COLS =
  "id, recipient_id, amount_eur, amount_usdc, status, solana_tx_signature, failure_reason, created_at";

/** `recipient_name` is joined from `users.name`, never a column on `transfers`. */
const SELECT_WITH_RECIPIENT = `${SELECT_COLS}, recipient:users!transfers_recipient_id_fkey(name)`;
const SELECT_WITH_RECIPIENT_INNER = `${SELECT_COLS}, recipient:users!transfers_recipient_id_fkey!inner(name)`;

export interface ListTransfersParams {
  /** The signed-in sender's own `users.id` — always set by the route from the verified session. */
  senderId: string;
  /** Free-text search: recipient name (substring, case-insensitive), or an exact transfer id / signature. */
  q?: string;
  /** Restrict to these raw `transfers.status` values (already validated by the caller). */
  statuses?: TransferStatus[];
  limit: number;
  offset: number;
}

export interface TransferListRow {
  id: string;
  recipient_id: string;
  amount_eur: number;
  amount_usdc: number | null;
  status: string;
  solana_tx_signature: string | null;
  failure_reason: string | null;
  created_at: string;
  recipient_name: string | null;
}

export interface TransferListResult {
  transfers: TransferListRow[];
  /** Total rows matching the filter (ignoring limit/offset) — for pagination. */
  total: number;
}

export type ListSenderTransfers = (params: ListTransfersParams) => Promise<TransferListResult>;

/** Escapes PostgREST `ilike` metacharacters so a literal `%`/`_` in a search term isn't a wildcard. */
function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`);
}

type RawRow = Omit<TransferListRow, "recipient_name"> & {
  recipient: { name: string } | null | { name: string }[];
};

function toListRow(row: RawRow): TransferListRow {
  const { recipient, ...rest } = row;
  const name = Array.isArray(recipient) ? recipient[0]?.name ?? null : recipient?.name ?? null;
  return { ...rest, recipient_name: name };
}

/**
 * Builds the real Supabase-backed lister for `GET /transfers`. Own-resource
 * only: every query is scoped to `sender_id = params.senderId` — the route
 * passes the caller's own id from the verified session, never anything
 * client-supplied.
 *
 * Search (`q`) is dispatched by shape so each branch stays a single indexed
 * query that paginates correctly (no over-fetch-then-filter):
 *  - looks like a UUID  → exact `id` match (the "reference" the receipt shows)
 *  - looks like a base58 signature → exact `solana_tx_signature` match
 *  - otherwise → recipient-name substring match over the `!inner` join
 */
export function makeSupabaseTransferLister(
  client: SupabaseClient = supabase
): ListSenderTransfers {
  return async ({ senderId, q, statuses, limit, offset }) => {
    const nameSearch = !!q && !UUID_RE.test(q) && !BASE58_SIG_RE.test(q);

    let query = client
      .from("transfers")
      .select(nameSearch ? SELECT_WITH_RECIPIENT_INNER : SELECT_WITH_RECIPIENT, {
        count: "exact",
      })
      .eq("sender_id", senderId);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    if (q) {
      if (UUID_RE.test(q)) {
        query = query.eq("id", q);
      } else if (BASE58_SIG_RE.test(q)) {
        query = query.eq("solana_tx_signature", q);
      } else {
        query = query.ilike("recipient.name", `%${escapeIlike(q)}%`);
      }
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const transfers = ((data ?? []) as unknown as RawRow[]).map(toListRow);
    return { transfers, total: count ?? transfers.length };
  };
}

export const listSenderTransfers = makeSupabaseTransferLister();
