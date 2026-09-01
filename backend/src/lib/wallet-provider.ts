/**
 * Recipient wallet resolution by email — the thin provider abstraction over
 * `lib/crossmint.ts`.
 *
 * `POST /users` (role: "recipient") has two ways to arrive at a
 * `wallet_address`: a pasted address, or an email that gets resolved to a
 * Crossmint-provisioned Solana wallet. This module is the seam between
 * routes and the Crossmint implementation: route/factory code consumes the
 * `RecipientWalletProvider` interface, so the concrete provider can be
 * swapped (or fully mocked in tests) without routes importing
 * `lib/crossmint.ts` directly.
 *
 * Normalization contract: callers normalize the email FIRST
 * (`normalizeRecipientEmail` — trim + toLowerCase), then pass the
 * already-normalized value to
 * `crossmintRecipientWalletProvider.resolveOrCreateByEmail`. The provider
 * must NOT re-normalize internally, so a stored, normalized email
 * round-trips through the provider unchanged (and whitespace/case variants
 * of the same address always resolve to the same wallet).
 *
 * The Crossmint specifics stay in `lib/crossmint.ts` — this module holds no
 * API-key logic, hosting, or markup of its own.
 */

import { resolveRecipientWallet } from "./crossmint";

/**
 * Normalize a recipient email before storing it or comparing against it:
 * trim surrounding whitespace and lowercase the whole address. Email
 * addresses are treated as case-insensitive here (the local part
 * technically isn't, but Kobo recipients are added by a sender typing an
 * address in, and Crossmint keys wallets off the `email:<owner>` locator —
 * folding case keeps `Bob@Example.com` and `bob@example.com` resolving to
 * the same wallet and the same `users` row).
 */
export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves (get-or-create) a Solana wallet address for a recipient email.
 *
 * The email passed in MUST already be normalized (`normalizeRecipientEmail`);
 * implementations treat the value as opaque and must not re-normalize.
 */
export interface RecipientWalletProvider {
  resolveOrCreateByEmail(email: string): Promise<string>;
}

/**
 * Production implementation backed by Crossmint's Wallets API (see
 * `lib/crossmint.ts` — `resolveRecipientWallet`, the GET-then-POST
 * idempotent get-or-create flow). `resolveOrCreateByEmail` is a pure
 * delegation: no re-normalization happens here — callers normalize first.
 */
export const crossmintRecipientWalletProvider: RecipientWalletProvider = {
  resolveOrCreateByEmail: (email: string) => resolveRecipientWallet(email),
};