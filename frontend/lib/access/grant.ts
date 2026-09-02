import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify-only mirror of the API's access-grant signer
 * (backend/src/lib/access-grant.ts). Runs in `proxy.ts` (Node.js runtime) to
 * check a developer's `kobo_access` cookie offline — no DB, no network call
 * per request, as Next recommends for proxy "optimistic" checks.
 *
 * Token: `base64url(JSON payload) + "." + base64url(HMAC-SHA256(body, secret))`
 * Payload: { v:1, sub, role:"developer"|"admin", iat, exp }  (unix seconds)
 *
 * The secret is `KOBO_ACCESS_GRANT_SECRET` — the SAME value on Vercel and
 * Railway. Missing secret => every grant is rejected (fail closed: the proxy
 * keeps everyone on /waitlist).
 */

const GRANT_VERSION = 1;

export interface VerifiedGrant {
  sub: string;
  role: "developer" | "admin";
}

export function grantSecret(): string | null {
  const s = process.env.KOBO_ACCESS_GRANT_SECRET;
  return s && s.length >= 16 ? s : null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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

  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  if (!safeEqual(sig, expected)) return null;

  let payload: { v?: number; sub?: unknown; role?: unknown; exp?: unknown };
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
