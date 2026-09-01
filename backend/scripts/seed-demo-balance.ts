import "dotenv/config";
import { supabase } from "../src/lib/supabase";
import { creditBalance, getBalance } from "../src/lib/balances";

/**
 * seed-demo-balance.ts — DEV / DEMO UTILITY ONLY.
 *
 * Credits a devnet demo account's Kobo balance directly, through the same
 * atomic `creditBalance()` primitive the real funding webhook uses. It does
 * NOT create or touch a `funding_requests` row, does NOT mark any provider
 * settlement as confirmed, and does NOT touch Solana or the webhook path — it
 * only writes the internal `balances` ledger row, exactly as a confirmed
 * top-up would. There is no on-chain USDC backing the credited amount; this
 * is a demo shortcut so the send flow can be shown without a live provider
 * settlement.
 *
 * Run it once, against the deployed devnet environment, to give the
 * known-good demo account a starting balance.
 *
 * Usage:
 *   tsx scripts/seed-demo-balance.ts <user_id> [amount_usdc]
 *
 *   <user_id>      required — the `users.id` of the demo sender (from
 *                  `POST /auth/signup`, or the Supabase dashboard). No
 *                  default: the account is never chosen implicitly.
 *   [amount_usdc]  optional — defaults to 500. Must be > 0 and <= 100000.
 *
 * Environment guard: refuses to run when `SOLANA_RPC_URL` points at mainnet —
 * this utility fabricates balance with no on-chain backing and must never run
 * against a production/mainnet deployment.
 */

const DEFAULT_AMOUNT_USDC = 500;
const MAX_AMOUNT_USDC = 100_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const userId = process.argv[2];
  const amountArg = process.argv[3];

  if (!userId) {
    throw new Error(
      "Usage: tsx scripts/seed-demo-balance.ts <user_id> [amount_usdc]\n" +
        "  <user_id> is required — this utility never picks an account on its own."
    );
  }
  if (!UUID_RE.test(userId)) {
    throw new Error(`user_id '${userId}' is not a valid UUID`);
  }

  const amount =
    amountArg === undefined ? DEFAULT_AMOUNT_USDC : Number(amountArg);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `amount_usdc must be a positive number (got '${amountArg}')`
    );
  }
  if (amount > MAX_AMOUNT_USDC) {
    throw new Error(
      `amount_usdc ${amount} exceeds the ${MAX_AMOUNT_USDC} safety cap for this demo utility`
    );
  }

  // Devnet-only guard — see the doc comment above.
  const rpc = (process.env.SOLANA_RPC_URL || "").toLowerCase();
  if (rpc.includes("mainnet")) {
    throw new Error(
      `SOLANA_RPC_URL looks like mainnet ('${process.env.SOLANA_RPC_URL}'). ` +
        "seed-demo-balance.ts is a devnet demo utility and refuses to run against mainnet."
    );
  }

  // Confirm the account exists before crediting — fail loudly on a typo'd id
  // rather than creating a balances row for a non-existent user.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error(`No users row found for id ${userId}`);

  const before = await getBalance(userId);
  await creditBalance(userId, amount);
  const after = await getBalance(userId);

  console.log(
    "Demo balance seeded (internal ledger only — no funding request, no provider settlement, no Solana tx):"
  );
  console.log(`  user:     ${user.id} (${user.name}, role=${user.role})`);
  console.log(`  credited: ${amount.toFixed(6)} USDC`);
  console.log(
    `  balance:  ${before.toFixed(6)} -> ${after.toFixed(6)} USDC`
  );
}

main().catch((err) => {
  console.error("seed-demo-balance failed:");
  console.error(err);
  process.exit(1);
});
