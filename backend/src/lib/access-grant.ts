import crypto from "crypto";

/**
 * "Access grants" — the trusted signal that lets the Next.js proxy
 * (frontend/proxy.ts) allow a developer past `KOBO_ACCESS_MODE=waitlist`
 * gating WITHOUT a database or network round-trip on every request.
 *
 * Flow:
 *   1. `GET /auth/access` verifies the caller's Supabase session and reads
 *      their DB `access_role` (the only source of truth).
 *   2. If privileged, it calls `signGrant()` here and returns the opaque
 *      string to the browser, which stores it in the `kobo_access` cookie.
 *   3. The proxy calls `verifyGrant()` with the SAME secret
 *      (`KOBO_ACCESS_GRANT_SECRET`, shared Vercel + Railway) to check the
 *      signature and expiry offline.
 *
 * The grant is NOT an API credential — it only asserts "the bearer's account
 * had role X, verified at time iat, good until exp". Short-lived; re-minted on
 * every app load while a session exists. HMAC-SHA256, constant-time compare,
 * no dependency.
 */

export type AccessRole = "user" | "developer" | "admin";
export const PRIVILEGED_ROLES: readonly AccessRole[] = ["developer", "admin"];

export function isPrivilegedRole(role: string | null | undefined): role is "developer" | "admin" {
  return role === "developer" || role === "admin";
}

/** 12h — long enough to not interrupt a dev session, short enough that a
 *  revoked role stops working the same day without any server-side session list. */
export const GRANT_TTL_SECONDS = 12 * 60 * 60;

const GRANT_VERSION = 1;

interface GrantPayload {
  v: number;
  sub: string; // users.id
  role: "developer" | "admin";
  iat: number; // unix seconds
  exp: number; // unix seconds
}

export interface VerifiedGrant {
  sub: string;
  role: "developer" | "admin";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * The secret shared between the API (signer) and the Next proxy (verifier).
 * Missing => grants cannot be issued or trusted. Callers MUST handle null by
 * failing closed (issue no grant / allow nobody past the gate).
 */
export function grantSecret(): string | null {
  const s = process.env.KOBO_ACCESS_GRANT_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** Signs a grant for a privileged user. Returns null if no secret is configured. */
export function signGrant(
  sub: string,
  role: "developer" | "admin",
  opts: { now?: number; secret?: string | null } = {}
): string | null {
  const secret = opts.secret ?? grantSecret();
  if (!secret) return null;
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload: GrantPayload = {
    v: GRANT_VERSION,
    sub,
    role,
    iat: nowSec,
    exp: nowSec + GRANT_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(body, secret));
  return `${body}.${sig}`;
}

/**
 * Verifies signature + expiry + shape. Returns the verified subject/role, or
 * null for anything wrong (bad format, bad signature, expired, unknown
 * version/role, no secret). Never throws.
 */
export function verifyGrant(
  token: string | null | undefined,
  opts: { now?: number; secret?: string | null } = {}
): VerifiedGrant | null {
  const secret = opts.secret ?? grantSecret();
  if (!secret || !token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = b64url(hmac(body, secret));
  if (!timingSafeEqualStr(sig, expected)) return null;

  let payload: GrantPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.v !== GRANT_VERSION) return null;
  if (payload.role !== "developer" && payload.role !== "admin") return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.exp !== "number") return null;

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (nowSec >= payload.exp) return null;

  return { sub: payload.sub, role: payload.role };
}
