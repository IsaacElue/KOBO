import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { FakeFundingDb } from "./fake-funding-db";
import type { FundingRequestRow } from "../lib/funding-repo";

const creditBalanceMock = vi.fn(async (_userId: string, _amount: number) => undefined);
vi.mock("../lib/balances", () => ({
  creditBalance: (userId: string, amount: number) => creditBalanceMock(userId, amount),
}));

import { handleCrossmintWebhook } from "../routes/webhooks";
import { backendWallet } from "../lib/solana";

const POOLED_WALLET = backendWallet.publicKey.toBase58();

// Deterministic test secret — whsec_ prefix + base64 payload, same shape
// Crossmint's console issues. Never a real secret.
const TEST_SECRET = "whsec_" + Buffer.from("test-signing-key-not-real").toString("base64");

function sign(id: string, timestamp: string, body: string, secret = TEST_SECRET): string {
  const secretBytes = Buffer.from(secret.split("_").slice(1).join("_"), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const sig = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${sig}`;
}

function seedRow(overrides: Partial<FundingRequestRow> = {}): FundingRequestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sender_id: "22222222-2222-4222-8222-222222222222",
    amount_eur: 10,
    amount_usdc: 11.615265,
    status: "pending",
    rail: "crossmint",
    onramp_session_id: "order-abc-123",
    onramp_reference: null,
    failure_reason: null,
    created_at: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

function deliver(
  body: object,
  opts?: { id?: string; timestamp?: string; secret?: string; badSignature?: boolean; noHeaders?: boolean }
) {
  const bodyStr = JSON.stringify(body);
  if (opts?.noHeaders) return handleCrossmintWebhook(bodyStr, {}, dbHolder.db);
  const id = opts?.id ?? `msg_${Math.random().toString(36).slice(2, 10)}`;
  const timestamp = opts?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = opts?.badSignature
    ? "v1,not-a-real-signature-base64=="
    : sign(id, timestamp, bodyStr, opts?.secret);
  return handleCrossmintWebhook(bodyStr, { svixId: id, svixTimestamp: timestamp, svixSignature: signature }, dbHolder.db);
}

// Real payload captured from staging (trimmed to the fields the handler
// reads — orderId/type/failureReason are verbatim from the real delivery,
// see the KOBO — CROSSMINT RETRY report). Fixture, per Step 1(a).
const REAL_FAILURE_PAYLOAD = {
  actionId: "order-abc-123",
  data: {
    orderId: "order-abc-123",
    payment: {
      currency: "eur",
      failureReason: {
        category: "risk_block",
        code: "psp_security_block",
        message: "We couldn't complete this payment. Contact support if you believe this is an error.",
        retryPolicy: "do_not_retry",
      },
      method: "basis-theory",
      receiptEmail: "kobo-test+example@example.dev",
      status: "awaiting-payment",
    },
    phase: "payment",
  },
  timestamp: 1788203867901,
  type: "orders.payment.failed",
};

function successPayload(opts: { withAmount?: boolean; wrongWallet?: boolean } = {}) {
  return {
    actionId: "order-abc-123",
    data: {
      orderId: "order-abc-123",
      payment: {
        currency: "eur",
        method: "basis-theory",
        status: "completed",
        ...(opts.withAmount ? { received: { amount: "11.615265", currency: "usdc" } } : {}),
      },
      lineItems: [
        {
          chain: "solana",
          delivery: {
            status: "completed",
            recipient: { walletAddress: opts.wrongWallet ? "SomeOtherWallet11111111111111111111111" : POOLED_WALLET },
          },
        },
      ],
      phase: "delivery",
    },
    timestamp: Date.now(),
    type: "orders.payment.succeeded",
  };
}

const dbHolder: { db: FakeFundingDb } = { db: new FakeFundingDb() };

describe("Crossmint webhook — real handler (KOBO — CROSSMINT FRONTEND INTEGRATION Step 1)", () => {
  const originalSecret = process.env.CROSSMINT_WEBHOOK_SECRET;
  const originalCreditFlag = process.env.CROSSMINT_ENABLE_CREDIT;

  beforeEach(() => {
    process.env.CROSSMINT_WEBHOOK_SECRET = TEST_SECRET;
    delete process.env.CROSSMINT_ENABLE_CREDIT;
    dbHolder.db = new FakeFundingDb([seedRow()]);
    creditBalanceMock.mockClear();
    creditBalanceMock.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CROSSMINT_WEBHOOK_SECRET = originalSecret;
    process.env.CROSSMINT_ENABLE_CREDIT = originalCreditFlag;
    vi.restoreAllMocks();
  });

  it("invalid signature: rejected 401, row untouched", async () => {
    const result = await deliver(REAL_FAILURE_PAYLOAD, { badSignature: true });
    expect(result.status).toBe(401);
    expect((await dbHolder.db.getById(seedRow().id))?.status).toBe("pending");
  });

  it("missing svix headers: rejected 401", async () => {
    const result = await deliver(REAL_FAILURE_PAYLOAD, { noHeaders: true });
    expect(result.status).toBe(401);
  });

  it("stale timestamp (replay protection): rejected 401", async () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const result = await deliver(REAL_FAILURE_PAYLOAD, { timestamp: staleTimestamp });
    expect(result.status).toBe(401);
  });

  it("unconfigured secret: 503, distinct from invalid signature", async () => {
    delete process.env.CROSSMINT_WEBHOOK_SECRET;
    const result = await deliver(REAL_FAILURE_PAYLOAD);
    expect(result.status).toBe(503);
  });

  it("malformed JSON body (valid signature): 400", async () => {
    const bodyStr = "{not valid json";
    const id = "msg_bad_json";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = await handleCrossmintWebhook(
      bodyStr,
      { svixId: id, svixTimestamp: timestamp, svixSignature: sign(id, timestamp, bodyStr) },
      dbHolder.db
    );
    expect(result.status).toBe(400);
  });

  it("envelope missing data.orderId: 400, not a crash", async () => {
    const result = await deliver({ type: "orders.payment.failed", data: {} });
    expect(result.status).toBe(400);
  });

  it("unknown/no-op event type (e.g. orders.quote.created): 200 ack, no DB lookup, no credit", async () => {
    const getBySessionIdSpy = vi.spyOn(dbHolder.db, "getBySessionId");
    const result = await deliver({ type: "orders.quote.created", data: { orderId: "order-abc-123" } });
    expect(result.status).toBe(200);
    expect((result.body as any).handled).toBe(false);
    expect(getBySessionIdSpy).not.toHaveBeenCalled();
    expect(creditBalanceMock).not.toHaveBeenCalled();
  });

  it("unknown order (no row with that onramp_session_id): 404", async () => {
    const result = await deliver({ ...REAL_FAILURE_PAYLOAD, data: { ...REAL_FAILURE_PAYLOAD.data, orderId: "no-such-order" } });
    expect(result.status).toBe(404);
  });

  it("wrong rail (row belongs to moonpay): 409, row untouched", async () => {
    dbHolder.db = new FakeFundingDb([seedRow({ rail: "moonpay" })]);
    const result = await deliver(REAL_FAILURE_PAYLOAD);
    expect(result.status).toBe(409);
    expect((await dbHolder.db.getById(seedRow().id))?.status).toBe("pending");
  });

  describe("failure path (real captured fixture)", () => {
    it("orders.payment.failed: claims pending -> failed, stores the real failureReason, never credits", async () => {
      const result = await deliver(REAL_FAILURE_PAYLOAD);
      expect(result.status).toBe(200);
      const row = await dbHolder.db.getById(seedRow().id);
      expect(row?.status).toBe("failed");
      expect(row?.failure_reason).toContain("risk_block");
      expect(row?.failure_reason).toContain("psp_security_block");
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });

    it("duplicate delivery of the same failure: second call 409, no double transition", async () => {
      const first = await deliver(REAL_FAILURE_PAYLOAD);
      expect(first.status).toBe(200);
      const second = await deliver(REAL_FAILURE_PAYLOAD);
      expect(second.status).toBe(409);
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });

    it("concurrent-style delivery: exactly one of two simultaneous calls succeeds", async () => {
      const [a, b] = await Promise.all([deliver(REAL_FAILURE_PAYLOAD), deliver(REAL_FAILURE_PAYLOAD)]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });
  });

  describe("success path (defensive, gated — no real success payload has ever been observed)", () => {
    it("wrong recipient wallet: 409, no state change, no credit", async () => {
      const result = await deliver(successPayload({ withAmount: true, wrongWallet: true }));
      expect(result.status).toBe(409);
      expect((await dbHolder.db.getById(seedRow().id))?.status).toBe("pending");
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });

    it("settled amount present, CROSSMINT_ENABLE_CREDIT=true: credits exactly once via the MoonPay claim pattern", async () => {
      process.env.CROSSMINT_ENABLE_CREDIT = "true";
      const result = await deliver(successPayload({ withAmount: true }));
      expect(result.status).toBe(200);
      const row = await dbHolder.db.getById(seedRow().id);
      expect(row?.status).toBe("confirmed");
      expect(creditBalanceMock).toHaveBeenCalledTimes(1);
      expect(creditBalanceMock).toHaveBeenCalledWith(seedRow().sender_id, 11.615265);
    });

    it("settled amount present, CROSSMINT_ENABLE_CREDIT default false: manual_review, zero credit", async () => {
      const result = await deliver(successPayload({ withAmount: true }));
      expect(result.status).toBe(200);
      const row = await dbHolder.db.getById(seedRow().id);
      expect(row?.status).toBe("manual_review");
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });

    it("no usable settled amount, even with flag true: manual_review, zero credit, never invents a number", async () => {
      process.env.CROSSMINT_ENABLE_CREDIT = "true";
      const result = await deliver(successPayload({ withAmount: false }));
      expect(result.status).toBe(200);
      const row = await dbHolder.db.getById(seedRow().id);
      expect(row?.status).toBe("manual_review");
      expect(creditBalanceMock).not.toHaveBeenCalled();
    });

    it("duplicate success delivery after credit: second call 409, no double credit", async () => {
      process.env.CROSSMINT_ENABLE_CREDIT = "true";
      const payload = successPayload({ withAmount: true });
      const first = await deliver(payload);
      expect(first.status).toBe(200);
      const second = await deliver(payload);
      expect(second.status).toBe(409);
      expect(creditBalanceMock).toHaveBeenCalledTimes(1);
    });
  });
});
