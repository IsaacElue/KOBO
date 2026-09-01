import { Router, type RequestHandler } from "express";
import { createRateLimiter } from "../lib/rate-limit";
import { supabaseWaitlist, type WaitlistRepository } from "../lib/waitlist-repo";

/**
 * Public, unauthenticated waitlist capture for the /waitlist campaign page.
 *
 *   POST /waitlist/signup  { email }        -> 201 { signup_number }  (new)
 *                                              200 { signup_number }  (already on list — idempotent)
 *   GET  /waitlist/count                    -> 200 { total }
 *
 * Standalone from the users/transfers/balances schema — its own table, no auth,
 * no FKs. POST is IP rate-limited (public endpoint, no login gate).
 */

// Same permissive shape the frontend and the rest of the backend use.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321 max; also stops someone POSTing a megabyte "email".
const MAX_EMAIL_LENGTH = 254;

// A real visitor signs up once. 5 attempts/minute/IP leaves room for a fat-
// fingered retry while blunting a naive abuse script.
const SIGNUP_RATE_LIMIT = { windowMs: 60_000, max: 5 };

export function createWaitlistRouter(
  deps: { repo?: WaitlistRepository; signupRateLimiter?: RequestHandler } = {}
): Router {
  const repo = deps.repo ?? supabaseWaitlist;
  const signupRateLimiter = deps.signupRateLimiter ?? createRateLimiter(SIGNUP_RATE_LIMIT);

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

  return router;
}

export const waitlistRouter = createWaitlistRouter();
