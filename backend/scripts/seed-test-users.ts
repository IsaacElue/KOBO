import "dotenv/config";
import { Keypair } from "@solana/web3.js";
import { supabase } from "../src/lib/supabase";
import { backendWallet } from "../src/lib/solana";

// Creates a sender + recipient test user so the /transfers -> /webhooks/onramp
// flow has real rows and a real devnet wallet to receive USDC into.
// Throwaway seed data for Day 1-2 verification, not part of the product build.

async function main() {
  const senderKeypair = Keypair.generate();
  const recipientKeypair = Keypair.generate();

  const { data: sender, error: senderError } = await supabase
    .from("users")
    .insert({
      name: "Test Sender",
      role: "sender",
      country: "IE",
      wallet_address: senderKeypair.publicKey.toBase58(),
    })
    .select()
    .single();
  if (senderError) throw senderError;

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .insert({
      name: "Test Recipient",
      role: "recipient",
      country: "NG",
      wallet_address: recipientKeypair.publicKey.toBase58(),
    })
    .select()
    .single();
  if (recipientError) throw recipientError;

  console.log("Seeded test users:");
  console.log(`Sender    id=${sender.id} wallet=${sender.wallet_address}`);
  console.log(`Recipient id=${recipient.id} wallet=${recipient.wallet_address}`);
  console.log("");
  console.log("Backend-managed wallet (needs devnet SOL for fees + devnet USDC to send):");
  console.log(backendWallet.publicKey.toBase58());
  console.log("");
  console.log("Fund via:");
  console.log("  SOL:  https://faucet.solana.com");
  console.log("  USDC: https://faucet.circle.com (select Solana Devnet)");
}

main().catch((err) => {
  console.error("Seeding failed:");
  console.error(err);
  process.exit(1);
});
