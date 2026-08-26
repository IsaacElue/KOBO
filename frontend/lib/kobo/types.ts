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

/** Matches the real backend's `transfers` row shape (backend/src/routes/transfers.ts). */
export interface CreateTransferResponse {
  id: string;
  status: TransferStatus;
  /** `null` at creation time — only populated once Transak's ORDER_COMPLETED webhook fires. */
  onramp_reference: string | null;
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
 * Matches the real backend response exactly (backend/src/routes/transfers.ts).
 * One URL, valid either as a redirect target or an iframe src — the backend does
 * not distinguish "embedded" vs "redirect"; that's a frontend rendering choice.
 * See lib/kobo/onramp-transak.ts's `preferRedirectOnramp()`.
 */
export interface OnrampSession {
  sessionId: string | null;
  widgetUrl: string;
}
