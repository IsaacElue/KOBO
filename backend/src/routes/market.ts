import { Router } from "express";
import { getMarketOverview } from "../lib/market";

export const marketRouter = Router();

/**
 * `GET /market/overview` — SOL/USDC price, 24h & 7d change, and a 7-day
 * sparkline, for the Activity page's market card. Public (no auth), like
 * `GET /rate` — market data isn't user-specific. Backed by CoinGecko's free
 * keyless API through an in-memory cache (see `lib/market.ts`).
 *
 * On an upstream failure with a recent cached payload, still returns `200`
 * with `stale: true` so the frontend can show a "prices may be delayed"
 * hint. Only `503`s when there's no usable data at all.
 */
marketRouter.get("/overview", async (_req, res) => {
  try {
    const data = await getMarketOverview();
    return res.json(data);
  } catch (err) {
    console.error("GET /market/overview failed:", err);
    return res.status(503).json({ error: "market data unavailable" });
  }
});
