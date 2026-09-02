import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { verifyGrant } from "../lib/access-grant";

/**
 * GET /auth/access (launch-access role + signed grant) and the waitlist-mode
 * gate on POST /auth/signup. `../lib/auth` and `../lib/supabase` are mocked so
 * no real Supabase round-trip happens (same pattern as transfers-list.test.ts).
 */

const GRANT_SECRET = "auth-access-test-secret-16chars+";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { admin: {}, signInWithPassword: vi.fn(), getUser: vi.fn() },
    from: vi.fn(),
  },
}));

const resolveKoboUser = vi.fn();
vi.mock("../lib/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { authUser?: unknown }).authUser = {
      id: (req.headers["x-auth-id"] as string | undefined) ?? "auth-1",
    };
    next();
  },
  resolveKoboUser: (...args: unknown[]) => resolveKoboUser(...args),
  withAuthTimeout: <T>(p: PromiseLike<T>) => Promise.resolve(p),
  AuthServiceTimeoutError: class extends Error {},
  AUTH_SERVICE_UNAVAILABLE: "unavailable",
}));

async function buildApp() {
  const { authRouter } = await import("../routes/auth");
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /auth/access", () => {
  beforeEach(() => vi.stubEnv("KOBO_ACCESS_GRANT_SECRET", GRANT_SECRET));

  it("normal user → access_role 'user', grant null", async () => {
    resolveKoboUser.mockResolvedValue({ id: "u1", access_role: "user" });
    const res = await request(await buildApp()).get("/auth/access");
    expect(res.status).toBe(200);
    expect(res.body.access_role).toBe("user");
    expect(res.body.grant).toBeNull();
  });

  it("no linked account → 'user', grant null", async () => {
    resolveKoboUser.mockResolvedValue(null);
    const res = await request(await buildApp()).get("/auth/access");
    expect(res.body).toMatchObject({ access_role: "user", grant: null });
  });

  it("developer → access_role 'developer' + a grant that verifies to their user id", async () => {
    resolveKoboUser.mockResolvedValue({ id: "dev-42", access_role: "developer" });
    const res = await request(await buildApp()).get("/auth/access");
    expect(res.status).toBe(200);
    expect(res.body.access_role).toBe("developer");
    expect(typeof res.body.grant).toBe("string");
    expect(res.body.grant_ttl_seconds).toBeGreaterThan(0);
    expect(verifyGrant(res.body.grant, { secret: GRANT_SECRET })).toEqual({ sub: "dev-42", role: "developer" });
  });

  it("admin → grant issued too", async () => {
    resolveKoboUser.mockResolvedValue({ id: "a1", access_role: "admin" });
    const res = await request(await buildApp()).get("/auth/access");
    expect(res.body.access_role).toBe("admin");
    expect(verifyGrant(res.body.grant, { secret: GRANT_SECRET })).toEqual({ sub: "a1", role: "admin" });
  });

  it("developer but no grant secret configured → role still returned, grant null (fail closed)", async () => {
    vi.stubEnv("KOBO_ACCESS_GRANT_SECRET", "");
    resolveKoboUser.mockResolvedValue({ id: "dev-42", access_role: "developer" });
    const res = await request(await buildApp()).get("/auth/access");
    expect(res.body.access_role).toBe("developer");
    expect(res.body.grant).toBeNull();
  });
});

describe("POST /auth/signup — waitlist-mode gate", () => {
  it("403 when KOBO_ACCESS_MODE is unset (defaults to waitlist)", async () => {
    vi.stubEnv("KOBO_ACCESS_MODE", "");
    const res = await request(await buildApp()).post("/auth/signup").send({ email: "x@y.com", password: "12345678", name: "X", country: "IE", wallet_address: "z" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/waitlist/i);
  });

  it("403 when KOBO_ACCESS_MODE=waitlist", async () => {
    vi.stubEnv("KOBO_ACCESS_MODE", "waitlist");
    const res = await request(await buildApp()).post("/auth/signup").send({ email: "x@y.com" });
    expect(res.status).toBe(403);
  });

  it("passes the gate when KOBO_ACCESS_MODE=live (then fails validation, not 403)", async () => {
    vi.stubEnv("KOBO_ACCESS_MODE", "live");
    const res = await request(await buildApp()).post("/auth/signup").send({});
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
  });
});
