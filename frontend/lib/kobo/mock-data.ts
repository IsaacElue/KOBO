import type { CurrencyCode, CurrencyMeta, Recipient, TransferHistoryItem } from "./types";

export const CURRENT_USER = {
  id: "usr_tomiwa",
  name: "Tomiwa M.",
  initials: "TM",
  iban: "4417",
};

export const SUPPORT_EMAIL = "support@kobo.app";

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  EUR: { code: "EUR", symbol: "€", pluralNoun: "Euros", eurRate: 1, flagColor: "#0A3EA8" },
  GBP: { code: "GBP", symbol: "£", pluralNoun: "Pounds", eurRate: 1.17, flagColor: "#C8102E" },
  USD: { code: "USD", symbol: "$", pluralNoun: "Dollars", eurRate: 0.92, flagColor: "#3C3B6E" },
};

export const BALANCES: Record<CurrencyCode, number> = {
  EUR: 1840.5,
  GBP: 1580.2,
  USD: 1990.75,
};

const BASE_USDC_RATE: Record<CurrencyCode, number> = {
  EUR: 1.08,
  GBP: 1.26,
  USD: 1.0,
};

export const RECIPIENTS: Recipient[] = [
  {
    id: "rcp_adaeze",
    name: "Adaeze Okonkwo",
    initials: "AO",
    meta: "Sister · Lagos, NG · USDC wallet",
    wallet: "0x7a3f…C41d",
    lastSent: "Sent €200 on 12 Aug",
  },
  {
    id: "rcp_chidi",
    name: "Chidi Balogun",
    initials: "CB",
    meta: "Cousin · Abuja, NG · USDC wallet",
    wallet: "0x1b8e…9F02",
    lastSent: "Sent €120 on 28 Jul",
  },
  {
    id: "rcp_ngozi",
    name: "Ngozi Eze",
    initials: "NE",
    meta: "Mother · Enugu, NG · USDC wallet",
    wallet: "0x44c9…5Ae7",
    lastSent: "Sent €75 on 3 Jul",
  },
  {
    id: "rcp_emeka",
    name: "Emeka Nwachukwu",
    initials: "EN",
    meta: "Brother · Port Harcourt, NG",
    wallet: "0x9d21…B77c",
    lastSent: "Sent €310 on 19 Jun",
  },
];

export const TRANSFER_HISTORY: TransferHistoryItem[] = [
  { id: "txn_1", recipientId: "rcp_adaeze", reference: "KB-9182-EU", date: "12 Aug", amountEur: 200, status: "Delivered" },
  { id: "txn_2", recipientId: "rcp_chidi", reference: "KB-9114-EU", date: "28 Jul", amountEur: 120, status: "Delivered" },
  { id: "txn_3", recipientId: "rcp_ngozi", reference: "KB-9077-EU", date: "3 Jul", amountEur: 75, status: "Delivered" },
  { id: "txn_4", recipientId: "rcp_emeka", reference: "KB-8990-EU", date: "19 Jun", amountEur: 310, status: "Refunded" },
];

export const AMOUNT_PRESETS = [50, 100, 250, 500];

export const CONVERSION_FEE_RATE = 0.0053;

export function randomRate(currency: CurrencyCode) {
  return +(BASE_USDC_RATE[currency] + Math.random() * 0.02).toFixed(4);
}
