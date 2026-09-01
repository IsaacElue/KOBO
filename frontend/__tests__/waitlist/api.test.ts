import { afterEach, describe, expect, test } from "vitest";
import {
  EARLY_ACCESS_AT,
  REFERRAL_TIERS,
  SPOTS_PER_REFERRAL,
  getStoredReferralCode,
  getWaitlistStatus,
  hasEarlyAccess,
  isValidEmail,
  joinWaitlist,
  resetWaitlist,
  simulateReferrals,
  spotsGainedFor,
} from "@/lib/waitlist/api";

afterEach(() => {
  resetWaitlist();
});

describe("waitlist mock: pure helpers", () => {
  test("isValidEmail", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  spaced@example.com  ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  test("spotsGainedFor is 50 per referral, floored, never negative", () => {
    expect(spotsGainedFor(0)).toBe(0);
    expect(spotsGainedFor(2)).toBe(100);
    expect(spotsGainedFor(5)).toBe(250);
    expect(spotsGainedFor(-3)).toBe(0);
    expect(SPOTS_PER_REFERRAL).toBe(50);
  });

  test("early access flips at 5 referrals", () => {
    expect(hasEarlyAccess(4)).toBe(false);
    expect(hasEarlyAccess(5)).toBe(true);
    expect(EARLY_ACCESS_AT).toBe(5);
  });

  test("REFERRAL_TIERS matches the on-page copy", () => {
    expect(REFERRAL_TIERS.map((t) => [t.referrals, t.reward])).toEqual([
      [2, "jump 100 spots"],
      [5, "unlock early access"],
    ]);
  });
});

describe("waitlist mock: join + status flow", () => {
  test("joinWaitlist returns a placeholder rank in 300-2000 and a 6-char code, then persists it", async () => {
    const res = await joinWaitlist("Demo@Kobo.com");
    expect(res.rank).toBeGreaterThanOrEqual(300);
    expect(res.rank).toBeLessThanOrEqual(2000);
    expect(res.referralCode).toMatch(/^[0-9A-Z]{6}$/);
    expect(getStoredReferralCode()).toBe(res.referralCode);
  });

  test("the placeholder rank is deterministic per email, never a fresh random each call", async () => {
    const first = await joinWaitlist("stable@example.com");
    resetWaitlist();
    const again = await joinWaitlist("stable@example.com");
    expect(again.rank).toBe(first.rank);
  });

  test("re-joining with the same email is idempotent (same code + rank)", async () => {
    const first = await joinWaitlist("same@example.com");
    const second = await joinWaitlist("SAME@example.com"); // case-insensitive
    expect(second.referralCode).toBe(first.referralCode);
    expect(second.rank).toBe(first.rank);
  });

  test("getWaitlistStatus is null before joining, populated after", async () => {
    expect(await getWaitlistStatus()).toBeNull();
    const { rank } = await joinWaitlist("x@y.co");
    const status = await getWaitlistStatus();
    expect(status).toEqual({ rank, referralCount: 0, spotsGained: 0 });
  });

  test("referrals move the effective rank up by 50 each and unlock early access at 5", async () => {
    const { rank: joinRank } = await joinWaitlist("ref@erral.com");

    simulateReferrals(2);
    let status = await getWaitlistStatus();
    expect(status).toMatchObject({ referralCount: 2, spotsGained: 100 });
    expect(status!.rank).toBe(Math.max(1, joinRank - 100));

    simulateReferrals(5);
    status = await getWaitlistStatus();
    expect(status).toMatchObject({ referralCount: 5, spotsGained: 250 });
    expect(hasEarlyAccess(status!.referralCount)).toBe(true);
  });

  test("invalid email rejects", async () => {
    await expect(joinWaitlist("not-an-email")).rejects.toThrow(/email/i);
  });
});
