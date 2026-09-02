import { ACCESS_GRANT_COOKIE } from "./mode";

/**
 * Client-side helpers for the `kobo_access` cookie that carries the signed
 * developer access grant to `proxy.ts`. The cookie value is opaque and
 * server-signed (see backend/src/lib/access-grant.ts) — the browser only
 * stores and forwards it, it cannot forge one. Not `HttpOnly` (JS sets it),
 * `SameSite=Lax`, `Secure` on HTTPS. Host-only: it never reaches the API
 * origin (api.kobopayments.com), only the Next server on the app origin.
 */

const isBrowser = typeof document !== "undefined";

export function setAccessGrantCookie(grant: string, ttlSeconds: number): void {
  if (!isBrowser) return;
  const maxAge = Math.max(60, Math.floor(ttlSeconds));
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCESS_GRANT_COOKIE}=${encodeURIComponent(grant)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearAccessGrantCookie(): void {
  if (!isBrowser) return;
  document.cookie = `${ACCESS_GRANT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Whether this browser currently holds a grant cookie. Presence only — the
 * cryptographic check happens server-side in the proxy. Used for the
 * `AuthGate` UX branch (belt to the proxy's braces), never as an enforcement
 * boundary.
 */
export function hasAccessGrantCookie(): boolean {
  if (!isBrowser) return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${ACCESS_GRANT_COOKIE}=`) && c.length > ACCESS_GRANT_COOKIE.length + 1);
}
