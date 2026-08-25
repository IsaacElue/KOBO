import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";

const KEYPAIR_PATH = path.join(__dirname, ".devnet-sender-keypair.json");
const AIRDROP_SOL = 1;
const MINT_DECIMALS = 2;
const MINT_AMOUNT = 1000; // raw units (10.00 tokens at 2 decimals)
const TRANSFER_AMOUNT = 250; // raw units (2.50 tokens at 2 decimals)

function loadOrCreateSenderKeypair(): Keypair {
  if (fs.existsSync(KEYPAIR_PATH)) {
    const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
    console.log(`Loaded existing sender keypair from ${KEYPAIR_PATH}`);
    return Keypair.fromSecretKey(new Uint8Array(secret));
  }
  const keypair = Keypair.generate();
  fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`Generated new sender keypair, saved to ${KEYPAIR_PATH}`);
  return keypair;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airdropWithRetry(
  connection: Connection,
  pubkey: Parameters<Connection["requestAirdrop"]>[0],
  solAmount: number,
  maxAttempts = 6
) {
  let delayMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Airdrop attempt ${attempt}/${maxAttempts} for ${solAmount} SOL...`);
      const signature = await connection.requestAirdrop(
        pubkey,
        solAmount * LAMPORTS_PER_SOL
      );
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature, ...latestBlockhash },
        "confirmed"
      );
      console.log(`Airdrop confirmed: ${signature}`);
      return;
    } catch (err) {
      console.warn(`Airdrop attempt ${attempt} failed: ${(err as Error).message}`);
      if (attempt === maxAttempts) {
        throw new Error(
          `Airdrop failed after ${maxAttempts} attempts. The devnet faucet is likely rate-limited; try again later.`
        );
      }
      console.log(`Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}

async function waitForMinBalance(
  connection: Connection,
  pubkey: Parameters<Connection["getBalance"]>[0],
  minLamports: number,
  timeoutMs = 30000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const balance = await connection.getBalance(pubkey);
    if (balance >= minLamports) return balance;
    await sleep(1000);
  }
  throw new Error("Timed out waiting for sender balance to reflect airdrop.");
}

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const sender = loadOrCreateSenderKeypair();
  const recipient = Keypair.generate();

  console.log(`Sender:    ${sender.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipient.publicKey.toBase58()}`);

  const existingBalance = await connection.getBalance(sender.publicKey);
  const minRequired = 0.5 * LAMPORTS_PER_SOL;
  if (existingBalance < minRequired) {
    await airdropWithRetry(connection, sender.publicKey, AIRDROP_SOL);
    await waitForMinBalance(connection, sender.publicKey, minRequired);
  } else {
    console.log(
      `Sender already has ${existingBalance / LAMPORTS_PER_SOL} SOL, skipping airdrop.`
    );
  }

  console.log("Creating throwaway SPL test mint...");
  const mint = await createMint(
    connection,
    sender, // payer
    sender.publicKey, // mint authority
    null, // freeze authority
    MINT_DECIMALS
  );
  console.log(`Mint created: ${mint.toBase58()}`);

  console.log("Creating associated token accounts...");
  const senderAta = await getOrCreateAssociatedTokenAccount(
    connection,
    sender,
    mint,
    sender.publicKey
  );
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    sender, // payer for recipient's ATA rent
    mint,
    recipient.publicKey
  );
  console.log(`Sender ATA:    ${senderAta.address.toBase58()}`);
  console.log(`Recipient ATA: ${recipientAta.address.toBase58()}`);

  console.log(`Minting ${MINT_AMOUNT} raw units to sender ATA...`);
  await mintTo(
    connection,
    sender,
    mint,
    senderAta.address,
    sender, // mint authority
    MINT_AMOUNT
  );

  console.log(`Transferring ${TRANSFER_AMOUNT} raw units to recipient ATA...`);
  const signature = await transfer(
    connection,
    sender, // payer
    senderAta.address,
    recipientAta.address,
    sender, // owner of source account
    TRANSFER_AMOUNT
  );

  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

  console.log("\n--- SPL transfer confirmed ---");
  console.log(`Signature:    ${signature}`);
  console.log(`Explorer URL: ${explorerUrl}`);
}

main().catch((err) => {
  console.error("Devnet transfer test failed:");
  console.error(err);
  process.exit(1);
});
