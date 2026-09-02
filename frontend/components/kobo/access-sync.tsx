"use client";

import { useEffect } from "react";
import { API_URL, isMockMode } from "@/lib/kobo/config";
import { getStoredAuth, getValidAccessToken, onAuthChange } from "@/lib/kobo/auth";
import { setAccessGrantCookie, clearAccessGrantCookie } from "@/lib/access/grant-cookie";

/**
 * Keeps the `kobo_access` cookie (the signed developer access grant that
 * `proxy.ts` checks) in sync with the current session. Renders nothing; mounted
 * once in the root layout so it runs on every page — including /waitlist — so a
 * logged-in developer's grant is refreshed wherever they land, and their next
 * navigation to a gated route (/, /landing, the app) passes the proxy.
 *
 *   session + developer/admin role  -> GET /auth/access returns a `grant`; set the cookie
 *   session + normal user           -> `grant` is null; clear the cookie
 *   no session / logout / mock mode  -> clear the cookie
 *
 * The role decision is 100% server-side (DB `access_role`); this component only
 * transports the opaque token the API issues.
 */
export function AccessSync() {
  useEffect(() => {
    if (isMockMode() || !API_URL) return;

    let cancelled = false;

    async function sync() {
      const stored = getStoredAuth();
      if (!stored) {
        clearAccessGrantCookie();
        return;
      }
      try {
        const token = await getValidAccessToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API_URL}/auth/access`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { grant?: string | null; grant_ttl_seconds?: number };
        if (cancelled) return;
        if (body.grant) {
          setAccessGrantCookie(body.grant, body.grant_ttl_seconds ?? 3600);
        } else {
          clearAccessGrantCookie();
        }
      } catch {
        /* offline / API down — leave any existing cookie to expire on its own */
      }
    }

    void sync();
    // Re-sync when the session changes (login, logout, refresh, cross-tab).
    const unsub = onAuthChange(() => void sync());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return null;
}
