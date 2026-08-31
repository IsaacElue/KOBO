import { supabase } from "./supabase";
import type { FundingRail } from "./onramp";

/**
 * The funding repository — the single seam between funding logic and the
 * database.
 *
 * Phase 1 motivation: the funding lifecycle currently couples Supabase calls
 * into the route and webhook handlers, which makes the lifecycle untestable
 * (no DB in tests) and makes every future rail (Coinbase / SEPA / Stripe)
 * re-implement the same row transitions. This module owns all
 * `funding_requests` reads/writes behind a narrow interface, injected per
 * call-site so unit tests can pass an in-memory fake. The routes stay thin;
 * the lifecycle logic (claim-once, idempotent settlement) is expressed here
 * where it can be locked down by tests.
 *
 * The default export binds the real Supabase client; tests construct the
 * repository with a fake adapter.
 */

export interface FundingRequestRow {
  id: string;
  sender_id: string;
  amount_eur: number;
  amount_usdc: number | null;
  status: FundingStatus;
  rail: FundingRail;
  onramp_session_id: string | null;
  onramp_reference: string | null;
  failure_reason: string | null;
  created_at: string;
}

export type FundingStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "awaiting_reconciliation"
  | "manual_review"
  | "payout_pending";

export interface FundingRequestDb {
  insert(row: {
    sender_id: string;
    amount_eur: number;
    amount_usdc: number | null;
    status: FundingStatus;
    rail: FundingRail;
  }): Promise<FundingRequestRow>;
  getById(id: string): Promise<FundingRequestRow | null>;
  /**
   * Looks up by `onramp_session_id` rather than `id`. MoonPay/Transak echo
   * our own `funding_requests.id` back on their webhook payload (see
   * routes/webhooks.ts), so they never need this — Crossmint's order-create
   * body has no free-text external-reference field, so its webhook can only
   * be correlated back via the `orderId` we stored as `onramp_session_id`
   * at creation time (routes/funding.ts's `updateSession` call).
   */
  getBySessionId(sessionId: string): Promise<FundingRequestRow | null>;
  updateSession(id: string, sessionId: string | null): Promise<FundingRequestRow | null>;
  /** Atomically claim a pending request — only one caller may win. */
  claim(
    id: string,
    next: { status: FundingStatus; onramp_reference?: string | null; failure_reason?: string | null }
  ): Promise<FundingRequestRow | null>;
  /** Transition to a failure state. No balance credit ever happens here. */
  markFailed(id: string, reason: string | null): Promise<FundingRequestRow | null>;
}

/**
 * The real Supabase-bound implementation. These are thin wrappers around the
 * same PostgREST queries the route used to inline — behavior unchanged, just
 * relocated behind the interface. Keep them thin: all conditionals/lifecycle
 * decisions live in the funding service layer (routes/webhooks), which is
 * where the tests hang.
 */
const supabaseDb: FundingRequestDb = {
  async insert(row) {
    const { data, error } = await supabase
      .from("funding_requests")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as FundingRequestRow;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("funding_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as FundingRequestRow | null) ?? null;
  },

  async getBySessionId(sessionId) {
    const { data, error } = await supabase
      .from("funding_requests")
      .select("*")
      .eq("onramp_session_id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return (data as FundingRequestRow | null) ?? null;
  },

  async updateSession(id, sessionId) {
    const { data, error } = await supabase
      .from("funding_requests")
      .update({ onramp_session_id: sessionId })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as FundingRequestRow | null) ?? null;
  },

  async claim(id, next) {
    const { data, error } = await supabase
      .from("funding_requests")
      .update({
        ...(next.status ? { status: next.status } : {}),
        ...(next.onramp_reference !== undefined ? { onramp_reference: next.onramp_reference } : {}),
        ...(next.failure_reason !== undefined ? { failure_reason: next.failure_reason } : {}),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as FundingRequestRow | null) ?? null;
  },

  async markFailed(id, reason) {
    const { data, error } = await supabase
      .from("funding_requests")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as FundingRequestRow | null) ?? null;
  },
};

export const fundingDb: FundingRequestDb = supabaseDb;