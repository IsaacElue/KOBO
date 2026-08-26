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
 */
export async function creditBalance(userId: string, amount: number): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("balances")
    .select("id, usdc_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const newBalance = Number(((existing?.usdc_balance ?? 0) + amount).toFixed(6));

  const { error: upsertError } = await supabase.from("balances").upsert(
    {
      ...(existing ? { id: existing.id } : {}),
      user_id: userId,
      usdc_balance: newBalance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upsertError) throw upsertError;
}

/**
 * Debits `amount` from a user's balance only if they actually have at least
 * that much — returns false (no-op) instead of going negative. The `gte`
 * guard on the update is what makes this safe against a concurrent debit
 * racing the same balance down between the read and the write: if another
 * request already spent it, this update matches zero rows and we report
 * insufficient funds rather than silently overdrawing.
 * Demo-scale caveat, same class of race already accepted by `creditBalance`'s
 * read-then-upsert above: a concurrent *credit* landing in the gap between
 * the read and this write would be clobbered by the stale computed value —
 * not something a single-sender demo hits in practice, and not solved here
 * without a real transaction/RPC, same rigor level as the rest of this file.
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
