import { API_URL } from "./config";
import { clearAccessGrantCookie } from "@/lib/access/grant-cookie";
import type { AuthSession, AuthUser, CreateLoginRequest, CreateSignupRequest } from "./types";

/**
 * Real auth only — every function here talks to the real `POST /auth/*`
 * endpoints (backend/src/routes/auth.ts, API_CONTRACT.md). Never called in
 * mock mode: `AuthGate` (components/kobo/auth-gate.tsx) renders `KoboApp`
 * directly when `isMockMode()`, bypassing signup/PIN entirely, so there's no
 * mock-mode branch to maintain here.
 */

const STORAGE_KEY = "kobo_auth_session";

export interface StoredAuth {
  user: AuthUser;
  session: AuthSession;
}

// Simple pub-sub, same spirit as Supabase's own `onAuthStateChange` — so
// AuthGate can react to a session change (logout, or a dead session
// discovered by a failed API call) wherever it happens, not just from its
// own button handlers.
type Listener = () => void;
let listeners: Listener[] = [];

export function onAuthChange(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function notify() {
  for (const l of listeners) l();
}

/** Reads the persisted session — real Supabase-issued tokens, stored as-is under one localStorage key, no custom format. */
export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth> | null;
    if (!parsed?.user?.id || !parsed?.session?.access_token || !parsed?.session?.refresh_token) {
      return null;
    }
    return parsed as StoredAuth;
  } catch {
    return null;
  }
}

function setStoredAuth(auth: StoredAuth) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  notify();
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  // A dead session must not leave a usable developer access grant behind.
  clearAccessGrantCookie();
  notify();
}

/**
 * Merges a partial user into the persisted session (keeping the tokens
 * untouched) and notifies listeners — so a profile edit in Settings
 * (`PATCH /auth/profile`) flows through to anything reading the stored user,
 * e.g. the header name, without a reload. No-op if there's no stored session.
 */
export function updateStoredUser(patch: Partial<AuthUser>) {
  const stored = getStoredAuth();
  if (!stored) return;
  setStoredAuth({ ...stored, user: { ...stored.user, ...patch } });
}

async function errorMessage(res: Response): Promise<string> {
  const body: { error?: string } | null = await res.json().catch(() => null);
  return body?.error ?? `Request failed: ${res.status}`;
}

/** `POST /auth/signup` — real account + linked profile row, together. Stores the returned session on success. */
export async function signup(req: CreateSignupRequest): Promise<StoredAuth> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const body: { user: AuthUser; session: AuthSession } = await res.json();
  const auth: StoredAuth = { user: body.user, session: body.session };
  setStoredAuth(auth);
  return auth;
}

/** `POST /auth/login` — returning-user path. Deliberately generic error on failure, matching the backend. */
export async function login(req: CreateLoginRequest): Promise<StoredAuth> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const body: { user: AuthUser | null; session: AuthSession } = await res.json();
  if (!body.user) throw new Error("No Kobo account is linked to this login");
  const auth: StoredAuth = { user: body.user, session: body.session };
  setStoredAuth(auth);
  return auth;
}

/** `POST /auth/logout` — revokes the session server-side (best-effort), then always clears the local copy regardless of whether the request succeeded. */
export async function logout(): Promise<void> {
  const stored = getStoredAuth();
  if (stored) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.session.access_token}` },
      });
    } catch {
      // Network error revoking server-side — still log out locally; a dead
      // local session is the important half of "logged out."
    }
  }
  clearStoredAuth();
}

/** `POST /auth/pin` — set/replace the caller's PIN. Requires a valid (possibly just-refreshed) session. */
export async function setPin(pin: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_URL}/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

/** `POST /auth/pin/verify` — success/failure only, never throws on a wrong PIN (that's a normal `false`, not an error). */
export async function verifyPin(pin: string): Promise<boolean> {
  const token = await getValidAccessToken();
  if (!token) return false;
  const res = await fetch(`${API_URL}/auth/pin/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return false;
  const body: { success: boolean } = await res.json();
  return body.success === true;
}

const REFRESH_SKEW_MS = 60_000;
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Returns a usable access token, transparently refreshing it first if it's
 * expired or about to be (via `POST /auth/refresh`, a thin proxy over
 * Supabase's own refresh grant — same as everywhere else in this file, no
 * separate expiry/rotation logic invented here). This is what makes "a
 * valid persisted session" mean something on a *returning* visit: the access
 * token is good for ~1h, so any visit after that needs this to still show
 * the PIN screen instead of falling back to full login.
 *
 * Concurrent calls (several protected requests firing at once right after
 * load) share one in-flight refresh rather than racing separate ones.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const stored = getStoredAuth();
  if (!stored) return null;

  const msUntilExpiry = stored.session.expires_at * 1000 - Date.now();
  if (msUntilExpiry > REFRESH_SKEW_MS) return stored.session.access_token;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: stored.session.refresh_token }),
        });
        if (!res.ok) {
          // Refresh token itself is dead (expired/revoked) — this session is over.
          clearStoredAuth();
          return null;
        }
        const body: { session: AuthSession } = await res.json();
        const updated: StoredAuth = { user: stored.user, session: body.session };
        setStoredAuth(updated);
        return updated.session.access_token;
      } catch {
        // A network hiccup isn't a session invalidation — keep the
        // soon-to-expire token rather than force a logout; the next call
        // retries the refresh.
        return stored.session.access_token;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Called by api.ts when a protected call 401s even with a token attached — the session is dead server-side, not just locally stale. */
export function handleUnauthorized() {
  clearStoredAuth();
}
