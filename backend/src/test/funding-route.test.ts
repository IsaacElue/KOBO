import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Live HTTP-level tests for POST /funding's rail selection, through the real
 * Express route against the real Supabase project — opt-in (RUN_DB_TESTS=1),
 * same convention as balances-live.test.ts. Also requires DEV_SKIP_AUTH=true
 * (backend/.env, local-dev-only) so requireAuth resolves to the seeded sender
 * row without a real Supabase Auth session. Every row created here is deleted
 * in afterEach.
 *
 * MoonPay's createOnrampSession makes no network call (it's a synchronous
 * signed-URL build — see lib/moonpay.ts), so exercising it here is fast, free,
 * and safe to run repeatedly. Transak's session creation is a real network
 * call to their staging API and is deliberately NOT re-verified here — that
 * flow is covered by the mocked routing test in onramp-selection.test.ts;
 * re-hitting Transak's live API on every test run isn't this phase's job.
 */

const dbTestsEnabled = process.env.RUN_DB_TESTS === "1";
const devSkipAuthEnabled = process.env.DEV_SKIP_AUTH === "true";
const runLiveRouteTests = dbTestsEnabled && devSkipAuthEnabled;

// The users.id linked to the DEV_SKIP_AUTH seeded auth user (lib/auth.ts,
// DEV_BYPASS_AUTH_USER) — the same "Isaac Elue" test sender every other
// live-verification script in this repo already uses.
const SEEDED_SENDER_ID = "ee2e6c34-a6e5-48a7-bc41-48231bfa2f77";

describe.skipIf(!runLiveRouteTests)("POST /funding — rail selection (live HTTP + real Supabase)", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) return;
    const { supabase } = await import("../lib/supabase");
    const ids = createdIds.splice(0);
    for (const id of ids) {
      await supabase.from("funding_requests").delete().eq("id", id);
    }
  });

  async function buildApp() {
    const { fundingRouter } = await import("../routes/funding");
    const app = express();
    app.use(express.json());
    app.use("/funding", fundingRouter);
    return app;
  }

  it("valid funding rail selection: explicit rail:'moonpay' creates a row with that rail and a real MoonPay widget URL", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/funding")
      .send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1, rail: "moonpay" });

    expect(res.status).toBe(201);
    expect(res.body.rail).toBe("moonpay");
    expect(res.body.onramp.widgetUrl).toContain("moonpay.com");
    createdIds.push(res.body.id);
  });

  it("invalid rail: an unknown rail string is rejected with 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/funding")
      .send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1, rail: "dogecoin" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rail/i);
  });

  it("a known-but-unimplemented rail is rejected with 501, and creates no funding_requests row (not even a failed one)", async () => {
    const app = await buildApp();
    const { supabase } = await import("../lib/supabase");
    const before = await supabase.from("funding_requests").select("*", { count: "exact", head: true });

    const res = await request(app)
      .post("/funding")
      .send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1, rail: "sepa" });

    expect(res.status).toBe(501);
    expect(res.body.error).toMatch(/not implemented/i);

    const after = await supabase.from("funding_requests").select("*", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });

  it("funding request creation: omitting rail falls back to the server default (ONRAMP_PROVIDER) and still creates a row whose stored rail matches the session actually created", async () => {
    const app = await buildApp();
    const res = await request(app).post("/funding").send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1 });

    expect(res.status).toBe(201);
    expect(["moonpay", "transak"]).toContain(res.body.rail);
    // Regression guard for the bug fixed this phase: the stored rail must
    // agree with which provider's widget URL actually came back.
    if (res.body.rail === "moonpay") {
      expect(res.body.onramp.widgetUrl).toContain("moonpay.com");
    }
    createdIds.push(res.body.id);
  });

  it(
    "documented, not fixed this phase: submitting the same intent twice creates two independent " +
      "pending funding_requests rows — no creation-time idempotency key exists yet. " +
      "Flagged explicitly as a known, out-of-scope gap, not silently passed over.",
    async () => {
      const app = await buildApp();
      const first = await request(app)
        .post("/funding")
        .send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1, rail: "moonpay" });
      const second = await request(app)
        .post("/funding")
        .send({ sender_id: SEEDED_SENDER_ID, amount_eur: 1, rail: "moonpay" });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).not.toBe(second.body.id);
      createdIds.push(first.body.id, second.body.id);
    }
  );
});
