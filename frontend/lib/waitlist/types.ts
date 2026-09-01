/**
 * Waitlist API contract — the request/response shapes a real backend would
 * expose for the post-Demo-Day hype campaign. There is NO backend yet; the mock
 * implementations live in ./api.ts. These types are the seam: when a real
 * service lands, only ./api.ts changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  BACKEND NOTES — `rank` is a REAL, DERIVED COUNT. Never a fabricated number.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  - `rank` is not stored. On every response it is computed as
 *        rank = (number of entries currently AHEAD of this user) + 1
 *    from live queue state. Two calls a millisecond apart must agree unless the
 *    queue actually changed. No randomness anywhere in the rank path.
 *
 *  - Queue order = ascending by an "effective position key". Base key is the
 *    signup timestamp; confirmed referrals subtract from it:
 *        effectivePosition = basePosition - (confirmedReferrals * SPOTS_PER_REFERRAL)
 *    Recompute live; do not mutate a stored rank.
 *
 *  - A referral counts only once the referred email confirms/joins carrying this
 *    user's code (attributed at THEIR join, from `?ref=<referralCode>`). Dedupe
 *    by referred-email, reject self-referral, rate-limit joins per IP.
 *
 *  - `spotsGained = basePosition - currentEffectivePosition`, clamped at >= 0.
 *
 *  - A user's own referrals must only ever move `rank` toward #1, never worse.
 *    `rank` MAY drift toward #1 on its own as people ahead are admitted / drop —
 *    that is correct and expected; it must never jump around.
 *
 *  - At EARLY_ACCESS_AT (5) confirmed referrals, set an `earlyAccess` flag
 *    server-side (separate from rank).
 *
 *  The mock in ./api.ts cannot see a real queue from one browser, so it returns
 *  a STABLE placeholder (derived from the email, not random) and the UI labels
 *  it "estimated" while `isWaitlistMockMode()` is true.
 */

/** POST /waitlist */
export interface JoinWaitlistRequest {
  email: string;
}

/** POST /waitlist response — where the new signup landed + their share code. */
export interface JoinWaitlistResponse {
  /**
   * 1-indexed real position in line: count(entries ahead) + 1 at the moment of
   * joining. Derived live server-side, never a stored or fabricated value.
   */
  rank: number;
  /** Short code that forms the referral link `/waitlist?ref=<referralCode>`. */
  referralCode: string;
}

/** GET /waitlist/status?ref=<referralCode> */
export interface WaitlistStatusResponse {
  /**
   * Current real position — recomputed from live queue state on every call.
   * = basePosition - spotsGained (never below 1). Not stored.
   */
  rank: number;
  /** Confirmed signups attributed to this person's referral code. */
  referralCount: number;
  /** basePosition - currentEffectivePosition, clamped at >= 0. */
  spotsGained: number;
}

/** A referral milestone shown in the "how it works" explainer. */
export interface ReferralTier {
  referrals: number;
  /** Human copy, e.g. "jump 100 spots" or "unlock early access". */
  reward: string;
  /** Set when hitting this tier flips the early-access flag rather than moving rank. */
  unlocksEarlyAccess?: boolean;
}
