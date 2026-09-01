/**
 * ────────────────────────────────────────────────────────────────────────────
 *  MOCK WAITLIST API. There is no real backend for this yet.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `rank` here is a STABLE PLACEHOLDER, not a fabricated real position: a mock in
 * one browser has no queue to count against, so it derives a fixed number from
 * the email (same email -> same number, every reload) rather than a random one.
 * The real backend returns `count(entries ahead) + 1`, recomputed live; see the
 * BACKEND NOTES in ./types.ts. The UI labels this number "estimated" while
 * `isWaitlistMockMode()` is true. The referral count is genuinely 0 (one browser
 * can't see other people's signups); `simulateReferrals()` exists only so the
 * campaign team can screenshot the "spots gained" state.
 *
 * Swap-in plan when a backend exists: set `NEXT_PUBLIC_WAITLIST_API_URL`, then
 * replace the mock branches below with the `fetch` calls sketched in the TODOs.
 * The exported function signatures + ./types.ts shapes stay the same.
 */

import type {
  JoinWaitlistResponse,
  ReferralTier,
  WaitlistStatusResponse,
} from "./types";

const WAITLIST_API_URL = process.env.NEXT_PUBLIC_WAITLIST_API_URL;

/** True while there's no waitlist backend configured (always, for now). */
export function isWaitlistMockMode() {
  return !WAITLIST_API_URL;
}

/**
 * Referral mechanic shown on the page and used to compute `spotsGained`:
 *   "Refer 2, jump 100 spots. Refer 5, unlock early access."
 * i.e. 50 spots per referral, with an early-access flip at 5.
 */
export const SPOTS_PER_REFERRAL = 50;
export const EARLY_ACCESS_AT = 5;

export const REFERRAL_TIERS: ReferralTier[] = [
  { referrals: 2, reward: "jump 100 spots" },
  { referrals: EARLY_ACCESS_AT, reward: "unlock early access", unlocksEarlyAccess: true },
];

export function spotsGainedFor(referralCount: number): number {
  return Math.max(0, Math.floor(referralCount)) * SPOTS_PER_REFERRAL;
}

export function hasEarlyAccess(referralCount: number): boolean {
  return referralCount >= EARLY_ACCESS_AT;
}

// ── mock persistence ────────────────────────────────────────────────────────

const STORAGE_KEY = "kobo_waitlist_v1";
const MOCK_LATENCY_MS = 550;

interface StoredEntry {
  email: string;
  basePosition: number;
  referralCode: string;
  joinedAt: string;
  referralCount: number;
}

function readEntry(): StoredEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredEntry) : null;
  } catch {
    return null;
  }
}

function writeEntry(entry: StoredEntry) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* private mode / storage disabled; the in-memory response still works for this session */
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Deterministic-ish 6-char code from the email plus a little entropy. */
function makeReferralCode(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  const seed = Math.abs(h ^ Math.floor(Math.random() * 0xffffff));
  return seed.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

/**
 * PLACEHOLDER position, deterministic from the email so it never changes on
 * reload and is obviously a function of identity, not a dice roll. NOT a real
 * queue position; the backend computes the true `count(ahead) + 1`.
 */
function placeholderPosition(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 131 + email.charCodeAt(i)) | 0;
  return 300 + (Math.abs(h) % 1701); // stable 300-2000
}

// ── API ─────────────────────────────────────────────────────────────────────

export class WaitlistError extends Error {}

/**
 * POST /waitlist: join the list.
 * MOCK: returns a stable email-derived placeholder rank + generated code and
 * stashes it in localStorage.
 */
export async function joinWaitlist(email: string): Promise<JoinWaitlistResponse> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    throw new WaitlistError("That doesn't look like an email address.");
  }

  if (!isWaitlistMockMode()) {
    // TODO(real backend):
    // const res = await fetch(`${WAITLIST_API_URL}/waitlist`, {
    //   method: "POST",
    //   headers: { "content-type": "application/json" },
    //   body: JSON.stringify({ email: trimmed } satisfies JoinWaitlistRequest),
    // });
    // if (!res.ok) throw new WaitlistError(`POST /waitlist failed: ${res.status}`);
    // return (await res.json()) as JoinWaitlistResponse;
    throw new WaitlistError("Waitlist backend not wired up.");
  }

  await wait(MOCK_LATENCY_MS);

  const existing = readEntry();
  // Re-joining with the same email returns the same slot (idempotent-ish).
  if (existing && existing.email === trimmed) {
    return { rank: effectiveRank(existing), referralCode: existing.referralCode };
  }

  const entry: StoredEntry = {
    email: trimmed,
    basePosition: placeholderPosition(trimmed),
    referralCode: makeReferralCode(trimmed),
    joinedAt: new Date().toISOString(),
    referralCount: 0,
  };
  writeEntry(entry);
  // Always the derived effective position (== basePosition here, since a fresh
  // entry has 0 referrals); mirrors how the real backend never returns a raw
  // stored number.
  return { rank: effectiveRank(entry), referralCode: entry.referralCode };
}

/**
 * GET /waitlist/status: where the current visitor stands.
 * MOCK: reads the localStorage entry written by joinWaitlist().
 */
export async function getWaitlistStatus(): Promise<WaitlistStatusResponse | null> {
  if (!isWaitlistMockMode()) {
    // TODO(real backend):
    // const res = await fetch(`${WAITLIST_API_URL}/waitlist/status`, { credentials: "include" });
    // if (res.status === 404) return null;
    // if (!res.ok) throw new WaitlistError(`GET /waitlist/status failed: ${res.status}`);
    // return (await res.json()) as WaitlistStatusResponse;
    return null;
  }

  await wait(MOCK_LATENCY_MS);
  const entry = readEntry();
  if (!entry) return null;
  return {
    rank: effectiveRank(entry),
    referralCount: entry.referralCount,
    spotsGained: spotsGainedFor(entry.referralCount),
  };
}

function effectiveRank(entry: StoredEntry): number {
  return Math.max(1, entry.basePosition - spotsGainedFor(entry.referralCount));
}

// ── demo-only helpers (not used by the page's normal flow) ───────────────────

/**
 * The referral code for the current browser's signup, if any. Its own function
 * because `WaitlistStatusResponse` (the real contract) deliberately doesn't
 * carry it; the code comes back once from `joinWaitlist`, and a real client
 * would keep it from that response rather than re-fetching.
 */
export function getStoredReferralCode(): string | null {
  return readEntry()?.referralCode ?? null;
}

/** MOCK-ONLY: bump the stored referral count so the campaign team can screenshot the earned-spots state. */
export function simulateReferrals(count: number) {
  const entry = readEntry();
  if (!entry) return;
  writeEntry({ ...entry, referralCount: Math.max(0, Math.floor(count)) });
}

/** MOCK-ONLY: clear the stored signup (used by tests + "start over"). */
export function resetWaitlist() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
