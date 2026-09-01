/**
 * Waitlist client — talks to the real backend only.
 *
 *   joinWaitlist(email)   ->  POST {API}/waitlist/signup   { email } -> { signup_number }
 *   getWaitlistCount()    ->  GET  {API}/waitlist/count               -> { total }
 *
 * `signup_number` ALWAYS comes from the backend response. This module never
 * generates, estimates, or falls back to a locally-computed number — if the
 * request fails, `joinWaitlist` throws and the UI shows an error. The only
 * thing stored locally is the real number the server returned, so a returning
 * visitor doesn't have to re-submit.
 */

import { API_URL } from "@/lib/kobo/config";
import type {
  RememberedSignup,
  WaitlistCountResponse,
  WaitlistSignupResponse,
} from "./types";

export class WaitlistError extends Error {}

// `[^\s@]` on both sides rejects internal whitespace and requires a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

const STORAGE_KEY = "kobo_waitlist_v2";

function readRemembered(): RememberedSignup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedSignup>;
    if (typeof parsed.email === "string" && typeof parsed.signup_number === "number") {
      return { email: parsed.email, signup_number: parsed.signup_number };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRemembered(entry: RememberedSignup): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* private mode / storage disabled — the response still works for this session */
  }
}

/** This browser's own signup, if it has one — lets a returning visitor skip the form. */
export function getRememberedSignup(): RememberedSignup | null {
  return readRemembered();
}

/** Forget this browser's signup (the "use a different email" affordance). */
export function resetWaitlist(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Normalise exactly the way the backend does, so the client and server agree. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * POST /waitlist/signup — join (or re-confirm) the list. Idempotent server-side:
 * the same email always resolves to the same `signup_number` (`201` for a new
 * row, `200` if it was already on the list). Persists the returned number
 * locally so a reload shows the joined state without another request.
 */
export async function joinWaitlist(email: string): Promise<WaitlistSignupResponse> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new WaitlistError("That doesn't look like an email address.");
  }
  if (!API_URL) {
    // No backend configured — do NOT invent a number.
    throw new WaitlistError("The waitlist isn't available right now. Please try again later.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/waitlist/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalized }),
    });
  } catch {
    throw new WaitlistError("Couldn't reach the waitlist. Check your connection and try again.");
  }

  if (res.status === 429) {
    throw new WaitlistError("Too many attempts. Please wait a minute and try again.");
  }

  const body = (await res.json().catch(() => null)) as
    | (Partial<WaitlistSignupResponse> & { error?: string })
    | null;

  if (!res.ok || typeof body?.signup_number !== "number") {
    throw new WaitlistError(body?.error ?? "Something went wrong. Please try again.");
  }

  const signup = { signup_number: body.signup_number };
  writeRemembered({ email: normalized, ...signup });
  return signup;
}

/**
 * GET /waitlist/count — total signups so far. Returns `null` when there's no
 * backend to ask or the request fails (the page doesn't currently render this,
 * but the client mirrors the full contract).
 */
export async function getWaitlistCount(): Promise<number | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/waitlist/count`);
    if (!res.ok) return null;
    const body = (await res.json()) as WaitlistCountResponse;
    return typeof body.total === "number" ? body.total : null;
  } catch {
    return null;
  }
}
