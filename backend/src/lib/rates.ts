/**
 * Provider-neutral rate source.
 *
 * Phase 1 boundary: KOBO's EUR → USDC market rate is a pricing concern, not a
 * funding-rail concern. Previously `getMarketRate()` lived in `lib/transak.ts`
 * and was imported directly by `routes/funding.ts` + `routes/rate.ts` — a
 * hidden coupling: the *rate* stopped belonging to Transak the moment Transak
 * wasn't the active funding provider. This module is the seam that decouples
 * them.
 *
 * Current implementation still delegates to Transak's public Get Price quote
 * (no key, no session — see `lib/transak.ts`). When Coinbase / SEPA / Stripe
 * arrive, a rail may register its own price source here without changing the
 * endpoints that consume `getMarketRate()`.
 */

import { getMarketRate as getTransakRate } from "./transak";

/**
 * The live EUR → USDC market rate (fiat → USDC per unit of fiat).
 *
 * Preserves EXACT current behavior: delegates to Transak's public quote, which
 * is provider-independent pricing (a market feed, not a Transak-specific rate).
 * The one change is the import boundary — `routes/funding.ts` and
 * `routes/rate.ts` now depend on this module, not on Transak.
 */
export async function getMarketRate(fiatCurrency: string): Promise<number> {
  return getTransakRate(fiatCurrency);
}