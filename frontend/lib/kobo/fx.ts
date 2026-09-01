/**
 * FX / quote abstraction.
 *
 * Purpose: stop the Send UI (and the Market section) from reaching straight for
 * `randomRate()` / CoinGecko / Jupiter. Those are three different things and
 * the product must not blur them:
 *
 *   1. informational market data   — "SOL is ~€90 today" (CoinGecko/Jupiter)
 *   2. an executable FX quote      — "we will convert EUR→NGN at X, valid 30s"
 *   3. provider on-ramp pricing    — MoonPay/Transak's own buy price
 *
 * This module models (2) as a small `FxQuoteProvider`. Today the only pair it
 * can answer for real is EUR/GBP/USD → USDC (the same Transak public *market*
 * quote the backend `/rate` endpoint already proxies — a pre-trade indication,
 * not a locked executable commitment). Everything else — notably EUR/NGN — is
 * returned as explicitly unavailable rather than fabricated.
 *
 * Quote-safety rule (Sprint 1C Task 7): a `source: "mock"` quote is only ever
 * produced in mock mode. In real mode the provider either returns a
 * verified/provider-sourced rate or `available: false` — it never silently
 * falls back to random data.
 */

import type { CurrencyCode } from "./types";
import { isMockMode } from "./config";
import { randomRate } from "./mock-data";
import { getRate } from "./api";

/** Where a rate came from. `mock` can only appear in mock mode. */
export type FxQuoteSource = "transak-market" | "mock";

export interface FxQuote {
  available: true;
  /** e.g. "EUR" */
  base: string;
  /** e.g. "USDC" */
  quote: string;
  /** `quote` units per 1 `base`. */
  rate: number;
  /** When this quote was obtained (ISO). */
  timestamp: string;
  source: FxQuoteSource;
  /** When the quote should no longer be trusted for display (ISO), or null if not time-boxed. */
  expiresAt: string | null;
}

export type FxUnavailableReason =
  /** Kobo has no price source for this pair at all (e.g. EUR/NGN). */
  | "unsupported_pair"
  /** A source exists but the lookup failed (network / upstream error). */
  | "provider_error";

export interface FxUnavailable {
  available: false;
  base: string;
  quote: string;
  reason: FxUnavailableReason;
}

export type FxQuoteResult = FxQuote | FxUnavailable;

export interface FxQuoteProvider {
  /**
   * An informational / pre-trade rate for `base` → `quote`. Never a locked,
   * executable commitment — callers must treat it as indicative.
   */
  getQuote(base: string, quote: string): Promise<FxQuoteResult>;
}

/** Pairs Kobo can price for real today (Transak public market quote via `/rate`). */
const MARKET_QUOTE_PAIRS = new Set(["EUR/USDC", "GBP/USDC", "USD/USDC"]);

/** How long a display quote stays "fresh" — matches the Send screen's 30s rate lock. */
export const FX_QUOTE_TTL_MS = 30_000;

function pairKey(base: string, quote: string): string {
  return `${base.toUpperCase()}/${quote.toUpperCase()}`;
}

export const koboFxProvider: FxQuoteProvider = {
  async getQuote(base, quote) {
    const b = base.toUpperCase();
    const q = quote.toUpperCase();

    if (!MARKET_QUOTE_PAIRS.has(pairKey(b, q))) {
      // No EUR/NGN (or any non-USDC) price source exists yet — say so honestly.
      return { available: false, base: b, quote: q, reason: "unsupported_pair" };
    }

    const now = Date.now();
    const common = {
      available: true as const,
      base: b,
      quote: q,
      timestamp: new Date(now).toISOString(),
      expiresAt: new Date(now + FX_QUOTE_TTL_MS).toISOString(),
    };

    if (isMockMode()) {
      // Mock mode only — clearly tagged so no real-money screen can mistake it.
      return { ...common, rate: randomRate(b as CurrencyCode), source: "mock" };
    }

    try {
      // Real mode: the backend `/rate` endpoint (Transak public market quote).
      const rate = await getRate(b as CurrencyCode);
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        return { available: false, base: b, quote: q, reason: "provider_error" };
      }
      return { ...common, rate, source: "transak-market" };
    } catch {
      return { available: false, base: b, quote: q, reason: "provider_error" };
    }
  },
};

/** Human label for a quote's source/type — shown next to the rate so the user knows what it is. */
export function fxSourceLabel(source: FxQuoteSource): string {
  switch (source) {
    case "transak-market":
      return "Market rate";
    case "mock":
      return "Demo rate (mock mode)";
  }
}
