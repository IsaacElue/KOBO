import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { isMockMode } = vi.hoisted(() => ({ isMockMode: vi.fn() }));
const { getRate } = vi.hoisted(() => ({ getRate: vi.fn() }));

vi.mock("@/lib/kobo/config", () => ({
  isMockMode,
  API_URL: "http://test.local",
  ROOT_REDIRECT_TARGET: "/waitlist",
}));
vi.mock("@/lib/kobo/api", () => ({ getRate }));

import { koboFxProvider, fxSourceLabel } from "@/lib/kobo/fx";

afterEach(() => vi.clearAllMocks());

describe("koboFxProvider — mock mode", () => {
  beforeEach(() => isMockMode.mockReturnValue(true));

  test("EUR→USDC returns an available quote tagged source:'mock' with metadata", async () => {
    const q = await koboFxProvider.getQuote("EUR", "USDC");
    expect(q.available).toBe(true);
    if (!q.available) return;
    expect(q.base).toBe("EUR");
    expect(q.quote).toBe("USDC");
    expect(q.rate).toBeGreaterThan(0);
    expect(q.source).toBe("mock");
    expect(Date.parse(q.timestamp)).not.toBeNaN();
    expect(Date.parse(q.expiresAt!)).toBeGreaterThan(Date.parse(q.timestamp));
    // never touches the real rate endpoint in mock mode
    expect(getRate).not.toHaveBeenCalled();
  });

  test("GBP and USD are also quotable against USDC", async () => {
    for (const base of ["GBP", "USD"]) {
      const q = await koboFxProvider.getQuote(base, "USDC");
      expect(q.available).toBe(true);
    }
  });
});

describe("koboFxProvider — real mode", () => {
  beforeEach(() => isMockMode.mockReturnValue(false));

  test("EUR→USDC uses the provider rate and tags source:'transak-market'", async () => {
    getRate.mockResolvedValue(1.0837);
    const q = await koboFxProvider.getQuote("EUR", "USDC");
    expect(q.available).toBe(true);
    if (!q.available) return;
    expect(q.rate).toBe(1.0837);
    expect(q.source).toBe("transak-market");
    expect(getRate).toHaveBeenCalledWith("EUR");
  });

  test("a provider error is represented as unavailable — never a random fallback", async () => {
    getRate.mockRejectedValue(new Error("upstream 502"));
    const q = await koboFxProvider.getQuote("EUR", "USDC");
    expect(q.available).toBe(false);
    if (q.available) return;
    expect(q.reason).toBe("provider_error");
  });

  test("a non-finite / non-positive rate is rejected, not shown", async () => {
    for (const bad of [NaN, 0, -1, Infinity]) {
      getRate.mockResolvedValue(bad);
      const q = await koboFxProvider.getQuote("EUR", "USDC");
      expect(q.available).toBe(false);
    }
  });
});

describe("koboFxProvider — EUR/NGN groundwork", () => {
  test("EUR→NGN has no legitimate source and is reported unavailable (mock mode)", async () => {
    isMockMode.mockReturnValue(true);
    const q = await koboFxProvider.getQuote("EUR", "NGN");
    expect(q.available).toBe(false);
    if (q.available) return;
    expect(q.reason).toBe("unsupported_pair");
    expect(q.base).toBe("EUR");
    expect(q.quote).toBe("NGN");
  });

  test("EUR→NGN is unavailable in real mode too, without calling any rate source", async () => {
    isMockMode.mockReturnValue(false);
    const q = await koboFxProvider.getQuote("EUR", "NGN");
    expect(q.available).toBe(false);
    expect(getRate).not.toHaveBeenCalled();
  });
});

describe("fxSourceLabel", () => {
  test("names each source type", () => {
    expect(fxSourceLabel("transak-market")).toMatch(/market/i);
    expect(fxSourceLabel("mock")).toMatch(/mock/i);
  });
});
