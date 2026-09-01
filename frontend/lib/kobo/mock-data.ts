import type { CurrencyCode, CurrencyMeta, Recipient, TransferHistoryItem } from "./types";
import { isMockMode } from "./config";

/**
 * Mock mode's only demo sender — `AuthGate` (components/kobo/auth-gate.tsx)
 * skips real auth entirely in mock mode and renders `KoboApp` with no `user`
 * prop, which defaults to this fixture. In real mode this is never read:
 * `NEXT_PUBLIC_KOBO_SENDER_ID` (the old hardcoded-demo-sender scheme this
 * used to fall back to) is gone — the real signed-in user's own `id`/`name`
 * (from `POST /auth/signup` or `/login`, see lib/kobo/auth.ts) is used
 * everywhere instead. `name`/`initials`/`iban` are just display fixtures
 * (`iban` has no backend column at all) and stay fixed regardless.
 */
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
    email: "adaeze@example.com",
    country: "NG",
  },
  {
    id: "rcp_chidi",
    name: "Chidi Balogun",
    initials: "CB",
    meta: "Cousin · Abuja, NG · USDC wallet",
    wallet: "0x1b8e…9F02",
    lastSent: "Sent €120 on 28 Jul",
    email: "chidi@example.com",
    country: "NG",
  },
  {
    id: "rcp_ngozi",
    name: "Ngozi Eze",
    initials: "NE",
    meta: "Mother · Enugu, NG · USDC wallet",
    wallet: "0x44c9…5Ae7",
    lastSent: "Sent €75 on 3 Jul",
    email: "ngozi@example.com",
    country: "NG",
  },
  {
    id: "rcp_emeka",
    name: "Emeka Nwachukwu",
    initials: "EN",
    meta: "Brother · Port Harcourt, NG",
    wallet: "0x9d21…B77c",
    lastSent: "Sent €310 on 19 Jun",
    // address-only style recipient — no email on file
    country: "NG",
  },
];

/**
 * Recipients safe to pre-seed into the picker. In real mode only the default
 * recipient ("Adaeze Okonkwo") is a real `users` row — the other three
 * fixtures (Chidi / Ngozi / Emeka) have fabricated ids that 400 at
 * `POST /transfers` ("Recipient not found"). They're dropped in real mode;
 * the user adds real recipients via "Add recipient" (real `POST /users`).
 * Mock mode keeps all four for a fuller demo. Consumers that render the
 * pre-seeded picker should use this, not the raw `RECIPIENTS` fixture.
 */
export const SEED_RECIPIENTS: Recipient[] = isMockMode()
  ? RECIPIENTS
  : RECIPIENTS.filter((r) => r.id === DEFAULT_RECIPIENT_ID);

/**
 * Mock-mode transfer history. Deliberately longer than the picker's recipient
 * list so the Activity screen's search / status filter / "Load more" have
 * something real to act on in a mock demo. Newest first — `getMyTransfers()` /
 * `getTransferHistory()` (lib/kobo/api.ts) date them from index 0.
 */
export const TRANSFER_HISTORY: TransferHistoryItem[] = [
  { id: "txn_1", recipientId: DEFAULT_RECIPIENT_ID, reference: "KB-9182-EU", date: "12 Aug", amountEur: 200, status: "Delivered" },
  { id: "txn_2", recipientId: "rcp_chidi", reference: "KB-9114-EU", date: "28 Jul", amountEur: 120, status: "Delivered" },
  { id: "txn_3", recipientId: "rcp_ngozi", reference: "KB-9077-EU", date: "3 Jul", amountEur: 75, status: "Delivered" },
  { id: "txn_4", recipientId: "rcp_emeka", reference: "KB-8990-EU", date: "19 Jun", amountEur: 310, status: "Refunded" },
  { id: "txn_5", recipientId: DEFAULT_RECIPIENT_ID, reference: "KB-8871-EU", date: "2 Jun", amountEur: 150, status: "Delivered" },
  { id: "txn_6", recipientId: "rcp_chidi", reference: "KB-8790-EU", date: "24 May", amountEur: 60, status: "Delivered" },
  { id: "txn_7", recipientId: "rcp_ngozi", reference: "KB-8712-EU", date: "15 May", amountEur: 240, status: "In progress" },
  { id: "txn_8", recipientId: "rcp_emeka", reference: "KB-8634-EU", date: "6 May", amountEur: 95, status: "Delivered" },
  { id: "txn_9", recipientId: DEFAULT_RECIPIENT_ID, reference: "KB-8556-EU", date: "27 Apr", amountEur: 500, status: "Delivered" },
  { id: "txn_10", recipientId: "rcp_chidi", reference: "KB-8477-EU", date: "18 Apr", amountEur: 45, status: "Delivered" },
  { id: "txn_11", recipientId: "rcp_ngozi", reference: "KB-8399-EU", date: "9 Apr", amountEur: 180, status: "Refunded" },
  { id: "txn_12", recipientId: "rcp_emeka", reference: "KB-8320-EU", date: "31 Mar", amountEur: 275, status: "Delivered" },
  { id: "txn_13", recipientId: DEFAULT_RECIPIENT_ID, reference: "KB-8242-EU", date: "22 Mar", amountEur: 130, status: "Delivered" },
  { id: "txn_14", recipientId: "rcp_chidi", reference: "KB-8163-EU", date: "13 Mar", amountEur: 320, status: "Delivered" },
];

export const AMOUNT_PRESETS = [50, 100, 250, 500];

export const CONVERSION_FEE_RATE = 0.0053;

export function randomRate(currency: CurrencyCode) {
  return +(BASE_USDC_RATE[currency] + Math.random() * 0.02).toFixed(4);
}
