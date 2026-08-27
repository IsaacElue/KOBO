import type { JupiterSpot } from "./types";
import { isMockMode } from "./config";

/**
 * Jupiter's price API (price/v3) — a keyless, no-signup live spot-price feed
 * for Solana tokens. Called directly from the client (no backend proxy): the
 * lite tier is generous (~60 req/min, forgiving), and this is a single
 * lightweight poll per Activity viewer.
 *
 * Deliberately NOT routed through the backend — the backend proxy exists for
 * CoinGecko, whose keyless limit is far tighter. Jupiter doesn't need it.
 *
 * Returns null on any failure (rate limit, network, unexpected shape) so the
 * caller can show a "price unavailable" state rather than throw.
 */

// Wrapped SOL mint. Jupiter keys prices by mint address, not symbol.
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_URL = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;

export async function getSolSpot(): Promise<JupiterSpot | null> {
  if (isMockMode()) {
    return { usd_price: 106.2 + Math.random() * 0.6, change_24h: 3.1 };
  }
  try {
    const res = await fetch(JUPITER_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usdPrice?: number; priceChange24h?: number }>;
    const row = body[SOL_MINT];
    if (!row || typeof row.usdPrice !== "number") return null;
    return {
      usd_price: row.usdPrice,
      change_24h: typeof row.priceChange24h === "number" ? row.priceChange24h : null,
    };
  } catch {
    return null;
  }
}
