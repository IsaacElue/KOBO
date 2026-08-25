import jwt from "jsonwebtoken";

const API_KEY = process.env.TRANSAK_API_KEY;
const API_SECRET = process.env.TRANSAK_API_SECRET;
const ENV = process.env.TRANSAK_ENV || "staging";
// Must match a domain registered against this API key in the Transak
// partner dashboard, or session creation is rejected. Placeholder until
// Person A confirms the real domain the widget will be embedded on.
const REFERRER_DOMAIN = process.env.TRANSAK_REFERRER_DOMAIN || "kobo.app";

if (!API_KEY || !API_SECRET) {
  throw new Error("Missing TRANSAK_API_KEY or TRANSAK_API_SECRET in .env");
}

const isStaging = ENV === "staging";
// docs.transak.com/reference/refresh-access-token
const AUTH_BASE = isStaging ? "https://api-stg.transak.com" : "https://api.transak.com";
// docs.transak.com/api/public/create-widget-url
const GATEWAY_BASE = isStaging
  ? "https://api-gateway-stg.transak.com"
  : "https://api-gateway.transak.com";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Partner access token, used both to call the widget-session API and to
 * verify webhook JWTs. Cached in memory and refreshed with a safety margin
 * before Transak's own expiry.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(`${AUTH_BASE}/partners/api/v2/refresh-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY!,
      "api-secret": API_SECRET!,
    },
    body: JSON.stringify({ apiKey: API_KEY }),
  });

  if (!response.ok) {
    throw new Error(
      `Transak refresh-token failed: ${response.status} ${await response.text()}`
    );
  }

  const body = await response.json();
  const token = body?.data?.accessToken;
  const expiresAt = body?.data?.expiresAt;

  if (!token) {
    throw new Error(`Transak refresh-token response missing accessToken: ${JSON.stringify(body)}`);
  }

  cachedAccessToken = {
    token,
    // expiresAt from Transak is a unix seconds timestamp when present;
    // fall back to a conservative 6-day cache otherwise.
    expiresAt: expiresAt ? expiresAt * 1000 : Date.now() + 6 * 24 * 60 * 60 * 1000,
  };

  return token;
}

export interface CreateWidgetSessionParams {
  amountEur: number;
  recipientWalletAddress: string;
  partnerOrderId: string;
  userIp: string;
}

export interface CreateWidgetSessionResult {
  widgetUrl: string;
  sessionId: string | null;
}

/**
 * Calls Transak's Create Widget URL / session API server-side, per their
 * mandatory migration off client-embedded query params. Returns the secure,
 * single-use widget URL (valid 5 minutes) for the frontend to load.
 */
export async function createWidgetSession(
  params: CreateWidgetSessionParams
): Promise<CreateWidgetSessionResult> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${GATEWAY_BASE}/api/v2/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": accessToken,
      "x-api-key": API_KEY!,
      "x-user-ip": params.userIp,
    },
    body: JSON.stringify({
      widgetParams: {
        apiKey: API_KEY,
        referrerDomain: REFERRER_DOMAIN,
        network: "solana",
        cryptoCurrencyCode: "USDC",
        walletAddress: params.recipientWalletAddress,
        disableWalletAddressForm: true,
        fiatAmount: params.amountEur,
        fiatCurrency: "EUR",
        partnerOrderId: params.partnerOrderId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Transak create-widget-url failed: ${response.status} ${await response.text()}`
    );
  }

  const body = await response.json();
  const widgetUrl: string | undefined = body?.data?.widgetUrl;

  if (!widgetUrl) {
    throw new Error(`Transak create-widget-url response missing widgetUrl: ${JSON.stringify(body)}`);
  }

  let sessionId: string | null = null;
  try {
    sessionId = new URL(widgetUrl).searchParams.get("sessionId");
  } catch {
    // widgetUrl not a valid URL — leave sessionId null, caller still gets the raw URL.
  }

  return { widgetUrl, sessionId };
}

export interface TransakWebhookData {
  id: string;
  status: string;
  walletAddress?: string;
  transactionHash?: string;
  cryptoAmount?: number;
  cryptoCurrency?: string;
  network?: string;
  partnerOrderId?: string;
  [key: string]: unknown;
}

export interface DecodedTransakWebhook {
  eventID: string;
  webhookData: TransakWebhookData;
  createdAt?: string;
}

/**
 * Verifies and decodes a Transak webhook payload. Transak signs the
 * webhook body as a JWT (HMAC) using the partner's access token as the
 * signing secret. Throws if the signature is invalid or expired — the
 * caller must reject with 401 and must NOT process the payload.
 *
 * The exact field name Transak puts the JWT string in wasn't confirmed
 * against a live payload (docs examples were inconsistent) — this accepts
 * body.data first, falling back to body.webhookData if that's a string.
 * Confirm against a real captured webhook once delivery is live and adjust
 * if needed.
 */
export async function verifyWebhook(body: unknown): Promise<DecodedTransakWebhook> {
  const accessToken = await getAccessToken();

  const raw =
    typeof (body as any)?.data === "string"
      ? (body as any).data
      : typeof (body as any)?.webhookData === "string"
        ? (body as any).webhookData
        : null;

  if (!raw) {
    throw new Error("Webhook payload missing signed data field");
  }

  const decoded = jwt.verify(raw, accessToken) as unknown as DecodedTransakWebhook;

  if (!decoded?.eventID || !decoded?.webhookData) {
    throw new Error("Decoded webhook payload missing eventID or webhookData");
  }

  return decoded;
}
