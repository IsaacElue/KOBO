import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

// Circle's devnet USDC mint. 6 decimals.
// DEVNET ONLY — swap for the real mainnet USDC mint address before going live.
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const USDC_DECIMALS = 6;

const BACKEND_KEYPAIR_PATH =
  process.env.BACKEND_WALLET_KEYPAIR_PATH ||
  path.join(__dirname, "..", "..", "keys", "backend-wallet.json");

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
export const connection = new Connection(RPC_URL, "confirmed");

function loadOrCreateBackendKeypair(): Keypair {
  if (fs.existsSync(BACKEND_KEYPAIR_PATH)) {
    const secret = JSON.parse(fs.readFileSync(BACKEND_KEYPAIR_PATH, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(secret));
  }
  const keypair = Keypair.generate();
  fs.mkdirSync(path.dirname(BACKEND_KEYPAIR_PATH), { recursive: true });
  fs.writeFileSync(
    BACKEND_KEYPAIR_PATH,
    JSON.stringify(Array.from(keypair.secretKey))
  );
  return keypair;
}

// Backend-managed pooled wallet. Same demo-scale approach flagged on Day 0 —
// a single custodial keypair signs all outbound transfers. Fine for now,
// not for production custody.
export const backendWallet = loadOrCreateBackendKeypair();

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Non-retryable: same input will fail the same way again (bad address,
// insufficient funds, invalid amount) — retrying wastes time and hides the
// real problem. Caller should mark the transfer 'failed' immediately.
export class NonRetryableTransferError extends Error {}

// Retryable: RPC timeout, network blip, expired blockhash — likely to
// succeed if attempted again with a fresh blockhash.
export class RetryableTransferError extends Error {}

const RETRYABLE_PATTERNS = [
  "timeout",
  "timed out",
  "econnreset",
  "econnrefused",
  "enotfound",
  "fetch failed",
  "network error",
  "socket hang up",
  "blockhash not found",
  "block height exceeded",
  "429",
  "too many requests",
  "getaddrinfo",
];

const NON_RETRYABLE_PATTERNS = [
  "insufficient",
  "non-base58",
  "invalid public key",
  "invalid publickey",
  "found no record of a prior credit", // account has never held SOL
  "insufficient funds for rent",
  "could not find account",
];

/**
 * A description that is never blank. spl-token / web3.js errors are frequently
 * thrown with an empty `.message` but a meaningful class name
 * (`TokenAccountNotFoundError`, …), and `SendTransactionError` keeps the useful
 * detail in `.logs` — so fall back to `.name` and append `.logs` when present.
 * Without this, a real failure lands in `failure_reason` as just
 * "Unclassified error: ".
 */
function describeSolanaError(err: unknown): string {
  if (!(err instanceof Error)) return String(err) || "unknown error";
  const base = err.message.trim() || err.name || "unknown error";
  const logs = (err as { logs?: string[] | null }).logs;
  return Array.isArray(logs) && logs.length ? `${base} — logs: ${logs.join(" | ")}` : base;
}

function classifySolanaError(err: unknown): Error {
  const message = describeSolanaError(err);
  const lower = message.toLowerCase();
  const name = err instanceof Error ? err.name : "";

  if (RETRYABLE_PATTERNS.some((p) => lower.includes(p))) {
    return new RetryableTransferError(message);
  }
  // spl-token throws these (name only, blank message) when a token account is
  // missing and could not be created — on our side that's the pooled backend
  // wallet having no devnet SOL to pay ATA rent + fees. Config, not transient.
  if (name === "TokenAccountNotFoundError" || name === "TokenInvalidAccountOwnerError") {
    return new NonRetryableTransferError(
      `${message} — backend USDC token account is missing/unusable; the pooled wallet likely has no devnet SOL`
    );
  }
  if (NON_RETRYABLE_PATTERNS.some((p) => lower.includes(p))) {
    return new NonRetryableTransferError(message);
  }
  // Unclassified errors default to non-retryable: fail fast and surface
  // them for a human rather than silently retrying something we don't
  // understand.
  return new NonRetryableTransferError(`Unclassified error: ${message}`);
}

/**
 * Builds, signs, and broadcasts a USDC transfer. Returns the signature as
 * soon as the network accepts the transaction — does NOT wait for
 * confirmation (see pollConfirmation for that). Throws
 * NonRetryableTransferError or RetryableTransferError so the caller can
 * decide whether to retry.
 */
export async function sendUsdcTransfer(
  recipientWalletAddress: string,
  amountUsdc: number
): Promise<string> {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new NonRetryableTransferError(
      `Invalid transfer amount: ${amountUsdc}`
    );
  }

  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(recipientWalletAddress);
  } catch {
    throw new NonRetryableTransferError(
      `Invalid recipient wallet address: ${recipientWalletAddress}`
    );
  }

  try {
    const backendAta = await getOrCreateAssociatedTokenAccount(
      connection,
      backendWallet,
      USDC_MINT,
      backendWallet.publicKey
    );

    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection,
      backendWallet, // backend pays rent for recipient's ATA if it doesn't exist
      USDC_MINT,
      recipientPubkey
    );

    const rawAmount = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));

    const backendAccount = await getAccount(connection, backendAta.address);
    if (backendAccount.amount < rawAmount) {
      throw new NonRetryableTransferError(
        `Insufficient backend wallet USDC balance: have ${backendAccount.amount}, need ${rawAmount}`
      );
    }

    const instruction = createTransferCheckedInstruction(
      backendAta.address,
      USDC_MINT,
      recipientAta.address,
      backendWallet.publicKey,
      rawAmount,
      USDC_DECIMALS
    );

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = backendWallet.publicKey;
    transaction.sign(backendWallet);

    return await connection.sendRawTransaction(transaction.serialize());
  } catch (err) {
    if (err instanceof NonRetryableTransferError || err instanceof RetryableTransferError) {
      throw err;
    }
    throw classifySolanaError(err);
  }
}

/**
 * Polls signature status with a bounded timeout instead of waiting
 * indefinitely. Returns 'confirmed' or 'timeout' — timeout is NOT a
 * failure, the transaction may still land later. Throws
 * NonRetryableTransferError only if the chain reports the transaction
 * actually failed.
 */
export async function pollConfirmation(
  signature: string,
  timeoutMs = 45000
): Promise<"confirmed" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) {
        throw new NonRetryableTransferError(
          `Transaction failed on-chain: ${JSON.stringify(status.err)}`
        );
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return "confirmed";
      }
    }
    await sleep(2000);
  }
  return "timeout";
}
