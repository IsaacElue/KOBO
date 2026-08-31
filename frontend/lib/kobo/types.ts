export type TransferStatus = "pending" | "onramp_complete" | "sent" | "confirmed" | "failed";

export type CurrencyCode = "EUR" | "GBP" | "USD";

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  /** Plural noun used in prose, e.g. "Euros" */
  pluralNoun: string;
  /** Conversion multiplier into EUR, since the transfers API only accepts amount_eur */
  eurRate: number;
  flagColor: string;
}

/** `GET /rate` response — a live EUR/GBP/USD -> USDC market rate, proxied from Transak's public Get Price quote. */
export interface RateResponse {
  fiat_currency: CurrencyCode;
  crypto_currency: "USDC";
  rate: number;
  updated_at: string;
}

export interface Recipient {
  id: string;
  name: string;
  initials: string;
  meta: string;
  wallet: string;
  lastSent: string;
}

export type UserRole = "sender" | "recipient";

export interface CreateUserRequest {
  name: string;
  role: UserRole;
  country: string;
  /** One of wallet_address or email is required for role: "recipient". wallet_address wins if both are set. */
  wallet_address?: string;
  /** Recipient-only. Resolved server-side to a Crossmint-provisioned Solana wallet — see API_CONTRACT.md. */
  email?: string;
}

/** Matches the real backend's `users` row shape (backend/src/routes/users.ts). */
export interface CreateUserResponse {
  id: string;
  name: string;
  role: UserRole;
  country: string;
  wallet_address: string;
  created_at: string;
}

export interface TransferHistoryItem {
  id: string;
  recipientId: string;
  reference: string;
  date: string;
  amountEur: number;
  status: "Delivered" | "Refunded";
}

export interface CreateTransferRequest {
  sender_id: string;
  recipient_id: string;
  amount_eur: number;
}

/**
 * `GET /transfers` list row — the signed-in sender's own history for the
 * Activity page. Existing `transfers` columns plus `recipient_name` (joined
 * from `users`, not a new column). Distinct from `TransferHistoryItem` (the
 * mock fixture the send screen still uses).
 */
export interface ActivityTransfer {
  id: string;
  recipient_id: string;
  recipient_name: string | null;
  amount_eur: number;
  amount_usdc: number | null;
  status: TransferStatus;
  solana_tx_signature: string | null;
  failure_reason: string | null;
  created_at: string;
}

/** One coin in `GET /market/overview` — EUR price + change + a 7-day sparkline (trend shape). */
export interface CoinSummary {
  price_eur: number;
  change_24h: number | null;
  change_7d: number | null;
  sparkline_7d: number[];
}

/** `GET /market/overview` response — CoinGecko-backed, cached server-side. */
export interface MarketOverview {
  sol: CoinSummary;
  usdc: CoinSummary;
  updated_at: string;
  /** true when the upstream refresh failed and this is the last-known-good payload. */
  stale: boolean;
}

/** Jupiter price/v3 spot price for one mint (client-side, keyless). */
export interface JupiterSpot {
  usd_price: number;
  change_24h: number | null;
}

/** `GET /transfers/:id` response — matches the real backend's `transfers` row exactly. */
export interface TransferRecord {
  id: string;
  status: TransferStatus;
  solana_tx_signature: string | null;
  amount_eur: number;
  amount_usdc: number | null;
  failure_reason: string | null;
  retry_count: number;
  onramp_session_id: string | null;
  onramp_reference: string | null;
  created_at: string;
}

/**
 * Matches the real backend response exactly (backend/src/routes/transfers.ts,
 * backend/src/routes/funding.ts — both POST /transfers and POST /funding used to
 * return this shape; only POST /funding still does, POST /transfers no longer
 * creates a Transak session at all — see lib/kobo/api.ts's `createTransfer()`).
 * One URL, valid either as a redirect target or an iframe src — the backend does
 * not distinguish "embedded" vs "redirect"; that's a frontend rendering choice.
 * See lib/kobo/onramp-transak.ts's `preferRedirectOnramp()`.
 */
export interface OnrampSession {
  sessionId: string | null;
  widgetUrl: string;
  /** Crossmint-only — undefined for MoonPay/Transak. Needed client-side to
   * mount CrossmintEmbeddedCheckout. Never logged, never persisted client-side
   * beyond the in-memory session. */
  checkoutClientSecret?: string;
  /** Crossmint-only — "requires-kyc" | "awaiting-payment" | ... */
  paymentStatus?: string;
  /** Crossmint-only, present only when paymentStatus is "requires-kyc". */
  kycInquiryId?: string;
}

/** `GET /balances/:userId` response — real for both senders and recipients now. */
export interface BalanceResponse {
  usdc_balance: number;
  updated_at: string | null;
}

/**
 * Phase 1 (Funding Rail Abstraction) added three reserved states for
 * non-instant rails — awaiting_reconciliation (SEPA) and payout_pending
 * (Stripe) aren't produced by any code path yet (no rail exists to produce
 * them); manual_review is reserved for future ambiguous-transaction handling.
 * No frontend UI branches on these yet — see API_CONTRACT.md "Resolved this
 * sync" #20.
 */
export type FundingStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "awaiting_reconciliation"
  | "manual_review"
  | "payout_pending";

/** A funding rail identifier. Only "moonpay"/"transak"/"crossmint" are
 * implemented — the others are real, reserved names the backend recognizes
 * but rejects with a 501 (see lib/onramp.ts's IMPLEMENTED_RAILS,
 * backend-side). "crossmint" is a staging POC (KOBO — CROSSMINT FRONTEND
 * INTEGRATION) — the Add Funds method picker (add-funds-dialog.tsx) sends
 * it explicitly, never via the ONRAMP_PROVIDER default. */
export type FundingRail = "moonpay" | "transak" | "crossmint" | "coinbase" | "sepa" | "stripe";

export interface CreateFundingRequest {
  sender_id: string;
  amount_eur: number;
  /**
   * The IP MoonPay observes from the browser (from `getMoonPayObservedIp()`),
   * so the backend can decide whether to IP-lock the widget URL. Optional —
   * omitted / null when the lookup failed; the backend then uses its own req.ip.
   */
  client_observed_ip?: string | null;
  /**
   * Explicit rail. The Add Funds method picker always sends this now (both
   * options — Crossmint and MoonPay) rather than relying on the backend's
   * ONRAMP_PROVIDER default.
   */
  rail?: FundingRail;
}

/** Matches the real backend's `funding_requests` row shape (backend/src/routes/funding.ts). */
export interface FundingRecord {
  id: string;
  sender_id: string;
  amount_eur: number;
  amount_usdc: number | null;
  status: FundingStatus;
  /** New in Phase 1 — which rail actually created/settled this request. */
  rail: FundingRail;
  onramp_session_id: string | null;
  onramp_reference: string | null;
  failure_reason: string | null;
  created_at: string;
}

/** `POST /funding` response's convenience top-level aliases (KOBO — CROSSMINT
 * FRONTEND INTEGRATION Step 2) — `fundingRequestId` mirrors `id`, `orderId`
 * mirrors `onramp.sessionId`. Additive; MoonPay/Transak just get `orderId: null`. */
export interface CreateFundingResponse extends FundingRecord {
  fundingRequestId: string;
  orderId: string | null;
  onramp: OnrampSession;
}

/** The `users` row for the authenticated sender — the `user` field on every `POST /auth/*` response. */
export interface AuthUser {
  id: string;
  name: string;
  role: "sender";
  country: string;
  wallet_address: string;
}

/**
 * `GET /auth/me` / `PATCH /auth/profile` response `user` — the caller's own
 * full profile. Superset of `AuthUser`: adds `email` (which lives on the
 * Supabase Auth account, not the `users` row) and `created_at` (member-since),
 * neither of which any `POST /auth/*` response includes. Settings-only.
 */
export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  country: string;
  wallet_address: string;
  email: string | null;
  created_at: string;
}

/** The `session` field on every `POST /auth/*` response — real Supabase Auth tokens, stored as-is (see lib/kobo/auth.ts). */
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface CreateSignupRequest {
  email: string;
  password: string;
  name: string;
  country: string;
  wallet_address: string;
}

export interface CreateLoginRequest {
  email: string;
  password: string;
}
