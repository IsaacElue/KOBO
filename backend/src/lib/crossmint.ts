/**
 * Crossmint Wallets API — recipient wallet provisioning by email.
 *
 * Solves one specific adoption barrier: `POST /users` (role: "recipient")
 * used to require the sender to already have a real Solana address to paste
 * in, which most recipients don't have. This lets a recipient be added with
 * just an email — Crossmint provisions a Solana wallet keyed off that email
 * on demand, and every future call with the same email resolves to the same
 * address (docs.crossmint.com/api-reference/wallets/create-wallet: repeat
 * calls with the same `owner` locator return `200` with the existing wallet,
 * not a new one — confirmed against Crossmint's own
 * github.com/Crossmint/regulated-payouts-quickstart, which relies on the
 * same idempotency-on-owner behavior for its treasury wallet).
 *
 * ⚠️ NOT non-custodial in practice. Crossmint's docs
 * (docs.crossmint.com/wallets/signers-and-custody) are explicit that a
 * wallet created purely server-side like this — no recipient device, no
 * recipient login — defaults to a Crossmint-held server signer ("Your
 * organization holds the signing keys on behalf of the user"). True
 * non-custodial control only starts once the recipient's own device
 * generates a signer, which requires the recipient to actually open a
 * Crossmint-authenticated surface at least once. Kobo recipients have no
 * login today (see the comment on `VALID_ROLES` in `routes/users.ts`), so
 * there's nothing for a device signer to ever attach to. Don't describe
 * this as a non-custodial wallet anywhere user-facing — the real, true
 * claim is narrower: the recipient no longer needs to already own a wallet
 * to be added.
 *
 * Kept fully separate from the sender-side MoonPay flow and the pooled
 * backend wallet (`lib/solana.ts`) — this module only ever resolves a
 * recipient's `wallet_address`. Nothing about how funds move (settlement,
 * `sendUsdcTransfer`) changes.
 *
 * Routes consume this via the thin `lib/wallet-provider.ts` abstraction
 * (`RecipientWalletProvider` / `crossmintRecipientWalletProvider`), which
 * delegates straight back to `resolveRecipientWallet` below without
 * re-normalizing the email - callers normalize first with
 * `normalizeRecipientEmail`.
 */

const API_KEY = process.env.CROSSMINT_API_KEY;

if (!API_KEY) {
  throw new Error("Missing CROSSMINT_API_KEY in .env");
}

// Staging keys are prefixed sk_staging_, production sk_production_ (Crossmint
// docs: introduction/platform/api-keys/overview). Base host follows the same
// split: staging.crossmint.com for sk_staging_ keys. The production host
// (www.crossmint.com) follows Crossmint's documented convention but wasn't
// independently exercised — Kobo is staging-only right now, so this branch is
// unverified. CROSSMINT_API_BASE_URL overrides either default if that's wrong.
const isProductionKey = API_KEY.startsWith("sk_production_");
const API_BASE_URL =
  process.env.CROSSMINT_API_BASE_URL ||
  (isProductionKey ? "https://www.crossmint.com/api" : "https://staging.crossmint.com/api");

// docs.crossmint.com/api-reference/wallets/create-wallet and .../get-wallet —
// current API version segment. Bump here if Crossmint ships a new one.
const WALLETS_PATH = "/2025-06-09/wallets";

interface CrossmintWallet {
  address: string;
  chainType: string;
  type: string;
  owner: string;
  [key: string]: unknown;
}

function ownerLocator(email: string): string {
  return `email:${email}`;
}

// GET-by-locator format: <locatorType>:<value>:<chainType> (docs.crossmint.com/
// api-reference/wallets/get-wallet).
function walletLocator(email: string): string {
  return `${ownerLocator(email)}:solana`;
}

/**
 * Get-or-create a Solana MPC wallet for a recipient's email, idempotently.
 * Explicit GET-then-POST rather than relying solely on create's 200-vs-201:
 * makes the "did this already exist" case observable/loggable, and avoids
 * ever sending a POST for an email we already know has a wallet.
 *
 * Returns the wallet's base58 Solana address — store this as
 * `users.wallet_address`, exactly as if the recipient had pasted a real
 * address themselves; nothing downstream needs to know it came from here.
 */
export async function resolveRecipientWallet(email: string): Promise<string> {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("resolveRecipientWallet: email is required");
  }

  const getResponse = await fetch(
    `${API_BASE_URL}${WALLETS_PATH}/${encodeURIComponent(walletLocator(trimmed))}`,
    { headers: { "X-API-KEY": API_KEY! } }
  );

  if (getResponse.ok) {
    const wallet = (await getResponse.json()) as CrossmintWallet;
    if (!wallet?.address) {
      throw new Error(
        `Crossmint get-wallet response missing address: ${JSON.stringify(wallet)}`
      );
    }
    return wallet.address;
  }

  if (getResponse.status !== 404) {
    throw new Error(
      `Crossmint get-wallet failed: ${getResponse.status} ${await getResponse.text()}`
    );
  }

  // 404 — no wallet for this email yet. Create one.
  const createResponse = await fetch(`${API_BASE_URL}${WALLETS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": API_KEY! },
    body: JSON.stringify({
      chainType: "solana",
      type: "mpc",
      owner: ownerLocator(trimmed),
    }),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Crossmint create-wallet failed: ${createResponse.status} ${await createResponse.text()}`
    );
  }

  const created = (await createResponse.json()) as CrossmintWallet;
  if (!created?.address) {
    throw new Error(
      `Crossmint create-wallet response missing address: ${JSON.stringify(created)}`
    );
  }
  return created.address;
}
