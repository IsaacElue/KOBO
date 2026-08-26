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
