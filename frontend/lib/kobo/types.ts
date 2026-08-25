export type TransferStatus = "pending" | "onramp_complete" | "sent" | "confirmed";

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

export interface NewRecipientInput {
  name: string;
  wallet: string;
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

export interface CreateTransferResponse {
  transfer_id: string;
  status: TransferStatus;
  onramp_reference: string;
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
