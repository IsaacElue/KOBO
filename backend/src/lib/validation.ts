import { PublicKey } from "@solana/web3.js";

/** Validates base58 charset and correct 32-byte length — a format check only, no on-chain existence check. */
export function isPlausibleSolanaAddress(address: unknown): boolean {
  if (typeof address !== "string") return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
