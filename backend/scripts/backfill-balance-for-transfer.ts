import "dotenv/config";
import { supabase } from "../src/lib/supabase";

// One-off backfill for the Day 1-2 test transfer, which was confirmed
// on-chain before the balances upsert logic existed in the webhook.
// Mirrors exactly what POST /webhooks/onramp now does on confirmation —
// does not touch Solana again, just catches up the display-layer table.

const TRANSFER_ID = process.argv[2];

async function main() {
  if (!TRANSFER_ID) {
    throw new Error("Usage: tsx scripts/backfill-balance-for-transfer.ts <transfer_id>");
  }

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select("id, recipient_id, amount_usdc, status")
    .eq("id", TRANSFER_ID)
    .maybeSingle();
  if (transferError) throw transferError;
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "confirmed") {
    throw new Error(`Transfer status is '${transfer.status}', expected 'confirmed'`);
  }

  const { data: existingBalance, error: balanceFetchError } = await supabase
    .from("balances")
    .select("id, usdc_balance")
    .eq("user_id", transfer.recipient_id)
    .maybeSingle();
  if (balanceFetchError) throw balanceFetchError;

  const newBalance = (existingBalance?.usdc_balance ?? 0) + transfer.amount_usdc;

  const { error: upsertError } = await supabase.from("balances").upsert(
    {
      ...(existingBalance ? { id: existingBalance.id } : {}),
      user_id: transfer.recipient_id,
      usdc_balance: newBalance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upsertError) throw upsertError;

  console.log(`Backfilled balance for user ${transfer.recipient_id}: ${newBalance} USDC`);
}

main().catch((err) => {
  console.error("Backfill failed:");
  console.error(err);
  process.exit(1);
});
