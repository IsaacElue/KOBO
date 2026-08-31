/**
 * Crossmint Onramp — staging proof-of-concept funding rail.
 *
 * Deliberately separate from `lib/crossmint.ts` (which is the Wallets API,
 * used only for recipient wallet provisioning). This module talks to a
 * completely different Crossmint API family — Orders
 * (docs.crossmint.com/onramp/quickstarts/react,
 * docs.crossmint.com/onramp/overview) — and has nothing to do with
 * recipients or MPC wallets.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STAGING POC ONLY. Does not touch MoonPay/Transak. Not wired into any
 * frontend flow yet (see the feasibility-spike report's blocker: the exact
 * Onramp webhook contract could not be verified — see routes/webhooks.ts,
 * "crossmint webhook NOT implemented" section). This module only covers
 * order *creation* — the side proven end-to-end by the staging spike.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * POOLED WALLET LINKING (KOBO — CROSSMINT RAIL IMPLEMENTATION, Step 3):
 * Crossmint requires an external destination wallet to be linked to a
 * Crossmint "user" (owner locator) before any order can target it
 * (docs.crossmint.com/onramp/quickstarts/react: "Before creating an onramp
 * order to external wallets, you must link the wallet to a Crossmint user
 * using the Link External Wallet API"). This is a ONE-TIME setup per wallet,
 * not a per-order step — confirmed empirically during the feasibility spike:
 * a SECOND, never-linked payer email successfully created an order
 * targeting the SAME already-linked pooled wallet with no relink call
 * (HTTP 201). Linking is exclusive (one wallet -> one owner locator;
 * attempting to relink to a different locator returns 409 "This wallet is
 * already linked to a different user") — which is exactly why this module
 * never calls the link endpoint from the funding-request path. Real payers'
 * `payment.receiptEmail` is unrelated to wallet ownership; only the
 * `recipient.walletAddress` field needs to be an already-linked address.
 *
 * KOBO's pooled devnet wallet (`lib/solana.ts` backendWallet) is ALREADY
 * linked in Crossmint staging, as a direct, disclosed side effect of the
 * feasibility spike's probe script — under the throwaway test locator
 * `email:kobo-crossmint-spike+1788193043083@example.com` (staging-only,
 * harmless). `ensurePooledWalletLinked` below is idempotent (get-then-link,
 * same idiom as `lib/crossmint.ts`'s `resolveRecipientWallet`) so re-running
 * it is always safe, but it is NOT called anywhere in the order-creation
 * path — call it manually, once, only if the pooled wallet ever changes.
 */

import crypto from "crypto";
import { backendWallet } from "./solana";

const API_KEY = process.env.CROSSMINT_API_KEY;
if (!API_KEY) {
  throw new Error("Missing CROSSMINT_API_KEY in .env");
}
if (!API_KEY.startsWith("sk_staging_")) {
  // This module is staging-POC-only by explicit founder decision — refuse to
  // run against a production key rather than silently working.
  throw new Error(
    "lib/crossmint-onramp.ts is staging-only (Founder Protocol: no production/KYB work). " +
      "CROSSMINT_API_KEY does not look like a staging key (sk_staging_...)."
  );
}

const API_BASE_URL = process.env.CROSSMINT_API_BASE_URL || "https://staging.crossmint.com/api";
const USERS_PATH = "/2025-06-09/users";
const ORDERS_PATH = "/2022-06-09/orders";

// Same devnet USDC mint Kobo's own Solana settlement code already uses
// (lib/solana.ts USDC_MINT) — confirmed identical via the feasibility
// spike's empirical order (executionParams.mintHash matched exactly).
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// The Crossmint user locator that owns the link to KOBO's pooled wallet —
// see the module doc comment above. Overridable only for a future relink
// (e.g. after an intentional wallet rotation); do not change this casually.
const POOLED_WALLET_OWNER_EMAIL =
  process.env.CROSSMINT_POOLED_WALLET_OWNER_LOCATOR_EMAIL ||
  "kobo-crossmint-spike+1788193043083@example.com";

function ownerLocator(): string {
  return `email:${POOLED_WALLET_OWNER_EMAIL}`;
}

export interface CrossmintOnrampParams {
  /** EUR amount the sender is funding with. */
  amountEur: number;
  /**
   * Pre-computed USDC estimate (routes/funding.ts already derives this via
   * getMarketRate for the funding_requests row) — reused here rather than
   * re-fetching a rate, since Crossmint's order body wants the crypto-side
   * amount (`lineItems[].executionParameters.amount`), not a fiat amount.
   */
  amountUsdc: number;
  /** Correlation id — a `funding_requests.id`. Stored as onramp_session_id
   * alongside Crossmint's own orderId (see routes/funding.ts); Crossmint's
   * order-creation body has no free-text external-reference field, so
   * correlation relies on storing orderId at creation time, same fallback
   * pattern already used for Transak sessions in routes/webhooks.ts. */
  reference: string;
  /** Identifies the paying end-user to Crossmint (KYC, receipt). Falls back
   * to a synthetic per-request address when the real sender has none on
   * file yet — Kobo senders aren't required to have verified emails today. */
  payerEmail: string;
}

export interface CrossmintOnrampResult {
  /** Crossmint's own order id — store as funding_requests.onramp_session_id. */
  orderId: string;
  /** Needed client-side to mount Crossmint's embedded checkout SDK. Treat
   * like a bearer credential for this one order — never log the full value. */
  clientSecret: string;
  /** "requires-kyc" | "awaiting-payment" | "requires-recipient-verification" | ... */
  paymentStatus: string;
  /** Present only when paymentStatus is "requires-kyc". */
  kyc: { provider: string; inquiryId: string } | null;
}

interface CrossmintOrderResponse {
  clientSecret: string;
  order: {
    orderId: string;
    payment: {
      status: string;
      preparation?: { kyc?: { provider: string; inquiryId: string } };
    };
  };
}

/**
 * Get-or-link the pooled wallet to its designated owner locator. Idempotent:
 * a GET-equivalent isn't exposed by Crossmint's API for this resource, so
 * this treats a 409 ("already linked to a different user") specially — if
 * the 409 is because it's linked to *this* module's own owner locator
 * already, that's success, not an error. NOT called anywhere in the
 * order-creation path (see module doc comment) — exported for one-time
 * manual use only, e.g. after a deliberate pooled-wallet rotation.
 */
export async function ensurePooledWalletLinked(): Promise<{ alreadyLinked: boolean }> {
  const walletAddress = backendWallet.publicKey.toBase58();
  const res = await fetch(
    `${API_BASE_URL}${USERS_PATH}/${encodeURIComponent(ownerLocator())}/linked-wallets/${walletAddress}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY! },
      body: JSON.stringify({ chain: "solana" }),
    }
  );
  if (res.ok) return { alreadyLinked: false };
  if (res.status === 409) {
    const body = await res.text();
    if (body.includes("already linked to a different user")) {
      throw new Error(
        `Pooled wallet ${walletAddress} is linked to a DIFFERENT Crossmint user than ` +
          `${ownerLocator()} — this is a real conflict, not idempotent success. ` +
          `Resolve manually before relying on this rail.`
      );
    }
    // Some other 409 shape — most likely "already linked to THIS user".
    return { alreadyLinked: true };
  }
  throw new Error(`Crossmint link-wallet failed: ${res.status} ${await res.text()}`);
}

/**
 * Creates a Crossmint Onramp order targeting KOBO's pooled devnet wallet.
 * Mirrors the shape proven by the feasibility spike's empirical probe
 * exactly (docs.crossmint.com/onramp/quickstarts/react + confirmed live).
 *
 * Does NOT poll for completion, does NOT handle `requires-recipient-
 * verification` (only reachable above a $1,000/order or 30-day-volume
 * threshold — out of scope for a small-amount staging POC), and does NOT
 * complete KYC or payment — those are the frontend/founder's job. This is
 * order creation only, same division of responsibility as MoonPay/Transak's
 * createOnrampSession.
 */
export async function createOnrampSession(
  params: CrossmintOnrampParams
): Promise<CrossmintOnrampResult> {
  const walletAddress = backendWallet.publicKey.toBase58();

  const res = await fetch(`${API_BASE_URL}${ORDERS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY! },
    body: JSON.stringify({
      lineItems: [
        {
          tokenLocator: `solana:${DEVNET_USDC_MINT}`,
          executionParameters: { mode: "exact-in", amount: String(params.amountUsdc) },
        },
      ],
      payment: { method: "card", receiptEmail: params.payerEmail, currency: "eur" },
      recipient: { walletAddress },
    }),
  });

  if (!res.ok) {
    throw new Error(`Crossmint create-order failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as CrossmintOrderResponse;
  if (!body?.order?.orderId || !body?.clientSecret) {
    throw new Error(`Crossmint create-order response missing orderId/clientSecret: ${JSON.stringify(body)}`);
  }

  return {
    orderId: body.order.orderId,
    clientSecret: body.clientSecret,
    paymentStatus: body.order.payment.status,
    kyc: body.order.payment.preparation?.kyc
      ? {
          provider: body.order.payment.preparation.kyc.provider,
          inquiryId: body.order.payment.preparation.kyc.inquiryId,
        }
      : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * WEBHOOK SIGNATURE VERIFICATION — staging observation only (KOBO —
 * CROSSMINT WEBHOOK OBSERVATION / STEP 4).
 *
 * Crossmint signs webhooks via Svix (docs.crossmint.com/introduction/
 * platform/webhooks/verify-webhooks — this is Crossmint's generic,
 * platform-wide webhook signing mechanism; it is NOT Checkout-specific, so
 * it's the one piece of the webhook contract usable with confidence even
 * though the *event names/payload shape* for Onramp specifically are still
 * unverified — see routes/webhooks.ts's /crossmint route doc comment):
 *
 *   Headers: svix-id, svix-timestamp, svix-signature
 *   Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
 *   HMAC-SHA256, keyed with the base64 portion of the signing secret AFTER
 *   its `whsec_` prefix, digest base64.
 *   svix-signature carries one or more space-delimited `v1,<base64sig>`
 *   values — any match is valid (supports secret rotation).
 *   svix-timestamp is compared against system time to reject stale/replayed
 *   deliveries (same tolerance model as MoonPay's WEBHOOK_TIMESTAMP_TOLERANCE_MS).
 * ═══════════════════════════════════════════════════════════════════════ */

/** Thrown when CROSSMINT_WEBHOOK_SECRET isn't set yet — distinct from an
 * actually-invalid signature so the caller can respond 503 (not yet
 * configured) instead of 401 (rejected). Expected before the founder
 * registers the staging endpoint in Crossmint's console and copies the
 * resulting whsec_ secret into Railway. */
export class CrossmintWebhookUnconfiguredError extends Error {
  constructor() {
    super("CROSSMINT_WEBHOOK_SECRET is not set");
    this.name = "CrossmintWebhookUnconfiguredError";
  }
}

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export interface CrossmintWebhookHeaders {
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
}

/**
 * Verifies a Crossmint/Svix webhook signature. Throws
 * CrossmintWebhookUnconfiguredError if no secret is set yet, or a plain
 * Error (missing headers / stale timestamp / signature mismatch) for any
 * other rejection reason. Returns nothing on success — callers proceed to
 * parse `rawBody` themselves only after this doesn't throw.
 */
export function verifyCrossmintWebhookSignature(
  rawBody: string,
  headers: CrossmintWebhookHeaders
): void {
  const secret = process.env.CROSSMINT_WEBHOOK_SECRET;
  if (!secret) {
    throw new CrossmintWebhookUnconfiguredError();
  }

  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing svix-id/svix-timestamp/svix-signature header(s)");
  }

  const ageMs = Math.abs(Date.now() - Number(svixTimestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    throw new Error("Webhook timestamp outside tolerance (possible replay)");
  }

  const secretBytes = Buffer.from(secret.split("_").slice(1).join("_"), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  const candidates = svixSignature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((v): v is string => Boolean(v));

  const matched = candidates.some((candidate) => {
    let candidateBuf: Buffer;
    try {
      candidateBuf = Buffer.from(candidate, "base64");
    } catch {
      return false;
    }
    return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
  });

  if (!matched) {
    throw new Error("Webhook signature verification failed");
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * WEBHOOK ENVELOPE PARSING — KOBO — CROSSMINT FRONTEND INTEGRATION, Step 1.
 *
 * The envelope shape `{type, actionId, timestamp, data{orderId, payment,
 * lineItems, phase, quote}}` is KNOWN from real captured deliveries (one
 * canned Checkout test-event, one genuine orders.quote.created, two genuine
 * orders.payment.failed — all for real Onramp orders except the test-event).
 * Beyond that shape, nothing is assumed: every field read below is checked
 * for presence/type before use, and a real success event
 * (orders.payment.succeeded / orders.delivery.completed) has NEVER been
 * observed — see extractSettledUsdcAmount's doc comment.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface CrossmintWebhookEnvelope {
  type: string;
  data: {
    orderId: string;
    payment?: {
      status?: string;
      currency?: string;
      method?: string;
      failureReason?: { category?: string; code?: string; message?: string; retryPolicy?: string };
    };
    lineItems?: Array<{
      chain?: string;
      delivery?: {
        status?: string;
        recipient?: { walletAddress?: string; locator?: string };
        [key: string]: unknown;
      };
      executionParams?: { amount?: string; effectiveAmount?: number; mintHash?: string };
      [key: string]: unknown;
    }>;
    phase?: string;
    [key: string]: unknown;
  };
}

/**
 * Validates the minimum shape needed to route a webhook safely: `type` is a
 * non-empty string, `data` is an object, `data.orderId` is a non-empty
 * string. Returns null (never throws, never fabricates a shape) if any of
 * that is missing — the caller responds 400 rather than guessing at intent.
 */
export function parseCrossmintWebhookEnvelope(raw: unknown): CrossmintWebhookEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !r.type) return null;
  if (!r.data || typeof r.data !== "object") return null;
  const data = r.data as Record<string, unknown>;
  if (typeof data.orderId !== "string" || !data.orderId) return null;
  return raw as CrossmintWebhookEnvelope;
}

/**
 * Best-effort extraction of the ACTUAL settled/delivered USDC amount from a
 * success event's `data`.
 *
 * ⚠️ UNVERIFIED — no real orders.payment.succeeded / orders.delivery.completed
 * payload has ever been observed (see the Crossmint frontend integration
 * report's Step 1(c)). Every field path below is a plausible guess based on
 * the general Order object shape seen in real deliveries so far (quote-
 * created, payment-failed, and one canned Checkout example whose
 * `payment.received` field is the model for the second candidate here) —
 * NOT a confirmed contract. Deliberately does NOT fall back to the
 * pre-payment quote/executionParams target amount (`lineItems[].
 * executionParams.amount`) — that number exists on every order regardless
 * of outcome and using it here would be inventing a settled amount, exactly
 * what this function must not do. Returns null, never a guessed number,
 * when nothing here confidently represents post-settlement delivery — the
 * caller then routes to manual_review instead of crediting.
 */
export function extractSettledUsdcAmount(data: CrossmintWebhookEnvelope["data"]): number | null {
  const lineItem = data.lineItems?.[0] as Record<string, unknown> | undefined;
  const delivery = lineItem?.delivery as Record<string, unknown> | undefined;
  const payment = data.payment as Record<string, unknown> | undefined;
  const received = payment?.received as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    delivery?.deliveredAmount,
    delivery?.amount,
    received?.amount,
  ];

  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c) : typeof c === "number" ? c : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** The pooled-wallet address a success event's delivery.recipient must match. */
export function extractRecipientWallet(data: CrossmintWebhookEnvelope["data"]): string | null {
  const lineItem = data.lineItems?.[0] as Record<string, unknown> | undefined;
  const delivery = lineItem?.delivery as Record<string, unknown> | undefined;
  const recipient = delivery?.recipient as Record<string, unknown> | undefined;
  const wallet = recipient?.walletAddress;
  return typeof wallet === "string" && wallet ? wallet : null;
}
