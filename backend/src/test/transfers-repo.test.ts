import { describe, it, expect } from "vitest";
import { makeSupabaseTransferLister } from "../lib/transfers-repo";

/**
 * `makeSupabaseTransferLister` builds one indexed PostgREST query per call —
 * these tests drive it with a chainable fake client and assert the filters it
 * emits (never touching a real DB). The key invariant: the query is always
 * scoped to `sender_id`, and `q` is dispatched by shape.
 */

interface Recorded {
  from?: string;
  select?: string;
  selectOpts?: unknown;
  filters: Array<[string, string, unknown]>;
  order?: [string, unknown];
  range?: [number, number];
}

function fakeClient(rows: unknown[], count: number) {
  const rec: Recorded = { filters: [] };
  const builder: any = {
    select(sel: string, opts: unknown) {
      rec.select = sel;
      rec.selectOpts = opts;
      return builder;
    },
    eq(col: string, val: unknown) {
      rec.filters.push(["eq", col, val]);
      return builder;
    },
    in(col: string, val: unknown) {
      rec.filters.push(["in", col, val]);
      return builder;
    },
    ilike(col: string, val: unknown) {
      rec.filters.push(["ilike", col, val]);
      return builder;
    },
    order(col: string, opts: unknown) {
      rec.order = [col, opts];
      return builder;
    },
    range(a: number, b: number) {
      rec.range = [a, b];
      return Promise.resolve({ data: rows, error: null, count });
    },
  };
  const client: any = {
    from(table: string) {
      rec.from = table;
      return builder;
    },
  };
  return { client, rec };
}

const BASE = { senderId: "user-1", limit: 20, offset: 0 };

describe("makeSupabaseTransferLister", () => {
  it("always scopes to sender_id and orders newest-first with a range window", async () => {
    const { client, rec } = fakeClient([], 0);
    await makeSupabaseTransferLister(client)({ ...BASE, limit: 15, offset: 30 });

    expect(rec.from).toBe("transfers");
    expect(rec.filters).toContainEqual(["eq", "sender_id", "user-1"]);
    expect(rec.order).toEqual(["created_at", { ascending: false }]);
    expect(rec.range).toEqual([30, 44]);
    expect(rec.selectOpts).toEqual({ count: "exact" });
  });

  it("status filter emits an `in` on status", async () => {
    const { client, rec } = fakeClient([], 0);
    await makeSupabaseTransferLister(client)({
      ...BASE,
      statuses: ["pending", "sent"],
    });
    expect(rec.filters).toContainEqual(["in", "status", ["pending", "sent"]]);
  });

  it("q that looks like a UUID → exact id match, no join needed", async () => {
    const { client, rec } = fakeClient([], 0);
    const id = "00000000-0000-4000-8000-000000000001";
    await makeSupabaseTransferLister(client)({ ...BASE, q: id });

    expect(rec.filters).toContainEqual(["eq", "id", id]);
    expect(rec.select).not.toContain("!inner");
  });

  it("q that looks like a base58 signature → exact solana_tx_signature match", async () => {
    const { client, rec } = fakeClient([], 0);
    const sig = "a".repeat(88);
    await makeSupabaseTransferLister(client)({ ...BASE, q: sig });

    expect(rec.filters).toContainEqual(["eq", "solana_tx_signature", sig]);
    expect(rec.select).not.toContain("!inner");
  });

  it("q that looks like a name → ilike over the !inner recipient join", async () => {
    const { client, rec } = fakeClient([], 0);
    await makeSupabaseTransferLister(client)({ ...BASE, q: "Adaeze" });

    expect(rec.select).toContain("!inner");
    expect(rec.filters).toContainEqual(["ilike", "recipient.name", "%Adaeze%"]);
  });

  it("escapes ilike wildcards in a name search", async () => {
    const { client, rec } = fakeClient([], 0);
    await makeSupabaseTransferLister(client)({ ...BASE, q: "50%_off" });
    expect(rec.filters).toContainEqual(["ilike", "recipient.name", "%50\\%\\_off%"]);
  });

  it("flattens the joined recipient name and passes through the total count", async () => {
    const { client } = fakeClient(
      [
        {
          id: "t1",
          recipient_id: "r1",
          amount_eur: 10,
          amount_usdc: 11,
          status: "confirmed",
          solana_tx_signature: null,
          failure_reason: null,
          created_at: "2026-09-01T00:00:00.000Z",
          recipient: { name: "Adaeze Okonkwo" },
        },
      ],
      42
    );
    const out = await makeSupabaseTransferLister(client)(BASE);
    expect(out.total).toBe(42);
    expect(out.transfers[0].recipient_name).toBe("Adaeze Okonkwo");
    expect("recipient" in out.transfers[0]).toBe(false);
  });

  it("throws on a PostgREST error", async () => {
    const client: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: null, error: { message: "boom" }, count: null }),
            }),
          }),
        }),
      }),
    };
    await expect(makeSupabaseTransferLister(client)(BASE)).rejects.toThrow("boom");
  });
});
