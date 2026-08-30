import type { FundingRequestDb, FundingRequestRow } from "../lib/funding-repo";

/**
 * An in-memory `FundingRequestDb` for unit tests — behaves like the real
 * repository including the critical claim-once semantics (a `claim` only
 * succeeds when the row is still `pending`, exactly like the PostgREST
 * conditional update). Useful for testing lifecycle logic without a DB.
 */
export class FakeFundingDb implements FundingRequestDb {
  rows = new Map<string, FundingRequestRow>();

  constructor(seed: FundingRequestRow[] = []) {
    for (const r of seed) this.rows.set(r.id, r);
  }

  private clone(r: FundingRequestRow): FundingRequestRow {
    return { ...r };
  }

  async insert(row: {
    sender_id: string;
    amount_eur: number;
    amount_usdc: number | null;
    status: FundingRequestRow["status"];
    rail: FundingRequestRow["rail"];
  }): Promise<FundingRequestRow> {
    const record: FundingRequestRow = {
      id: `fund_${this.rows.size + 1}`,
      sender_id: row.sender_id,
      amount_eur: row.amount_eur,
      amount_usdc: row.amount_usdc,
      status: row.status,
      rail: row.rail,
      onramp_session_id: null,
      onramp_reference: null,
      failure_reason: null,
      created_at: new Date().toISOString(),
    };
    this.rows.set(record.id, record);
    return this.clone(record);
  }

  async getById(id: string): Promise<FundingRequestRow | null> {
    return this.rows.has(id) ? this.clone(this.rows.get(id)!) : null;
  }

  async updateSession(id: string, sessionId: string | null): Promise<FundingRequestRow | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.onramp_session_id = sessionId;
    return this.clone(r);
  }

  async claim(
    id: string,
    next: { status: FundingRequestRow["status"]; onramp_reference?: string | null; failure_reason?: string | null }
  ): Promise<FundingRequestRow | null> {
    const r = this.rows.get(id);
    if (!r || r.status !== "pending") return null;
    r.status = next.status;
    if (next.onramp_reference !== undefined) r.onramp_reference = next.onramp_reference;
    if (next.failure_reason !== undefined) r.failure_reason = next.failure_reason;
    return this.clone(r);
  }

  async markFailed(id: string, reason: string | null): Promise<FundingRequestRow | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.status = "failed";
    r.failure_reason = reason;
    return this.clone(r);
  }
}