import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { RecipientUser, RecipientUserRepository } from "../lib/recipients-repo";
import type { RecipientWalletProvider } from "../lib/wallet-provider";

/**
 * POST /users recipient provisioning — routing logic in isolation.
 *
 * The route module's two collaborators (lib/recipients-repo, lib/wallet-provider)
 * are mocked BEFORE the route is imported (same pattern as
 * onramp-selection.test.ts), so the route's real Supabase/Crossmint backends
 * never load — zero network, zero DB. Tests inject their own fakes through
 * createUsersRouter's dependency-injection hook and drive the router over
 * supertest with the same express.json() stack as the real app.
 */

// Mock the two collaborators the route is built on. The factories are
// exercised via createUsersRouter's deps injection, so their only real job
// here is to keep the route module importable without touching Supabase or
// Crossmint (no env vars needed, no network).
vi.mock("../lib/recipients-repo", () => ({
  supabaseRecipients: {
    create: vi.fn(),
    findByEmail: vi.fn(),
  },
}));
vi.mock("../lib/wallet-provider", () => ({
  normalizeRecipientEmail: (email: string) => email.trim().toLowerCase(),
  crossmintRecipientWalletProvider: {
    resolveOrCreateByEmail: vi.fn(),
  },
}));

/** In-memory stand-in for supabaseRecipients: a Map keyed by normalized email. */
class FakeRecipientsRepo implements RecipientUserRepository {
  private rows = new Map<string, RecipientUser>();

  constructor(seed: RecipientUser[] = []) {
    for (const row of seed) {
      this.rows.set(row.email ?? "", row);
    }
  }

  async create(input: { name: string; country: string; wallet_address: string; email: string }): Promise<RecipientUser> {
    const row: RecipientUser = {
      id: `user_${this.rows.size + 1}`,
      name: input.name,
      role: "recipient",
      country: input.country,
      wallet_address: input.wallet_address,
      // Contract: an empty email is stored as NULL, not as an empty string.
      email: input.email === "" ? null : input.email,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    this.rows.set(row.email ?? "", row);
    return row;
  }

  async findByEmail(email: string): Promise<RecipientUser | null> {
    return this.rows.get(email) ?? null;
  }

  get size(): number {
    return this.rows.size;
  }

  getByEmail(email: string): RecipientUser | undefined {
    return this.rows.get(email);
  }
}

/** Deterministic Solana address the fake provider "provisions" for any email. */
const FAKE_WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

async function buildApp(overrides?: { recipients?: RecipientUserRepository; provider?: RecipientWalletProvider }) {
  const { createUsersRouter } = await import("../routes/users");
  const app = express();
  app.use(express.json());
  app.use("/users", createUsersRouter(overrides ?? {}));
  return app;
}

describe("POST /users — recipient provisioning by email (Phase 1A)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("(1) email creation stores the NORMALIZED email, wallet comes from the provider", async () => {
    const repo = new FakeRecipientsRepo();
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => FAKE_WALLET),
    };
    const app = await buildApp({ recipients: repo, provider });

    const res = await request(app)
      .post("/users")
      .send({ name: "Folake", role: "recipient", country: "NG", email: "  Folake@Example.COM  " });

    expect(res.status).toBe(201);
    // Normalized before the repo ever sees it.
    expect(repo.getByEmail("folake@example.com")).toBeDefined();
    expect(repo.getByEmail("  Folake@Example.COM  ")).toBeUndefined();
    // The address route returned is exactly what the provider resolved.
    expect(res.body.wallet_address).toBe(FAKE_WALLET);
    // Provider was handed the NORMALIZED email — never re-normalized inside.
    expect(provider.resolveOrCreateByEmail).toHaveBeenCalledTimes(1);
    expect(provider.resolveOrCreateByEmail).toHaveBeenCalledWith("folake@example.com");
    expect(res.body.email).toBeUndefined();
  });

  it("(2) duplicate email: both 201, exactly ONE row, provider called ONCE, same id", async () => {
    const repo = new FakeRecipientsRepo();
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => FAKE_WALLET),
    };
    const app = await buildApp({ recipients: repo, provider });

    const first = await request(app)
      .post("/users")
      .send({ name: "Folake", role: "recipient", country: "NG", email: "folake@example.com" });
    const second = await request(app)
      .post("/users")
      .send({ name: "Folake", role: "recipient", country: "NG", email: "folake@example.com" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // Existing row with a wallet is reused — no second provisioning.
    expect(provider.resolveOrCreateByEmail).toHaveBeenCalledTimes(1);
    expect(repo.size).toBe(1);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.wallet_address).toBe(FAKE_WALLET);
  });

  it("(3) reuse existing wallet: a seeded row short-circuits the provider entirely", async () => {
    const repo = new FakeRecipientsRepo([
      {
        id: "user_seeded",
        name: "Dupe",
        role: "recipient",
        country: "NG",
        wallet_address: "seedwallet",
        email: "dupe@example.com",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => FAKE_WALLET),
    };
    const app = await buildApp({ recipients: repo, provider });

    const res = await request(app)
      .post("/users")
      .send({ name: "Dupe", role: "recipient", country: "NG", email: "dupe@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.wallet_address).toBe("seedwallet");
    expect(provider.resolveOrCreateByEmail).not.toHaveBeenCalled();
    expect(repo.size).toBe(1); // no new row
    expect(res.body.id).toBe("user_seeded");
  });

  it("(4) address-only flow is unchanged: 201, email null, provider AND findByEmail untouched", async () => {
    const repo = new FakeRecipientsRepo();
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => FAKE_WALLET),
    };
    const findByEmailSpy = vi.spyOn(repo, "findByEmail");
    const app = await buildApp({ recipients: repo, provider });

    const res = await request(app).post("/users").send({
      name: "Direct",
      role: "recipient",
      country: "KE",
      wallet_address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    });

    expect(res.status).toBe(201);
    expect(res.body.wallet_address).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
    expect(repo.getByEmail("")).toBeDefined(); // stored with email null
    expect((repo.getByEmail("") as RecipientUser).email).toBeNull();
    expect(provider.resolveOrCreateByEmail).not.toHaveBeenCalled();
    expect(findByEmailSpy).not.toHaveBeenCalled();
  });

  it("(5) provider failure: 502 with the wrapper prefix, and NO row is created", async () => {
    const repo = new FakeRecipientsRepo();
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const app = await buildApp({ recipients: repo, provider });

    const res = await request(app)
      .post("/users")
      .send({ name: "Folake", role: "recipient", country: "NG", email: "folake@example.com" });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Failed to provision a wallet for this email: boom/);
    expect(repo.size).toBe(0); // nothing persisted
    expect(provider.resolveOrCreateByEmail).toHaveBeenCalledTimes(1);
    expect(provider.resolveOrCreateByEmail).toHaveBeenCalledWith("folake@example.com");
  });

  it("(6) GET /users?email= lookups by normalized email, case-insensitive, no auth", async () => {
    const repo = new FakeRecipientsRepo([
      {
        id: "user_exact",
        name: "Exact",
        role: "recipient",
        country: "GH",
        wallet_address: FAKE_WALLET,
        email: "exact@example.com",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const app = await buildApp({ recipients: repo });

    const found = await request(app).get("/users").query({ email: "Exact@Example.COM" });
    expect(found.status).toBe(200);
    expect(found.body.user.id).toBe("user_exact");
    expect(found.body.user.email).toBe("exact@example.com");
    expect(found.body.user.wallet_address).toBe(FAKE_WALLET);

    const missing = await request(app).get("/users").query({ email: "nobody@example.com" });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Recipient not found");

    const noParam = await request(app).get("/users");
    expect(noParam.status).toBe(400);
  });

  it("(6b) GET lookup never provokes a provider call", async () => {
    const repo = new FakeRecipientsRepo();
    const provider: RecipientWalletProvider = {
      resolveOrCreateByEmail: vi.fn(async () => FAKE_WALLET),
    };
    const app = await buildApp({ recipients: repo, provider });

    await request(app).get("/users").query({ email: "whomever@example.com" });
    expect(provider.resolveOrCreateByEmail).not.toHaveBeenCalled();
  });
});