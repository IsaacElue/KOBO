/**
 * Waitlist client. Talks to the real backend
 * (`POST /waitlist/signup`, `GET /waitlist/count`) when `NEXT_PUBLIC_KOBO_API_URL`
 * is set; otherwise runs a local mock so the campaign page still works with no
 * backend.
 *
 * `signup_number` is the exact position the DB assigned — this client never
 * invents or estimates it. The mock derives a *stable* number from the email
 * (same email → same number) so a no-backend preview isn't obviously random,
 * and stores it locally like the real path does.
 */

import { API_URL, isMockMode } from "@/lib/kobo/config";
import type {
  RememberedSignup,
  WaitlistCountResponse,
  WaitlistSignupResponse,
} from "./types";

export class WaitlistError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** True while there's no waitlist backend configured (shares the app's one flag). */
export function isWaitlistMockMode(): boolean {
  return isMockMode();
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

const MOCK_LATENCY_MS = 450;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stable, email-derived number for the no-backend mock (never random per call). */
function mockSignupNumber(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 131 + email.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % 4000);
}

/**
 * POST /waitlist/signup — join (or re-confirm) the list. Idempotent: the same
 * email always resolves to the same `signup_number`. Persists it locally so a
 * reload shows the joined state without another request.
 */
export async function joinWaitlist(email: string): Promise<WaitlistSignupResponse> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    throw new WaitlistError("That doesn't look like an email address.");
  }

  if (!isMockMode()) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/waitlist/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
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
    writeRemembered({ email: trimmed, ...signup });
    return signup;
  }

  await wait(MOCK_LATENCY_MS);
  const existing = readRemembered();
  const signup_number =
    existing && existing.email === trimmed ? existing.signup_number : mockSignupNumber(trimmed);
  writeRemembered({ email: trimmed, signup_number });
  return { signup_number };
}

/**
 * GET /waitlist/count — total signups so far. Returns `null` when there's no
 * backend to ask (the page doesn't currently render this, but the client
 * mirrors the full contract).
 */
export async function getWaitlistCount(): Promise<number | null> {
  if (isMockMode()) return null;
  try {
    const res = await fetch(`${API_URL}/waitlist/count`);
    if (!res.ok) return null;
    const body = (await res.json()) as WaitlistCountResponse;
    return typeof body.total === "number" ? body.total : null;
  } catch {
    return null;
  }
}
