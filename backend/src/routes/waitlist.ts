import { Router, type RequestHandler } from "express";
import { createRateLimiter } from "../lib/rate-limit";
import { requireAuth, requireDeveloper } from "../lib/auth";
import { supabaseWaitlist, type WaitlistRepository } from "../lib/waitlist-repo";

/**
 * Public, unauthenticated waitlist capture for the /waitlist campaign page,
 * plus developer-only test tooling.
 *
 *   POST /waitlist/signup        { email }   -> 201 { signup_number }  (new)
 *                                               200 { signup_number }  (already on list — idempotent)
 *   GET  /waitlist/count                     -> 200 { total }          (GENUINE signups only)
 *
 *   POST /waitlist/test-signup   { email }   -> 201 { test_signup }    (developer/admin only)
 *   POST /waitlist/test-cleanup             -> 200 { deleted }        (developer/admin only)
 *   GET  /waitlist/stats                    -> 200 { real, test, total } (developer/admin only)
 *
 * The public endpoints are standalone from the users/transfers/balances schema
 * — their own table, no auth, no FKs. POST /signup is IP rate-limited. The test
 * endpoints write to a SEPARATE table (`waitlist_test_signups`): they never
 * assign a `signup_number`, never touch `waitlist_counter`, and never appear in
 * `GET /waitlist/count`.
 */

// Same permissive shape the frontend and the rest of the backend use.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321 max; also stops someone POSTing a megabyte "email".
const MAX_EMAIL_LENGTH = 254;

// A real visitor signs up once. 5 attempts/minute/IP leaves room for a fat-
// fingered retry while blunting a naive abuse script.
const SIGNUP_RATE_LIMIT = { windowMs: 60_000, max: 5 };

function validEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

export function createWaitlistRouter(
  deps: {
    repo?: WaitlistRepository;
    signupRateLimiter?: RequestHandler;
    /** Guard for the developer-only test endpoints. Defaults to requireAuth → requireDeveloper. */
    developerGuard?: RequestHandler;
  } = {}
): Router {
  const repo = deps.repo ?? supabaseWaitlist;
  const signupRateLimiter = deps.signupRateLimiter ?? createRateLimiter(SIGNUP_RATE_LIMIT);
  const developerGuard: RequestHandler =
    deps.developerGuard ??
    ((req, res, next) => requireAuth(req, res, () => requireDeveloper(req, res, next)));

  const router = Router();

  router.post("/signup", signupRateLimiter, async (req, res) => {
    const raw = (req.body ?? {}).email;
    if (typeof raw !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    const email = raw.trim().toLowerCase();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    try {
      const { signup_number, created } = await repo.signup(email);
      return res.status(created ? 201 : 200).json({ signup_number });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/count", async (_req, res) => {
    try {
      const total = await repo.count();
      return res.json({ total });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * Developer-only throwaway signup. Server-enforced role (developerGuard →
   * DB `access_role`); the client cannot supply a role or an `is_test` flag.
   * Writes to `waitlist_test_signups` only.
   */
  router.post("/test-signup", developerGuard, async (req, res) => {
    const email = validEmail((req.body ?? {}).email);
    if (!email) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    const note = typeof (req.body ?? {}).note === "string" ? (req.body.note as string).slice(0, 500) : null;

    try {
      const test_signup = await repo.testSignup(email, {
        createdBy: req.authUser?.id ?? null,
        note,
      });
      return res.status(201).json({ test_signup });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Developer-only: delete every test signup. Never touches genuine rows or the counter. */
  router.post("/test-cleanup", developerGuard, async (_req, res) => {
    try {
      const { deleted } = await repo.testCleanup();
      return res.json({ deleted });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Developer-only: genuine vs test counts (public `GET /count` stays genuine-only). */
  router.get("/stats", developerGuard, async (_req, res) => {
    try {
      const { real, test } = await repo.stats();
      return res.json({ real, test, total: real + test });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}

export const waitlistRouter = createWaitlistRouter();
