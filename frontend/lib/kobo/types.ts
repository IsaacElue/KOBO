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
  wallet_address: string;
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
}

/** `GET /balances/:userId` response — real for both senders and recipients now. */
export interface BalanceResponse {
  usdc_balance: number;
  updated_at: string | null;
}

export type FundingStatus = "pending" | "confirmed" | "failed";

export interface CreateFundingRequest {
  sender_id: string;
  amount_eur: number;
}

/** Matches the real backend's `funding_requests` row shape (backend/src/routes/funding.ts). */
export interface FundingRecord {
  id: string;
  sender_id: string;
  amount_eur: number;
  amount_usdc: number | null;
  status: FundingStatus;
  onramp_session_id: string | null;
  onramp_reference: string | null;
  failure_reason: string | null;
  created_at: string;
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
