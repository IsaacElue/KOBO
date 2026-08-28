import crypto from "crypto";

/**
 * MoonPay on-ramp provider. Swapped in for Transak on the Ireland/EUR sender
 * side (see KOBO_BUILD_PLAN.md "On-ramp provider"). Same job Transak's
 * `createWidgetSession` / `verifyWebhook` did: hand the frontend a widget URL,
 * then credit the sender's balance when MoonPay confirms the purchase over a
 * webhook. Pooled-custody model — real USDC lands in Kobo's backend wallet and
 * funding only moves Kobo's internal ledger.
 *
 * Unlike Transak there is no server-side "create session" call: the widget URL
 * is built and HMAC-signed here and is directly loadable. Correlation back to a
 * `funding_requests` row is MoonPay's first-class `externalTransactionId`
 * param, which we set to the funding request's own id and which is echoed on
 * every webhook payload (docs: dev.moonpay.com — On-ramp widget parameters).
 */

const PUBLISHABLE_KEY = process.env.MOONPAY_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.MOONPAY_SECRET_KEY;
const WEBHOOK_KEY = process.env.MOONPAY_WEBHOOK_KEY;

// buy.moonpay.com switches to the sandbox automatically when the apiKey is a
// pk_test_ key — there is no separate sandbox host in the current widget.
const WIDGET_BASE_URL = process.env.MOONPAY_WIDGET_BASE_URL || "https://buy.moonpay.com";

// Destination asset. Live: "usdc_sol" (USDC SPL, mint EPjF…Dt1v — confirmed via
// GET /v3/currencies, metadata.networkCode "solana"). MoonPay's sandbox does
// NOT support usdc_sol (supportsTestMode:false), so local/sandbox testing must
// set this to a test-mode Solana stablecoin — "pyusd_sol" is the closest
// stand-in (stablecoin, same SPL address format). One env flip to go live.
const CRYPTO_CURRENCY_CODE = process.env.MOONPAY_CRYPTO_CURRENCY_CODE || "usdc_sol";

// Base fiat. EUR confirmed supported (GET /v3/currencies, code "eur",
// minBuyAmount 20) with SEPA available for Ireland (GET /v4/ip_address →
// isBuyAllowed:true; buy_quote accepts paymentMethod=sepa_bank_transfer).
const BASE_CURRENCY_CODE = process.env.MOONPAY_BASE_CURRENCY_CODE || "eur";

// This account enforces "IP restriction on signed URLs": every signed widget
// URL must carry `allowedIpAddress` = the end user's public IP, or MoonPay
// rejects it with 5_PARTNERS_IP_MISSING. In production behind a proxy the
// request IP (see resolveClientIp / `trust proxy` in index.ts) is the real
// client IP. For local dev the request IP is loopback and won't match the IP
// the browser actually loads the widget from, so set this override to your
// current public IP.
const ALLOWED_IP_OVERRIDE = process.env.MOONPAY_ALLOWED_IP_OVERRIDE || "";

// Where MoonPay returns the customer after the purchase — it appends
// `transactionId` and `transactionStatus` as query params. An explicit
// MOONPAY_REDIRECT_URL wins; otherwise fall back to the first FRONTEND_ORIGIN
// entry so a normal deploy wires itself with no extra config. The Kobo
// frontend detects the return by the `transactionStatus` param and resumes the
// Add Funds overlay (see frontend components/kobo/kobo-app.tsx). Empty ⇒ no
// redirectURL param (MoonPay keeps the user on its own completion screen).
const REDIRECT_URL =
  process.env.MOONPAY_REDIRECT_URL ||
  (process.env.FRONTEND_ORIGIN || "").split(",")[0].trim();

if (!PUBLISHABLE_KEY || !SECRET_KEY || !WEBHOOK_KEY) {
  throw new Error(
    "Missing MOONPAY_PUBLISHABLE_KEY / MOONPAY_SECRET_KEY / MOONPAY_WEBHOOK_KEY in .env"
  );
}

export interface CreateOnrampSessionParams {
  amountEur: number;
  /** Kobo's pooled backend wallet — where the purchased USDC actually lands. */
  walletAddress: string;
  /** The `funding_requests.id` this session funds. Round-trips as `externalTransactionId`. */
  reference: string;
  /** End user's public IP, for MoonPay's `allowedIpAddress` enforcement. */
  userIp: string;
}

export interface CreateOnrampSessionResult {
  widgetUrl: string;
  /** MoonPay has no separate session id; correlation is `externalTransactionId`. Always null. */
  sessionId: null;
}

function isUnroutableIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, "");
  return (
    !v ||
    v === "::1" ||
    v === "127.0.0.1" ||
    v.startsWith("10.") ||
    v.startsWith("192.168.") ||
    v.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    v.startsWith("fc") ||
    v.startsWith("fd")
  );
}

/**
 * HMAC-SHA256 of the URL's query string (leading `?` included), base64, then
 * URL-encoded — MoonPay's documented widget URL signature
 * (dev.moonpay.com — URL signing). Verified against the official
 * `@moonpay/moonpay-node` SDK: it signs `new URL(url).search` identically.
 */
function signWidgetUrl(url: string): string {
  const signature = crypto
    .createHmac("sha256", SECRET_KEY!)
    .update(new URL(url).search)
    .digest("base64");
  return `${url}&signature=${encodeURIComponent(signature)}`;
}

/**
 * Builds the signed MoonPay buy-widget URL for a funding top-up. No network
 * call — returns synchronously wrapped in a Promise to keep the same shape as
 * Transak's `createWidgetSession` so `POST /funding` doesn't care which
 * provider is active.
 */
export async function createOnrampSession(
  params: CreateOnrampSessionParams
): Promise<CreateOnrampSessionResult> {
  const allowedIpAddress =
    ALLOWED_IP_OVERRIDE || (isUnroutableIp(params.userIp) ? "" : params.userIp);

  if (!allowedIpAddress) {
    throw new Error(
      "Could not determine the end user's public IP for MoonPay's allowedIpAddress " +
        "requirement (request IP is loopback/private). Behind a proxy, set TRUST_PROXY; " +
        "for local dev, set MOONPAY_ALLOWED_IP_OVERRIDE to your public IP."
    );
  }

  // Insertion order here is the order that gets signed and sent — keep it stable.
  const query = new URLSearchParams({
    apiKey: PUBLISHABLE_KEY!,
    baseCurrencyCode: BASE_CURRENCY_CODE,
    currencyCode: CRYPTO_CURRENCY_CODE,
    baseCurrencyAmount: String(params.amountEur),
    walletAddress: params.walletAddress,
    externalTransactionId: params.reference,
    allowedIpAddress,
  });
  if (REDIRECT_URL) query.set("redirectURL", REDIRECT_URL);

  const widgetUrl = signWidgetUrl(`${WIDGET_BASE_URL}?${query.toString()}`);
  return { widgetUrl, sessionId: null };
}

/** A buy (on-ramp) transaction as it appears in a MoonPay webhook `data` object. */
export interface MoonPayBuyTransaction {
  id: string;
  status:
    | "waitingPayment"
    | "pending"
    | "waitingAuthorization"
    | "completed"
    | "failed";
  /** On-chain transaction id — for Solana this is the base58 tx signature. Null until sent. */
  cryptoTransactionId: string | null;
  /** The reference we passed at widget-build time — a `funding_requests.id`. */
  externalTransactionId: string | null;
  externalCustomerId: string | null;
  walletAddress: string;
  /** Fiat the customer paid. */
  baseCurrencyAmount: number;
  /** USDC actually delivered — the real credited amount, not our pre-quote estimate. */
  quoteCurrencyAmount: number | null;
  failureReason: string | null;
  [key: string]: unknown;
}

export interface MoonPayWebhookPayload {
  type:
    | "transaction_created"
    | "transaction_updated"
    | "transaction_failed"
    | string;
  data: MoonPayBuyTransaction;
  externalCustomerId: string | null;
}

/** Max clock skew tolerated between the webhook's `t=` and now. */
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verifies a MoonPay webhook and returns its parsed payload. Throws if the
 * signature is missing, malformed, stale, or doesn't verify — the caller MUST
 * reject with 401 and MUST NOT process the body.
 *
 * MoonPay signs with the `Moonpay-Signature-V2` header
 * (`t=<unix-seconds>,s=<hex>`): HMAC-SHA256 of `"<t>.<rawBody>"`, keyed with the
 * account webhook key (`wk_...`), digest as hex
 * (dev.moonpay.com — Request signing). The raw, pre-JSON-parse body string is
 * required — `index.ts` captures it as `req.rawBody`.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined
): MoonPayWebhookPayload {
  if (!signatureHeader) {
    throw new Error("Missing Moonpay-Signature-V2 header");
  }

  let timestamp: string | undefined;
  let signature: string | undefined;
  for (const part of signatureHeader.split(",")) {
    const [prefix, value] = part.split("=");
    if (prefix?.trim() === "t") timestamp = value?.trim();
    if (prefix?.trim() === "s") signature = value?.trim();
  }
  if (!timestamp || !signature) {
    throw new Error("Malformed Moonpay-Signature-V2 header");
  }

  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    throw new Error("Webhook timestamp outside tolerance (possible replay)");
  }

  const expected = crypto
    .createHmac("sha256", WEBHOOK_KEY!)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Webhook signature verification failed");
  }

  const payload = JSON.parse(rawBody) as MoonPayWebhookPayload;
  if (!payload?.type || !payload?.data?.id) {
    throw new Error("Decoded webhook payload missing type or data.id");
  }
  return payload;
}
