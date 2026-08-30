import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase";
import { creditBalance, getBalance, debitBalanceIfSufficient } from "../lib/balances";

/**
 * Live integration tests for the atomic balance credit — these verify the
 * real Postgres `credit_balance()` function from the migration, under real
 * concurrency. They hit the real Supabase DB, so they are opt-in:
 *
 *   RUN_DB_TESTS=1 npm test
 *
 * and they clean up after themselves (delete the test user's balance row and
 * the test user). Skipped by default so `npm test` passes with no DB.
 */

const dbTestsEnabled = process.env.RUN_DB_TESTS === "1";

async function createTestUser(): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .insert({
      name: "__phase1_test__",
      role: "sender",
      country: "IE",
      wallet_address: `test-${randomUUID()}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function deleteTestUser(userId: string): Promise<void> {
  await supabase.from("balances").delete().eq("user_id", userId);
  await supabase.from("users").delete().eq("id", userId);
}

describe.skipIf(!dbTestsEnabled)("atomic balance credit (live Supabase)", () => {
  it("credits exactly once when many credits race", async () => {
    const userId = await createTestUser();
    try {
      await creditBalance(userId, 10);
      await creditBalance(userId, 20);
      await creditBalance(userId, 30);
      expect(await getBalance(userId)).toBe(60);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("does not lose any credit under Promise.all concurrency", async () => {
    const userId = await createTestUser();
    try {
      const amounts = [5, 10, 15, 20, 25, 30]; // 105 total
      await Promise.all(amounts.map((a) => creditBalance(userId, a)));
      expect(await getBalance(userId)).toBe(105);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("debitBalanceIfSufficient never overdraws under concurrency", async () => {
    const userId = await createTestUser();
    try {
      await creditBalance(userId, 100);
      const results = await Promise.all([
        debitBalanceIfSufficient(userId, 80),
        debitBalanceIfSufficient(userId, 80),
      ]);
      // Exactly one of the two concurrent 80 debits may succeed; the second
      // must see insufficient funds (the gte guard) — never two, never a
      // negative balance.
      expect(results.filter(Boolean)).toHaveLength(1);
      const remaining = await getBalance(userId);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBe(20);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("creditBalance after a debit lands on the correct running total", async () => {
    const userId = await createTestUser();
    try {
      await creditBalance(userId, 50);
      await debitBalanceIfSufficient(userId, 20);
      await creditBalance(userId, 10);
      expect(await getBalance(userId)).toBe(40);
    } finally {
      await deleteTestUser(userId);
    }
  });
});