/**
 * Waitlist API contract — the request/response shapes a real backend would
 * expose for the post-Demo-Day hype campaign. There is NO backend yet; the mock
 * implementations live in ./api.ts. These types are the seam: when a real
 * service lands, only ./api.ts changes.
 */

/** POST /waitlist */
export interface JoinWaitlistRequest {
  email: string;
}

/** POST /waitlist response — where the new signup landed + their share code. */
export interface JoinWaitlistResponse {
  /** 1-indexed position in line at the moment of joining. */
  rank: number;
  /** Short code that forms the referral link `/waitlist?ref=<referralCode>`. */
  referralCode: string;
}

/** GET /waitlist/status?ref=<referralCode> */
export interface WaitlistStatusResponse {
  /** Current effective position — the join rank minus spots earned from referrals. */
  rank: number;
  /** How many people have joined through this person's referral link. */
  referralCount: number;
  /** Positions moved up the queue because of those referrals. */
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
