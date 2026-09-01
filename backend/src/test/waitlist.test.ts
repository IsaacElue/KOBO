import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createWaitlistRouter } from "../routes/waitlist";
import { createRateLimiter } from "../lib/rate-limit";
import type { WaitlistRepository } from "../lib/waitlist-repo";

/**
 * POST /waitlist/signup + GET /waitlist/count — route logic in isolation.
 * The DB access goes through an injected in-memory `WaitlistRepository`
 * (same DI pattern as users-recipients.test.ts); no Supabase, no network.
 * The real DB behaviour (atomic signup_number, idempotency under concurrency)
 * is verified separately by `scripts/verify-waitlist.ts` against live Supabase.
 */

/** In-memory stand-in: an IDENTITY-style counter + email uniqueness. */
class FakeWaitlistRepo implements WaitlistRepository {
  private byEmail = new Map<string, number>();
  private next = 1;

  async signup(email: string) {
    const existing = this.byEmail.get(email);
    if (existing !== undefined) return { signup_number: existing, created: false };
    const signup_number = this.next++;
    this.byEmail.set(email, signup_number);
    return { signup_number, created: true };
  }

  async count() {
    return this.byEmail.size;
  }

  get size() {
    return this.byEmail.size;
  }
}

function buildApp(repo: WaitlistRepository, opts?: { rateLimit?: { windowMs: number; max: number } }) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(
    "/waitlist",
    createWaitlistRouter({
      repo,
      signupRateLimiter: createRateLimiter(opts?.rateLimit ?? { windowMs: 60_000, max: 1000 }),
    })
  );
  return app;
}

describe("POST /waitlist/signup", () => {
  let repo: FakeWaitlistRepo;
  let app: express.Express;

  beforeEach(() => {
    repo = new FakeWaitlistRepo();
    app = buildApp(repo);
  });

  it("new email → 201 with { signup_number }", async () => {
    const res = await request(app).post("/waitlist/signup").send({ email: "alice@example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ signup_number: 1 });
    expect(repo.size).toBe(1);
  });

  it("assigns increasing numbers to successive new signups", async () => {
    const a = await request(app).post("/waitlist/signup").send({ email: "a@example.com" });
    const b = await request(app).post("/waitlist/signup").send({ email: "b@example.com" });
    expect(a.body.signup_number).toBe(1);
    expect(b.body.signup_number).toBe(2);
  });

  it("existing email → 200 with the SAME number (idempotent, not an error)", async () => {
    const first = await request(app).post("/waitlist/signup").send({ email: "dup@example.com" });
    const second = await request(app).post("/waitlist/signup").send({ email: "dup@example.com" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.signup_number).toBe(first.body.signup_number);
    expect(repo.size).toBe(1);
  });

  it("normalises case + surrounding whitespace before matching", async () => {
    const first = await request(app).post("/waitlist/signup").send({ email: "Person@Example.com" });
    const second = await request(app).post("/waitlist/signup").send({ email: "  person@example.com  " });
    expect(second.status).toBe(200);
    expect(second.body.signup_number).toBe(first.body.signup_number);
    expect(repo.size).toBe(1);
  });

  it.each([
    ["missing body", undefined],
    ["missing email", {}],
    ["non-string email", { email: 123 }],
    ["empty email", { email: "" }],
    ["no @", { email: "nope" }],
    ["no domain dot", { email: "a@b" }],
    ["spaces inside", { email: "a b@example.com" }],
    ["over-long", { email: `${"x".repeat(250)}@example.com` }],
  ])("rejects %s with 400 and inserts nothing", async (_label, body) => {
    const res = await request(app).post("/waitlist/signup").send(body as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(repo.size).toBe(0);
  });

  it("a repo failure surfaces as 500, not a crash", async () => {
    const failing: WaitlistRepository = {
      signup: async () => {
        throw new Error("db down");
      },
      count: async () => 0,
    };
    const res = await request(buildApp(failing)).post("/waitlist/signup").send({ email: "x@example.com" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("db down");
  });

  it("rate-limits repeated signups from the same IP (429 after `max`)", async () => {
    const limited = buildApp(repo, { rateLimit: { windowMs: 60_000, max: 3 } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(limited).post("/waitlist/signup").send({ email: `u${i}@example.com` });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 3).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it("a 429 carries a Retry-After header and a JSON error", async () => {
    const limited = buildApp(repo, { rateLimit: { windowMs: 60_000, max: 1 } });
    await request(limited).post("/waitlist/signup").send({ email: "one@example.com" });
    const blocked = await request(limited).post("/waitlist/signup").send({ email: "two@example.com" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatch(/too many/i);
  });
});

describe("GET /waitlist/count", () => {
  it("returns { total } reflecting the number of signups", async () => {
    const repo = new FakeWaitlistRepo();
    const app = buildApp(repo);

    expect((await request(app).get("/waitlist/count")).body).toEqual({ total: 0 });

    await request(app).post("/waitlist/signup").send({ email: "a@example.com" });
    await request(app).post("/waitlist/signup").send({ email: "b@example.com" });
    await request(app).post("/waitlist/signup").send({ email: "a@example.com" }); // dup, no increment

    const res = await request(app).get("/waitlist/count");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 2 });
  });

  it("is not rate-limited", async () => {
    const repo = new FakeWaitlistRepo();
    const app = buildApp(repo, { rateLimit: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 5; i++) {
      const r = await request(app).get("/waitlist/count");
      expect(r.status).toBe(200);
    }
  });

  it("a repo failure surfaces as 500", async () => {
    const failing: WaitlistRepository = {
      signup: async () => ({ signup_number: 1, created: true }),
      count: async () => {
        throw new Error("count failed");
      },
    };
    const res = await request(buildApp(failing)).get("/waitlist/count");
    expect(res.status).toBe(500);
  });
});

describe("createRateLimiter (unit)", () => {
  function fakeReqRes(ip: string) {
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k.toLowerCase()] = v;
      },
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    return { req: { ip } as any, res };
  }

  it("allows `max` per window, then 429s, then resets after windowMs", () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter({ windowMs: 1_000, max: 2 });
      const hits: number[] = [];
      const run = (ip: string) => {
        const { req, res } = fakeReqRes(ip);
        let passed = false;
        limiter(req, res, () => {
          passed = true;
        });
        hits.push(passed ? 200 : res.statusCode);
      };

      run("1.1.1.1");
      run("1.1.1.1");
      run("1.1.1.1"); // 3rd → blocked
      expect(hits).toEqual([200, 200, 429]);

      // a different IP has its own bucket
      const other = fakeReqRes("2.2.2.2");
      let otherPassed = false;
      limiter(other.req, other.res, () => (otherPassed = true));
      expect(otherPassed).toBe(true);

      vi.advanceTimersByTime(1_001);
      run("1.1.1.1"); // window elapsed → allowed again
      expect(hits[hits.length - 1]).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sets Retry-After on a 429", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const a = fakeReqRes("9.9.9.9");
    limiter(a.req, a.res, () => {});
    const b = fakeReqRes("9.9.9.9");
    limiter(b.req, b.res, () => {});
    expect(b.res.statusCode).toBe(429);
    expect(Number(b.res.headers["retry-after"])).toBeGreaterThan(0);
  });
});
