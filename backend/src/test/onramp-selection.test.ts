import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock both provider modules before importing lib/onramp — proves the
// *routing* logic in isolation, independent of MoonPay/Transak's own network
// calls (Transak's createWidgetSession hits a real API; that's covered
// separately by whatever verified Transak originally, not re-tested here).
vi.mock("../lib/moonpay", () => ({
  createOnrampSession: vi.fn(async () => ({ widgetUrl: "https://buy.moonpay.com?mock=1", sessionId: null })),
}));
vi.mock("../lib/transak", () => ({
  createWidgetSession: vi.fn(async () => ({ widgetUrl: "https://global.transak.com?mock=1", sessionId: "sess_mock" })),
}));

describe("lib/onramp.ts — rail routing (Phase 1 abstraction)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const baseParams = {
    amountEur: 100,
    walletAddress: "backendWalletAddress111111111111111111111",
    reference: "fund_11111111-1111-4111-8111-111111111111",
    userIp: "1.2.3.4",
  };

  it("existing MoonPay flow remains compatible: default rail (ONRAMP_PROVIDER=moonpay) routes to moonpay.createOnrampSession", async () => {
    process.env.ONRAMP_PROVIDER = "moonpay";
    vi.resetModules();
    const onramp = await import("../lib/onramp");
    const moonpay = await import("../lib/moonpay");
    const result = await onramp.createOnrampSession(baseParams);
    expect(moonpay.createOnrampSession).toHaveBeenCalledTimes(1);
    expect(moonpay.createOnrampSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountEur: 100, walletAddress: baseParams.walletAddress, reference: baseParams.reference })
    );
    expect(result.widgetUrl).toContain("moonpay.com");
  });

  it("existing Transak flow remains compatible: explicit rail:'transak' routes to transak.createWidgetSession, even with ONRAMP_PROVIDER=moonpay", async () => {
    process.env.ONRAMP_PROVIDER = "moonpay";
    vi.resetModules();
    const onramp = await import("../lib/onramp");
    const transak = await import("../lib/transak");
    const result = await onramp.createOnrampSession({ ...baseParams, rail: "transak" });
    expect(transak.createWidgetSession).toHaveBeenCalledTimes(1);
    expect(transak.createWidgetSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountEur: 100,
        recipientWalletAddress: baseParams.walletAddress,
        partnerOrderId: `fund_${baseParams.reference}`,
      })
    );
    expect(result.widgetUrl).toContain("transak.com");
  });

  it("ONRAMP_PROVIDER=transak with no explicit rail also routes to transak (env default still works)", async () => {
    process.env.ONRAMP_PROVIDER = "transak";
    vi.resetModules();
    const onramp = await import("../lib/onramp");
    const transak = await import("../lib/transak");
    await onramp.createOnrampSession(baseParams);
    expect(transak.createWidgetSession).toHaveBeenCalledTimes(1);
    process.env.ONRAMP_PROVIDER = "moonpay";
  });

  it("a known-but-unimplemented rail (coinbase/sepa/stripe) is rejected, not silently routed to a default provider", async () => {
    vi.resetModules();
    const onramp = await import("../lib/onramp");
    await expect(onramp.createOnrampSession({ ...baseParams, rail: "sepa" })).rejects.toThrow(/not implemented/i);
  });
});
