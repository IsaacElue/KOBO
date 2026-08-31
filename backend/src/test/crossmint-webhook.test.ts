import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

// Deterministic test secret — whsec_ prefix + base64 payload, same shape
// Crossmint's console issues. Never a real secret.
const TEST_SECRET = "whsec_" + Buffer.from("test-signing-key-not-real").toString("base64");

function sign(id: string, timestamp: string, body: string, secret = TEST_SECRET): string {
  const secretBytes = Buffer.from(secret.split("_").slice(1).join("_"), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const sig = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${sig}`;
}

describe("Crossmint webhook — signature verification + staging observation route (Step 4)", () => {
  const originalSecret = process.env.CROSSMINT_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.CROSSMINT_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CROSSMINT_WEBHOOK_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("valid signature + valid JSON body: 200, observed, no ledger/state side effects triggered", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = JSON.stringify({ type: "order.payment.succeeded", data: { orderId: "order_123" } });
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = observeCrossmintWebhook(body, {
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: sign(id, timestamp, body),
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true, observed: true });
  });

  it("invalid signature (wrong secret): rejected 401", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = JSON.stringify({ type: "order.payment.succeeded" });
    const id = "msg_2";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const wrongSecret = "whsec_" + Buffer.from("a-completely-different-key").toString("base64");
    const result = observeCrossmintWebhook(body, {
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: sign(id, timestamp, body, wrongSecret),
    });
    expect(result.status).toBe(401);
  });

  it("invalid signature (tampered body after signing): rejected 401", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const id = "msg_3";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const originalBody = JSON.stringify({ type: "order.payment.succeeded" });
    const signature = sign(id, timestamp, originalBody);
    const tamperedBody = JSON.stringify({ type: "order.payment.succeeded", injected: true });
    const result = observeCrossmintWebhook(tamperedBody, { svixId: id, svixTimestamp: timestamp, svixSignature: signature });
    expect(result.status).toBe(401);
  });

  it("missing svix headers: rejected 401, not a crash", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const result = observeCrossmintWebhook(JSON.stringify({ type: "x" }), {});
    expect(result.status).toBe(401);
  });

  it("malformed payload (valid signature, invalid JSON): rejected 400, not 500", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = "{not valid json";
    const id = "msg_4";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = observeCrossmintWebhook(body, {
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: sign(id, timestamp, body),
    });
    expect(result.status).toBe(400);
  });

  it("stale timestamp (replay protection): rejected 401", async () => {
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = JSON.stringify({ type: "order.payment.succeeded" });
    const id = "msg_5";
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 60); // 1 hour old
    const result = observeCrossmintWebhook(body, {
      svixId: id,
      svixTimestamp: staleTimestamp,
      svixSignature: sign(id, staleTimestamp, body),
    });
    expect(result.status).toBe(401);
  });

  it("CROSSMINT_WEBHOOK_SECRET not configured: 503, distinct from an invalid signature", async () => {
    delete process.env.CROSSMINT_WEBHOOK_SECRET;
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = JSON.stringify({ type: "order.payment.succeeded" });
    const id = "msg_6";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = observeCrossmintWebhook(body, {
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: sign(id, timestamp, body),
    });
    expect(result.status).toBe(503);
  });

  it("valid delivery never calls into the funding ledger pipeline (no crediting, no state transition)", async () => {
    const balances = await import("../lib/balances");
    const creditSpy = vi.spyOn(balances, "creditBalance");
    const { observeCrossmintWebhook } = await import("../routes/webhooks");
    const body = JSON.stringify({ type: "order.payment.succeeded", data: { orderId: "order_789" } });
    const id = "msg_7";
    const timestamp = String(Math.floor(Date.now() / 1000));
    observeCrossmintWebhook(body, { svixId: id, svixTimestamp: timestamp, svixSignature: sign(id, timestamp, body) });
    expect(creditSpy).not.toHaveBeenCalled();
  });
});
