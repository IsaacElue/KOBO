import { Router } from "express";
import { getMarketRate } from "../lib/rates";

export const rateRouter = Router();

const VALID_FIAT = ["EUR", "GBP", "USD"] as const;

rateRouter.get("/", async (req, res) => {
  const fiatCurrency =
    typeof req.query.fiatCurrency === "string" ? req.query.fiatCurrency.toUpperCase() : "EUR";

  if (!VALID_FIAT.includes(fiatCurrency as (typeof VALID_FIAT)[number])) {
    return res.status(400).json({ error: `fiatCurrency must be one of: ${VALID_FIAT.join(", ")}` });
  }

  try {
    const rate = await getMarketRate(fiatCurrency);
    return res.json({
      fiat_currency: fiatCurrency,
      crypto_currency: "USDC",
      rate,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Failed to fetch rate" });
  }
});