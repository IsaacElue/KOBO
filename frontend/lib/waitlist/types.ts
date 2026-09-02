/**
 * Waitlist API contract — the real backend now exists
 * (`backend/src/routes/waitlist.ts`).
 *
 *   POST /waitlist/signup  { email }  ->  { signup_number }
 *       201 for a brand-new signup, 200 (same number) if the email is already
 *       on the list. `signup_number` is an immutable historical ordinal — the
 *       Nth person to join is #N, forever — assigned once by the DB inside an
 *       advisory-locked transaction (see the `waitlist_signup` function).
 *       Concurrency-safe; never estimated or fabricated.
 *
 *   GET  /waitlist/count             ->  { total }
 *       total rows in `waitlist_signups`.
 *
 * There is NO referral system. `signup_number` is the whole story.
 */

export interface WaitlistSignupRequest {
  email: string;
}

export interface WaitlistSignupResponse {
  /** Immutable 1-indexed signup ordinal (the Nth person to join is #N). */
  signup_number: number;
}

export interface WaitlistCountResponse {
  total: number;
}

/** What this browser remembers about its own signup, so a returning visitor skips the form. */
export interface RememberedSignup {
  email: string;
  signup_number: number;
}
