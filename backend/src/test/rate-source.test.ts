import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("getMarketRate — rate-source boundary (Phase 1)", () => {
  it("returns a live rate independent of ONRAMP_PROVIDER's value", async () => {
    const original = process.env.ONRAMP_PROVIDER;
    // Deliberately the OPPOSITE of whatever's configured, to prove the rate
    // call never reads this var at all.
    process.env.ONRAMP_PROVIDER = original === "transak" ? "moonpay" : "transak";
    try {
      const { getMarketRate } = await import("../lib/rates");
      const rate = await getMarketRate("EUR");
      expect(rate).toBeGreaterThan(0);
    } finally {
      process.env.ONRAMP_PROVIDER = original;
    }
  });

  it("routes/funding.ts and routes/rate.ts import getMarketRate from lib/rates, not lib/transak directly", () => {
    // Source-inspection regression guard: the whole point of lib/rates.ts is
    // that these two call sites no longer couple to Transak directly. If
    // someone "simplifies" this back to `from "../lib/transak"`, this test
    // catches it — a runtime test alone can't distinguish which module a
    // value was imported from once it's just a function reference.
    const fundingRoute = readFileSync(join(__dirname, "../routes/funding.ts"), "utf-8");
    const rateRoute = readFileSync(join(__dirname, "../routes/rate.ts"), "utf-8");

    expect(fundingRoute).toMatch(/from ["']\.\.\/lib\/rates["']/);
    expect(fundingRoute).not.toMatch(/getMarketRate.*from ["']\.\.\/lib\/transak["']/);

    expect(rateRoute).toMatch(/from ["']\.\.\/lib\/rates["']/);
    expect(rateRoute).not.toMatch(/getMarketRate.*from ["']\.\.\/lib\/transak["']/);
  });

  it(
    "documented residual coupling (not fixed this phase, by design): lib/rates.ts still " +
      "transitively imports lib/transak.ts, whose module-level guard requires BOTH " +
      "TRANSAK_API_KEY and TRANSAK_API_SECRET even though price-quoting only uses the " +
      "key. Fixing that means splitting lib/transak.ts, which the founder's explicit " +
      "preserve-list (transak.ts) puts out of scope for Phase 1. This test exists so the " +
      "boundary is documented, not silently forgotten.",
    () => {
      const rates = readFileSync(join(__dirname, "../lib/rates.ts"), "utf-8");
      expect(rates).toMatch(/from ["']\.\/transak["']/);
    }
  );
});
