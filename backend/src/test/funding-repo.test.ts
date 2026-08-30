import { describe, it, expect } from "vitest";
import { FakeFundingDb } from "./fake-funding-db";
import type { FundingRequestRow } from "../lib/funding-repo";

function seedRow(overrides: Partial<FundingRequestRow> = {}): FundingRequestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sender_id: "22222222-2222-4222-8222-222222222222",
    amount_eur: 100,
    amount_usdc: 116.428667,
    status: "pending",
    rail: "moonpay",
    onramp_session_id: null,
    onramp_reference: null,
    failure_reason: null,
    created_at: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("funding repository — claim semantics", () => {
  it("creates a funding request with an explicit rail", async () => {
    const db = new FakeFundingDb();
    const created = await db.insert({
      sender_id: "22222222-2222-4222-8222-222222222222",
      amount_eur: 50,
      amount_usdc: 58.5,
      status: "pending",
      rail: "transak",
    });
    expect(created.rail).toBe("transak");
    expect(created.status).toBe("pending");
    expect(created.onramp_session_id).toBeNull();
  });

  it("claims a pending request (idempotent-first-wins)", async () => {
    const db = new FakeFundingDb([seedRow()]);
    const claimed = await db.claim("11111111-1111-4111-8111-111111111111", {
      status: "confirmed",
      onramp_reference: "tx_1",
    });
    expect(claimed?.status).toBe("confirmed");
    expect(claimed?.onramp_reference).toBe("tx_1");
  });

  it("does NOT claim an already-claimed request (no double credit)", async () => {
    const db = new FakeFundingDb([seedRow()]);
    await db.claim("11111111-1111-4111-8111-111111111111", { status: "confirmed", onramp_reference: "tx_1" });
    const second = await db.claim("11111111-1111-4111-8111-111111111111", { status: "confirmed", onramp_reference: "tx_2" });
    expect(second).toBeNull();
    const row = await db.getById("11111111-1111-4111-8111-111111111111");
    expect(row?.status).toBe("confirmed");
    expect(row?.onramp_reference).toBe("tx_1");
  });

  it("does NOT claim a failed request", async () => {
    const db = new FakeFundingDb([seedRow({ status: "failed" })]);
    const claimed = await db.claim("11111111-1111-4111-8111-111111111111", { status: "confirmed" });
    expect(claimed).toBeNull();
  });

  it("marks failed without crediting", async () => {
    const db = new FakeFundingDb([seedRow()]);
    const failed = await db.markFailed("11111111-1111-4111-8111-111111111111", "provider rejected");
    expect(failed?.status).toBe("failed");
    expect(failed?.failure_reason).toBe("provider rejected");
  });

  it("getById returns null for a missing id", async () => {
    const db = new FakeFundingDb();
    expect(await db.getById("missing")).toBeNull();
  });

  it("updateSession persists the session id", async () => {
    const db = new FakeFundingDb([seedRow()]);
    const updated = await db.updateSession("11111111-1111-4111-8111-111111111111", "sess_123");
    expect(updated?.onramp_session_id).toBe("sess_123");
  });
});

describe("funding status enum — Phase 1 expansion", () => {
  it("allows the new reconciled-rail states", () => {
    const statuses: FundingRequestRow["status"][] = [
      "pending",
      "confirmed",
      "failed",
      "awaiting_reconciliation",
      "manual_review",
      "payout_pending",
    ];
    for (const s of statuses) {
      const row = seedRow({ status: s });
      expect(row.status).toBe(s);
    }
  });
});