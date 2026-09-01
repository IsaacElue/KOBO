import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { ListSenderTransfers, TransferListRow } from "../lib/transfers-repo";

/**
 * `GET /transfers` list/search/pagination — route logic in isolation.
 *
 * `../lib/auth` is mocked before the route is imported (same pattern as
 * users-recipients.test.ts / onramp-selection.test.ts) so no real Supabase
 * Auth round-trip happens; the DB read goes through `createTransfersRouter`'s
 * injected `listTransfers`, backed here by an in-memory fixture. The send /
 * settlement pipeline (`POST /transfers`) is never exercised and never loaded
 * for real.
 */

// x-test-user header → auth id; resolveKoboUser maps auth id → kobo users.id.
vi.mock("../lib/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.authUser = { id: req.headers["x-test-user"] ?? "auth-alice" };
    next();
  },
  resolveKoboUser: vi.fn(async (authId: string) => {
    if (authId === "auth-alice") return { id: "user-alice" };
    if (authId === "auth-bob") return { id: "user-bob" };
    return null; // no linked account
  }),
}));

interface FakeRow extends TransferListRow {
  sender_id: string;
}

const NOW = Date.UTC(2026, 8, 1);

function seed(): FakeRow[] {
  const mk = (
    i: number,
    sender_id: string,
    recipient_name: string,
    status: string,
    sig: string | null
  ): FakeRow => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    sender_id,
    recipient_id: `rcp-${recipient_name.toLowerCase().replace(/\s+/g, "-")}`,
    amount_eur: 10 + i,
    amount_usdc: 11 + i,
    status,
    solana_tx_signature: sig,
    failure_reason: status === "failed" ? "chain rejected" : null,
    created_at: new Date(NOW - i * 86_400_000).toISOString(),
    recipient_name,
  });

  return [
    mk(1, "user-alice", "Adaeze Okonkwo", "confirmed", "5H1gnaW".padEnd(64, "a")),
    mk(2, "user-alice", "Chidi Balogun", "confirmed", "9xQeF".padEnd(64, "b")),
    mk(3, "user-alice", "Adaeze Okonkwo", "pending", null),
    mk(4, "user-alice", "Ngozi Eze", "failed", null),
    mk(5, "user-alice", "Emeka Nwachukwu", "sent", "3ZZt".padEnd(64, "c")),
    mk(6, "user-bob", "Bob Recipient", "confirmed", "7bob".padEnd(64, "d")),
  ];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE58_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{32,120}$/;

/** In-memory stand-in for `listSenderTransfers` — same contract, honours every filter. */
function makeFakeLister(rows: FakeRow[]) {
  const calls: any[] = [];
  const fn: ListSenderTransfers = async ({ senderId, q, statuses, limit, offset }) => {
    calls.push({ senderId, q, statuses, limit, offset });
    let matched = rows.filter((r) => r.sender_id === senderId);
    if (statuses && statuses.length) matched = matched.filter((r) => statuses.includes(r.status as any));
    if (q) {
      if (UUID_RE.test(q)) matched = matched.filter((r) => r.id === q);
      else if (BASE58_SIG_RE.test(q)) matched = matched.filter((r) => r.solana_tx_signature === q);
      else matched = matched.filter((r) => (r.recipient_name ?? "").toLowerCase().includes(q.toLowerCase()));
    }
    matched.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = matched.length;
    const page = matched.slice(offset, offset + limit).map(({ sender_id, ...rest }) => rest);
    return { transfers: page, total };
  };
  return { fn, calls };
}

async function buildApp(lister: ListSenderTransfers) {
  const { createTransfersRouter } = await import("../routes/transfers");
  const app = express();
  app.use(express.json());
  app.use("/transfers", createTransfersRouter({ listTransfers: lister }));
  return app;
}

describe("GET /transfers — list, search, filter, pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default listing stays backward-compatible: { transfers: [...] }, newest first, default limit 50", async () => {
    const { fn, calls } = makeFakeLister(seed());
    const res = await request(await buildApp(fn)).get("/transfers");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transfers)).toBe(true);
    expect(res.body.transfers).toHaveLength(5); // only user-alice's rows
    expect(res.body.transfers[0].recipient_name).toBe("Adaeze Okonkwo");
    expect(res.body.transfers[0].created_at > res.body.transfers[1].created_at).toBe(true);
    // additive pagination metadata
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(50);
    expect(res.body.offset).toBe(0);
    expect(res.body.has_more).toBe(false);
    expect(calls[0]).toMatchObject({ senderId: "user-alice", limit: 50, offset: 0 });
  });

  it("search by recipient name (substring, case-insensitive)", async () => {
    const { fn } = makeFakeLister(seed());
    const res = await request(await buildApp(fn)).get("/transfers").query({ q: "adaeze" });

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(2);
    expect(res.body.transfers.every((t: any) => t.recipient_name === "Adaeze Okonkwo")).toBe(true);
    expect(res.body.total).toBe(2);
  });

  it("search by transfer id (the user-facing reference) returns the exact row", async () => {
    const { fn } = makeFakeLister(seed());
    const id = "00000000-0000-4000-8000-000000000002";
    const res = await request(await buildApp(fn)).get("/transfers").query({ q: id });

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(1);
    expect(res.body.transfers[0].id).toBe(id);
  });

  it("search by Solana signature returns the exact row", async () => {
    const rows = seed();
    const sig = rows[0].solana_tx_signature!;
    const { fn, calls } = makeFakeLister(rows);
    const res = await request(await buildApp(fn)).get("/transfers").query({ q: sig });

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(1);
    expect(res.body.transfers[0].solana_tx_signature).toBe(sig);
    expect(calls[0].q).toBe(sig);
  });

  it("status filter — single value", async () => {
    const { fn, calls } = makeFakeLister(seed());
    const res = await request(await buildApp(fn)).get("/transfers").query({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(2);
    expect(res.body.transfers.every((t: any) => t.status === "confirmed")).toBe(true);
    expect(calls[0].statuses).toEqual(["confirmed"]);
  });

  it("status filter — comma-separated group (in progress = pending,onramp_complete,sent)", async () => {
    const { fn, calls } = makeFakeLister(seed());
    const res = await request(await buildApp(fn))
      .get("/transfers")
      .query({ status: "pending,onramp_complete,sent" });

    expect(res.status).toBe(200);
    expect(res.body.transfers).toHaveLength(2); // one pending + one sent
    expect(calls[0].statuses).toEqual(["pending", "onramp_complete", "sent"]);
  });

  it("pagination: limit + offset page through, has_more flips on the last page", async () => {
    const { fn } = makeFakeLister(seed());
    const app = await buildApp(fn);

    const p1 = await request(app).get("/transfers").query({ limit: 2, offset: 0 });
    expect(p1.body.transfers).toHaveLength(2);
    expect(p1.body.total).toBe(5);
    expect(p1.body.has_more).toBe(true);

    const p3 = await request(app).get("/transfers").query({ limit: 2, offset: 4 });
    expect(p3.body.transfers).toHaveLength(1);
    expect(p3.body.has_more).toBe(false);
  });

  it.each([
    ["limit", { limit: "0" }],
    ["limit", { limit: "1000" }],
    ["limit", { limit: "abc" }],
    ["limit", { limit: "2.5" }],
    ["offset", { offset: "-1" }],
    ["offset", { offset: "x" }],
    ["status", { status: "delivered" }],
    ["status", { status: "confirmed,not_a_status" }],
    ["q", { q: "x".repeat(201) }],
  ])("rejects invalid %s with 400 and never calls the lister", async (_label, query) => {
    const { fn, calls } = makeFakeLister(seed());
    const res = await request(await buildApp(fn)).get("/transfers").query(query as any);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("a user only ever sees their own transfers — sender id comes from the session, not the query", async () => {
    const { fn, calls } = makeFakeLister(seed());
    const app = await buildApp(fn);

    const bob = await request(app)
      .get("/transfers")
      .set("x-test-user", "auth-bob")
      // even if Bob tries to smuggle Alice's id in, the route ignores it
      .query({ sender_id: "user-alice", senderId: "user-alice" });

    expect(bob.status).toBe(200);
    expect(bob.body.transfers).toHaveLength(1);
    expect(bob.body.transfers[0].recipient_name).toBe("Bob Recipient");
    expect(calls[0].senderId).toBe("user-bob");
  });

  it("no linked kobo account → 403, lister untouched", async () => {
    const { fn, calls } = makeFakeLister(seed());
    const res = await request(await buildApp(fn)).get("/transfers").set("x-test-user", "auth-nobody");

    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("a lister failure surfaces as 500, not a crash", async () => {
    const failing: ListSenderTransfers = async () => {
      throw new Error("db exploded");
    };
    const res = await request(await buildApp(failing)).get("/transfers");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("db exploded");
  });
});
