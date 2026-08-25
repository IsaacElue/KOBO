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

export interface OnrampSession {
  transferId: string;
  provider: "transak";
  /** Hosted checkout URL to redirect to, when present. */
  checkoutUrl?: string;
  /** Widget config for the embedded SDK path, when present. */
  widgetConfig?: Record<string, unknown>;
  /** ISO timestamp after which the session must be recreated. */
  expiresAt?: string;
}
