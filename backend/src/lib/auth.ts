import type { RequestHandler } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * How long a Supabase Auth (GoTrue) call may run before we stop waiting.
 * auth-js 2.112.x exposes no per-call AbortSignal, so on timeout the
 * underlying HTTP request is left to settle on its own — the point is that
 * OUR endpoint answers instead of hanging the client forever when GoTrue is
 * degraded (as during Supabase's 2026-08-28 platform incident, where
 * signInWithPassword / refreshSession / getUser hung with no response).
 */
const AUTH_CALL_TIMEOUT_MS = 12_000;

/** Client-facing message for a `503` when a Supabase Auth call times out. */
export const AUTH_SERVICE_UNAVAILABLE = "Sign-in is temporarily unavailable — please try again shortly";

/** Thrown by `withAuthTimeout` when a Supabase Auth call exceeds AUTH_CALL_TIMEOUT_MS. */
export class AuthServiceTimeoutError extends Error {
  constructor() {
    super("Supabase Auth call exceeded timeout");
    this.name = "AuthServiceTimeoutError";
  }
}

/**
 * Races a Supabase Auth call against a 12s ceiling. Resolves with the call's
 * normal result if it finishes in time — the happy path is completely
 * unchanged. Rejects with `AuthServiceTimeoutError` otherwise, so the caller
 * can return a specific `503` instead of leaving the request open.
 */
export function withAuthTimeout<T>(call: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthServiceTimeoutError()), AUTH_CALL_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(call), timeout]).finally(() => clearTimeout(timer));
}

declare global {
  namespace Express {
    interface Request {
      /** The verified Supabase Auth user for this request — set by requireAuth. */
      authUser?: User;
      /** The raw bearer token that verified as authUser — set by requireAuth, so routes needing the literal token (e.g. POST /auth/logout) don't re-parse the header. */
      authToken?: string;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️  DEV-ONLY AUTH BYPASS — NEVER ENABLE IN PRODUCTION OR DURING THE DEMO  ⚠️
 *
 *  Purpose: a temporary escape hatch so the UI can be worked on while
 *  Supabase's GoTrue (Auth) service is degraded and every real token check
 *  times out. Gated 100% on `DEV_SKIP_AUTH=true`, which lives ONLY in a local,
 *  gitignored `backend/.env` — it is not in `.env.example`, not committed, and
 *  must never be set in any deployed / staging / demo environment.
 *
 *  When on: `requireAuth` returns `next()` immediately with a seeded
 *  `authUser` (a real `auth.users` id, so `resolveKoboUser` still returns that
 *  account's REAL `users` row via PostgREST, which is unaffected by the
 *  outage). The real Supabase token check below is left completely intact —
 *  this is a pure short-circuit, fully reversible by removing one env var.
 * ═══════════════════════════════════════════════════════════════════════════ */
const DEV_SKIP_AUTH = process.env.DEV_SKIP_AUTH === "true";

/** Seeded identity injected when DEV_SKIP_AUTH is on. `id` is a real
 *  `auth.users` id (the "Isaac Elue" test account), matching the seeded
 *  session Claude Code used for earlier smoke tests. */
const DEV_BYPASS_AUTH_USER = {
  id: "e4ab56f1-197f-425c-b858-c58d0bc4d829",
  email: "elueisaac14@gmail.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-08-26T19:57:23.515Z",
} as unknown as User;

if (DEV_SKIP_AUTH) {
  console.warn(
    "⚠️  DEV_SKIP_AUTH=true — requireAuth is BYPASSED with a seeded user. " +
      "Real Supabase Auth is NOT being checked. Never run this in production or the demo."
  );
}

/**
 * Verifies the bearer token via Supabase's own `auth.getUser(token)` — the
 * standard server-side session check (round-trips to Supabase Auth to
 * confirm the token is real and unexpired), not a custom JWT scheme. 401s
 * with no further detail on any failure; never distinguishes "missing
 * header" from "expired token" from "malformed token" in the response body.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  // ⚠️ DEV BYPASS — see the loud comment block above. Off by default.
  if (DEV_SKIP_AUTH) {
    req.authUser = DEV_BYPASS_AUTH_USER;
    req.authToken = "dev-bypass";
    return next();
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  let result;
  try {
    result = await withAuthTimeout(supabase.auth.getUser(token));
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }

  const { data, error } = result;
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.authUser = data.user;
  req.authToken = token;
  next();
};

/** The `users` row linked to an authenticated Supabase Auth account, or null if signup never completed the link. */
export async function resolveKoboUser(authUserId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, country, wallet_address, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
