import type { CurrencyCode, CurrencyMeta, Recipient, TransferHistoryItem } from "./types";

/**
 * There's no auth/login yet (see KOBO_BUILD_PLAN.md), so this is the app's one
 * demo sender. `id` is the real `users.id` (uuid) of a `role: "sender"` row
 * created via `POST /users` — see NEXT_PUBLIC_KOBO_SENDER_ID in `.env.example`.
 * Falls back to a fake id in mock mode, where nothing validates it server-side.
 * `name`/`initials`/`iban` are just display fixtures (`iban` has no backend
 * column at all) and stay fixed regardless.
 */
export const CURRENT_USER = {
  id: process.env.NEXT_PUBLIC_KOBO_SENDER_ID || "usr_tomiwa",
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

/**
 * The default/pre-selected recipient shown on every fresh load must be a real
 * `users.id` — sending to a fabricated id 400s at `POST /transfers`. `id` and
 * `wallet` are the real uuid/address of a `role: "recipient"` row created via
 * `POST /users` (`{ name: "Adaeze Okonkwo", country: "NG" }`, matching this
 * fixture's existing display values) — see NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID
 * / _WALLET in `.env.example`. Falls back to the old fake id/wallet in mock mode.
 * `name`/`initials`/`meta`/`lastSent` are unchanged display fixtures, same as
 * `CURRENT_USER`'s `name`/`initials`/`iban` above.
 */
const DEFAULT_RECIPIENT_ID = process.env.NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID || "rcp_adaeze";

export const RECIPIENTS: Recipient[] = [
  {
    id: DEFAULT_RECIPIENT_ID,
    name: "Adaeze Okonkwo",
    initials: "AO",
    meta: "Sister · Lagos, NG · USDC wallet",
    wallet: process.env.NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_WALLET || "0x7a3f…C41d",
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
  { id: "txn_1", recipientId: DEFAULT_RECIPIENT_ID, reference: "KB-9182-EU", date: "12 Aug", amountEur: 200, status: "Delivered" },
  { id: "txn_2", recipientId: "rcp_chidi", reference: "KB-9114-EU", date: "28 Jul", amountEur: 120, status: "Delivered" },
  { id: "txn_3", recipientId: "rcp_ngozi", reference: "KB-9077-EU", date: "3 Jul", amountEur: 75, status: "Delivered" },
  { id: "txn_4", recipientId: "rcp_emeka", reference: "KB-8990-EU", date: "19 Jun", amountEur: 310, status: "Refunded" },
];

export const AMOUNT_PRESETS = [50, 100, 250, 500];

export const CONVERSION_FEE_RATE = 0.0053;

export function randomRate(currency: CurrencyCode) {
  return +(BASE_USDC_RATE[currency] + Math.random() * 0.02).toFixed(4);
}
