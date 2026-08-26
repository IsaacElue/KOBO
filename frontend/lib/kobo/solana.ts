const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, i) => [char, i]));

/** Decodes a base58 string to bytes, or null if it contains characters outside the alphabet. */
function decodeBase58(input: string): Uint8Array | null {
  let value = BigInt(0);
  for (const char of input) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) return null;
    value = value * BigInt(58) + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > BigInt(0)) {
    bytes.unshift(Number(value % BigInt(256)));
    value /= BigInt(256);
  }
  // Each leading '1' in base58 encodes a leading zero byte.
  for (const char of input) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

/**
 * Client-side mirror of the backend's `new PublicKey(address)` check
 * (backend/src/routes/users.ts): valid base58 charset that decodes to exactly 32
 * bytes. Same format-only check as the backend — no on-chain existence check, and
 * deliberately reimplemented here (rather than depending on @solana/web3.js) since
 * that's the only thing the frontend needs from it.
 */
export function isPlausibleSolanaAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const decoded = decodeBase58(trimmed);
  return decoded !== null && decoded.length === 32;
}

function encodeBase58(bytes: Uint8Array): string {
  let value = BigInt(0);
  for (const b of bytes) value = value * BigInt(256) + BigInt(b);

  let out = "";
  while (value > BigInt(0)) {
    const digit = Number(value % BigInt(58));
    out = BASE58_ALPHABET[digit] + out;
    value /= BigInt(58);
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out || "1";
}

/**
 * A real sender's `wallet_address` (required by `POST /auth/signup`, same
 * NOT NULL/format-checked column recipients use) is never actually read by
 * any send — funds always move from Kobo's pooled backend wallet to a
 * *recipient's* wallet (`backend/src/lib/settlement.ts` only ever reads
 * `recipient.wallet_address`), never from a sender's. Asking a new signup
 * to paste a Solana address they don't have would be real friction for zero
 * function, so this generates a random, valid-format (32 random bytes,
 * base58-encoded — same shape `isPlausibleSolanaAddress` accepts, deliberately
 * not a real derivable keypair since nothing ever needs to sign with it)
 * placeholder instead. Documented here, not hidden: if a real per-sender
 * wallet ever becomes meaningful, this is the one place that assumption lives.
 */
export function generatePlaceholderWalletAddress(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase58(bytes);
}
