/**
 * The currency catalogue — deliberately separate from `mock-data.ts`'s
 * `CURRENCIES` (the EUR/GBP/USD funding-currency table the Send amount card
 * still drives off).
 *
 * Sprint 1C makes one distinction explicit that the product will lean on for a
 * future EUR → NGN corridor:
 *
 *   supported display currency   (can be shown / quoted in the UI)
 *         ≠
 *   supported funding currency   (a sender can pay Kobo in it today)
 *         ≠
 *   supported settlement currency (Kobo can deliver it to a recipient today)
 *         ≠
 *   executable FX pair           (Kobo can actually convert one to the other)
 *
 * Adding a row here does NOT claim Kobo can move money in that currency — the
 * capability flags say what's real. Today the only settlement currency is USDC
 * (on Solana, under the hood); the only funding currencies are EUR/GBP/USD;
 * NGN is display-only groundwork.
 */

export type CurrencyKind = "fiat" | "crypto";

export interface CurrencyInfo {
  code: string;
  /** Human name for prose — "Euro", "Nigerian Naira". */
  name: string;
  symbol: string;
  /** Region-indicator emoji, for compact identity chips. */
  flag: string;
  kind: CurrencyKind;
  /** A sender can fund a Kobo transfer in this currency today. */
  funding: boolean;
  /** Kobo can settle a transfer to a recipient in this currency today. */
  settlement: boolean;
}

export const CURRENCY_CATALOGUE: Record<string, CurrencyInfo> = {
  EUR: { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", kind: "fiat", funding: true, settlement: false },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧", kind: "fiat", funding: true, settlement: false },
  USD: { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", kind: "fiat", funding: true, settlement: false },
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", flag: "🇳🇬", kind: "fiat", funding: false, settlement: false },
  USDC: { code: "USDC", name: "US Dollar Coin", symbol: "$", flag: "🪙", kind: "crypto", funding: false, settlement: true },
};

/** Currencies the UI is allowed to display or quote (everything in the catalogue). */
export const SUPPORTED_DISPLAY_CURRENCIES = Object.keys(CURRENCY_CATALOGUE);

/** Currencies a sender can actually pay Kobo in today. */
export const FUNDING_CURRENCIES = Object.values(CURRENCY_CATALOGUE)
  .filter((c) => c.funding)
  .map((c) => c.code);

/** Currencies Kobo can actually deliver to a recipient today (settlement is always USDC). */
export const SETTLEMENT_CURRENCIES = Object.values(CURRENCY_CATALOGUE)
  .filter((c) => c.settlement)
  .map((c) => c.code);

export function currencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCY_CATALOGUE[code.toUpperCase()];
}

export function isSupportedDisplayCurrency(code: string): boolean {
  return code.toUpperCase() in CURRENCY_CATALOGUE;
}

export function isFundingCurrency(code: string): boolean {
  return !!currencyInfo(code)?.funding;
}

/* ── country helpers, for recipient identity ────────────────────────────── */

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  IE: "Ireland",
  GB: "United Kingdom",
  US: "United States",
  GH: "Ghana",
  KE: "Kenya",
};

/** ISO-3166 alpha-2 → region-indicator emoji (e.g. "NG" → 🇳🇬). Falls back to a globe. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return "🌍";
  const base = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(base + (up.charCodeAt(0) - 65), base + (up.charCodeAt(1) - 65));
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}
