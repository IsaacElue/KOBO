import { describe, expect, test } from "vitest";
import {
  CURRENCY_CATALOGUE,
  FUNDING_CURRENCIES,
  SETTLEMENT_CURRENCIES,
  SUPPORTED_DISPLAY_CURRENCIES,
  currencyInfo,
  isFundingCurrency,
  isSupportedDisplayCurrency,
  countryFlag,
  countryName,
} from "@/lib/kobo/currencies";

describe("currency catalogue — the four-way distinction", () => {
  test("EUR is a supported display AND funding currency", () => {
    expect(isSupportedDisplayCurrency("EUR")).toBe(true);
    expect(isFundingCurrency("EUR")).toBe(true);
    expect(FUNDING_CURRENCIES).toContain("EUR");
  });

  test("NGN is a supported display currency but NOT a funding or settlement currency", () => {
    expect(isSupportedDisplayCurrency("NGN")).toBe(true);
    expect(SUPPORTED_DISPLAY_CURRENCIES).toContain("NGN");
    expect(isFundingCurrency("NGN")).toBe(false);
    expect(FUNDING_CURRENCIES).not.toContain("NGN");
    expect(SETTLEMENT_CURRENCIES).not.toContain("NGN");
    expect(currencyInfo("NGN")).toMatchObject({ symbol: "₦", kind: "fiat", funding: false });
  });

  test("USDC is the only settlement currency and is not a funding currency", () => {
    expect(SETTLEMENT_CURRENCIES).toEqual(["USDC"]);
    expect(isFundingCurrency("USDC")).toBe(false);
  });

  test("funding currencies are exactly EUR/GBP/USD today", () => {
    expect([...FUNDING_CURRENCIES].sort()).toEqual(["EUR", "GBP", "USD"]);
  });

  test("an unknown currency is neither displayable nor fundable", () => {
    expect(isSupportedDisplayCurrency("XYZ")).toBe(false);
    expect(isFundingCurrency("XYZ")).toBe(false);
    expect(currencyInfo("XYZ")).toBeUndefined();
  });

  test("catalogue entries are internally consistent", () => {
    for (const [code, info] of Object.entries(CURRENCY_CATALOGUE)) {
      expect(info.code).toBe(code);
      expect(info.name.length).toBeGreaterThan(0);
      expect(["fiat", "crypto"]).toContain(info.kind);
    }
  });
});

describe("country helpers", () => {
  test("maps ISO codes to flags and names", () => {
    expect(countryName("NG")).toBe("Nigeria");
    expect(countryName("ie")).toBe("Ireland");
    expect(countryFlag("NG")).toBe("🇳🇬");
  });

  test("degrades gracefully for missing / malformed input", () => {
    expect(countryName(null)).toBeNull();
    expect(countryFlag(null)).toBe("🌍");
    expect(countryFlag("nonsense")).toBe("🌍");
    expect(countryName("ZZ")).toBe("ZZ");
  });
});
