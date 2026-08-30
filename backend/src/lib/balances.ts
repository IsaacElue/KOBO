import { supabase } from "./supabase";

/** Current balance for any user (sender or recipient) — 0 if no row exists yet. */
export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("balances")
    .select("usdc_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.usdc_balance ?? 0;
}

/**
 * Adds `amount` to a user's balance, creating the row if it doesn't exist yet.
 * Used both for a recipient's post-transfer credit and a sender's post-funding
 * credit (and to refund a sender if an instant send fails after debiting).
 *
 * Phase 1: made ATOMIC. Previously this was a read-then-upsert — a concurrent
 * credit landing between the read and the write was clobbered by the stale
 * computed value (the same race `debitBalanceIfSufficient` was already built
 * to survive, and the one `debitBalanceIfSufficient`'s doc comment explicitly
 * flagged as "not solved here"). Now the credit is a single
 * `INSERT ... ON CONFLICT (user_id) DO UPDATE` executed inside the Postgres
 * function `credit_balance()` (see migrations/…_add_funding_rail.sql):
 *
 *   - row exists  → `usdc_balance = usdc_balance + $amount` under the unique
 *     constraint's row lock — concurrent credits serialize, none is lost.
 *   - row missing  → inserted with $amount; if a concurrent insert won the
 *     race, the conflict path increments the winner's row instead.
 *
 * Exactly one credit lands regardless of how many concurrent credits race it.
 * `toFixed(6)` rounding is preserved (one credit's figure rounds to 6dp before
 * it is applied, matching previous behavior).
 */
export async function creditBalance(userId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc("credit_balance", {
    p_user_id: userId,
    p_amount: Number(amount.toFixed(6)),
  });
  if (error) throw error;
}

/**
 * Debits `amount` from a user's balance only if they actually have at least
 * that much — returns false (no-op) instead of going negative. The `gte`
 * guard on the update is what makes this safe against a concurrent debit
 * racing the same balance down between the read and the write: if another
 * request already spent it, this update matches zero rows and we report
 * insufficient funds rather than silently overdrawing.
 * Demo-scale caveat: a concurrent *credit* landing in the gap between
 * the read and this write would be clobbered by the stale computed value —
 * not something a single-sender demo hits in practice, and not solved here
 * without a real transaction/RPC, same rigor level as the rest of this file
 * (creditBalance itself is now atomic, but this read-modify-write debit is
 * not yet — flagging for the money-engine-hardening phase).
 */
export async function debitBalanceIfSufficient(userId: string, amount: number): Promise<boolean> {
  const current = await getBalance(userId);
  if (current < amount) return false;

  const newBalance = Number((current - amount).toFixed(6));
  const { data, error } = await supabase
    .from("balances")
    .update({ usdc_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .gte("usdc_balance", amount)
    .select("id");
  if (error) throw error;

  return (data?.length ?? 0) > 0;
}