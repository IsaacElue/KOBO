import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeFundingDb } from "./fake-funding-db";
import type { FundingRequestRow } from "../lib/funding-repo";

const creditBalanceMock = vi.fn(async (_userId: string, _amount: number) => undefined);
vi.mock("../lib/balances", () => ({
  creditBalance: (userId: string, amount: number) => creditBalanceMock(userId, amount),
}));

// Static import (not a fresh dynamic import per test) — vi.mock is hoisted
// above this regardless, and reusing one module instance avoids repeatedly
// re-walking webhooks.ts's whole dependency graph (settlement -> solana,
// moonpay, transak) on every single test.
import { handleFundingWebhook } from "../routes/webhooks";

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

describe("handleFundingWebhook — funding lifecycle (Phase 1)", () => {
  beforeEach(() => {
    creditBalanceMock.mockClear();
    creditBalanceMock.mockResolvedValue(undefined);
  });

  it("settlement of a funding request: claims the row and credits the sender's balance exactly once", async () => {
    const db = new FakeFundingDb([seedRow()]);

    const result = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "mp-txn-1", expectedRail: "moonpay" },
      db
    );

    expect(result.status).toBe(200);
    expect(creditBalanceMock).toHaveBeenCalledTimes(1);
    expect(creditBalanceMock).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 116.428667);
    const row = await db.getById("11111111-1111-4111-8111-111111111111");
    expect(row?.status).toBe("confirmed");
    expect(row?.onramp_reference).toBe("mp-txn-1");
  });

  it("prefers the provider-reported credited amount over the row's pre-purchase estimate", async () => {
    const db = new FakeFundingDb([seedRow({ amount_usdc: 100 })]);

    await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "mp-txn-1", creditedUsdc: 99.87, expectedRail: "moonpay" },
      db
    );

    expect(creditBalanceMock).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 99.87);
  });

  it("duplicate settlement: a second webhook call for an already-confirmed request is rejected (409), credited only once", async () => {
    const db = new FakeFundingDb([seedRow()]);

    const first = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "mp-txn-1", expectedRail: "moonpay" },
      db
    );
    const second = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "mp-txn-1-retry", expectedRail: "moonpay" },
      db
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(creditBalanceMock).toHaveBeenCalledTimes(1);
    const row = await db.getById("11111111-1111-4111-8111-111111111111");
    // The retry's reference must NOT have overwritten the original.
    expect(row?.onramp_reference).toBe("mp-txn-1");
  });

  it("duplicate funding request delivery, concurrent (two simultaneous webhook calls): only one wins, exactly one credit", async () => {
    const db = new FakeFundingDb([seedRow()]);

    const [a, b] = await Promise.all([
      handleFundingWebhook("11111111-1111-4111-8111-111111111111", { reference: "race-a", expectedRail: "moonpay" }, db),
      handleFundingWebhook("11111111-1111-4111-8111-111111111111", { reference: "race-b", expectedRail: "moonpay" }, db),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(creditBalanceMock).toHaveBeenCalledTimes(1);
  });

  it("provider/rail mismatch: a Transak webhook may not settle a funding request created via moonpay", async () => {
    const db = new FakeFundingDb([seedRow({ rail: "moonpay" })]);

    const result = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "transak-order-1", expectedRail: "transak" },
      db
    );

    expect(result.status).toBe(409);
    expect((result.body as { error: string }).error).toMatch(/rail/i);
    expect(creditBalanceMock).not.toHaveBeenCalled();
    const row = await db.getById("11111111-1111-4111-8111-111111111111");
    expect(row?.status).toBe("pending"); // never claimed
  });

  it("provider/rail mismatch, the other direction: MoonPay webhook may not settle a Transak-created request", async () => {
    const db = new FakeFundingDb([seedRow({ rail: "transak" })]);

    const result = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "mp-txn-1", expectedRail: "moonpay" },
      db
    );

    expect(result.status).toBe(409);
    expect(creditBalanceMock).not.toHaveBeenCalled();
  });

  it("matching rail settles normally (control case for the mismatch tests above)", async () => {
    const db = new FakeFundingDb([seedRow({ rail: "transak" })]);

    const result = await handleFundingWebhook(
      "11111111-1111-4111-8111-111111111111",
      { reference: "transak-order-1", expectedRail: "transak" },
      db
    );

    expect(result.status).toBe(200);
    expect(creditBalanceMock).toHaveBeenCalledTimes(1);
  });

  it("unknown funding request id: 404, no credit", async () => {
    const db = new FakeFundingDb([]);

    const result = await handleFundingWebhook("missing-id", { reference: "x", expectedRail: "moonpay" }, db);

    expect(result.status).toBe(404);
    expect(creditBalanceMock).not.toHaveBeenCalled();
  });
});
