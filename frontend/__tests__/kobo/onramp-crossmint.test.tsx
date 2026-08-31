import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";
import type { CreateFundingResponse, FundingRecord } from "@/lib/kobo/types";

// Local override of the global inert mock (vitest.setup.ts) — this file
// specifically needs to simulate the SDK's order.phase leaving "payment", to
// test the real (unmocked) ProcessingWatcher in crossmint-checkout-modal.tsx
// actually calling onProcessing. useSyncExternalStore is the correct tool:
// mutating `crossmintTestOrder` + notifying re-renders every subscriber,
// exactly like a real hook's state changing.
const { setCrossmintTestOrder, getCrossmintTestOrder, subscribeCrossmintTestOrder } = vi.hoisted(() => {
  let order: { phase?: string } | undefined;
  const listeners = new Set<() => void>();
  return {
    setCrossmintTestOrder: (next: { phase?: string } | undefined) => {
      order = next;
      listeners.forEach((l) => l());
    },
    getCrossmintTestOrder: () => order,
    subscribeCrossmintTestOrder: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("@crossmint/client-sdk-react-ui", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    CrossmintProvider: ({ children }: { children: React.ReactNode }) => children,
    CrossmintCheckoutProvider: ({ children }: { children: React.ReactNode }) => children,
    CrossmintEmbeddedCheckout: ({ orderId }: { orderId: string }) => (
      <div data-testid="fake-crossmint-checkout">Checkout for {orderId}</div>
    ),
    useCrossmintCheckout: () => {
      const order = useSyncExternalStore(subscribeCrossmintTestOrder, getCrossmintTestOrder);
      return { order, orderClientSecret: undefined };
    },
  };
});

const { createFunding, getFundingRequest, pollFundingStatus } = vi.hoisted(() => ({
  createFunding: vi.fn(),
  getFundingRequest: vi.fn(),
  pollFundingStatus: vi.fn(),
}));

vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, createFunding, getFundingRequest, pollFundingStatus };
});

function crossmintResponse(opts: { orderId?: string } = {}): CreateFundingResponse {
  const orderId = opts.orderId ?? "order_cm_1";
  const base: FundingRecord = {
    id: "fund_cm_1",
    sender_id: "usr_tomiwa",
    amount_eur: 100,
    amount_usdc: 108,
    status: "pending",
    rail: "crossmint",
    onramp_session_id: orderId,
    onramp_reference: null,
    failure_reason: null,
    created_at: new Date(0).toISOString(),
  };
  return {
    ...base,
    fundingRequestId: base.id,
    orderId,
    onramp: {
      sessionId: orderId,
      widgetUrl: "",
      checkoutClientSecret: "secret_abc",
      paymentStatus: "requires-kyc",
    },
  };
}

async function openAddFunds() {
  const user = userEvent.setup();
  render(
    <>
      <KoboApp />
      <Toaster />
    </>
  );
  await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });
  await user.click(screen.getByRole("button", { name: /add funds/i }));
  const dialog = await screen.findByRole("dialog", { name: /add funds/i });
  return { user, dialog };
}

beforeEach(() => {
  createFunding.mockReset();
  getFundingRequest.mockReset();
  pollFundingStatus.mockReset();
  setCrossmintTestOrder(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Add Funds — funding-method picker (KOBO — CROSSMINT FRONTEND INTEGRATION Step 3a)", () => {
  test("shows both options: Card / Apple Pay (Crossmint) and Card (MoonPay)", async () => {
    const { dialog } = await openAddFunds();
    expect(within(dialog).getByRole("button", { name: "Card / Apple Pay" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Card" })).toBeInTheDocument();
  });

  test("picking Card / Apple Pay always sends rail: 'crossmint' explicitly", async () => {
    createFunding.mockResolvedValueOnce(crossmintResponse());
    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));

    expect(createFunding).toHaveBeenCalledTimes(1);
    expect(createFunding).toHaveBeenCalledWith(expect.objectContaining({ rail: "crossmint" }));
  });

  test("picking Card always sends rail: 'moonpay' explicitly (never omitted / defaulted)", async () => {
    createFunding.mockResolvedValueOnce({
      ...crossmintResponse(),
      rail: "moonpay",
      orderId: null,
      onramp: { sessionId: null, widgetUrl: "https://buy.moonpay.com/checkout/abc" },
    });
    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card" }));

    expect(createFunding).toHaveBeenCalledTimes(1);
    expect(createFunding).toHaveBeenCalledWith(expect.objectContaining({ rail: "moonpay" }));
    // Never the old rail-less shape that fell back to ONRAMP_PROVIDER.
    expect(createFunding.mock.calls[0][0].rail).toBeDefined();
  });
});

describe("Crossmint checkout — order creation + embedded render", () => {
  test("a successful order-create renders the embedded checkout with the real orderId/clientSecret", async () => {
    createFunding.mockResolvedValueOnce(crossmintResponse({ orderId: "order_specific_777" }));
    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));

    expect(await screen.findByTestId("fake-crossmint-checkout")).toHaveTextContent("order_specific_777");
  });

  test("a failed order-create toasts and returns to closed, CTA re-enabled", async () => {
    createFunding.mockRejectedValueOnce(new Error("network down"));
    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));

    expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
    expect(screen.queryByTestId("fake-crossmint-checkout")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add funds/i })).toBeEnabled();
  });

  test("closing the checkout modal cancels without charging or crediting anything", async () => {
    createFunding.mockResolvedValueOnce(crossmintResponse());
    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));
    await screen.findByTestId("fake-crossmint-checkout");

    await user.click(screen.getByRole("button", { name: /close checkout/i }));

    expect(await screen.findByText(/add funds cancelled\. nothing was charged/i)).toBeInTheDocument();
    expect(pollFundingStatus).not.toHaveBeenCalled();
  });
});

describe("front-end never credits — the balance only ever reflects a real GET /funding/:id response", () => {
  test("no client-side path calls creditBalance or fabricates a balance increase", async () => {
    // The frontend has no crediting function at all — the only way a shown
    // balance ever changes is via pollFundingStatus's onUpdate callback,
    // driven by a real (mocked-here) GET /funding/:id response. This test
    // asserts that shape directly: reaching "processing" starts polling,
    // but nothing is credited until a poll response says so.
    createFunding.mockResolvedValueOnce(crossmintResponse());
    pollFundingStatus.mockImplementation(() => () => {});

    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));
    await screen.findByTestId("fake-crossmint-checkout");

    // Simulate the SDK's order leaving "payment" — the real (unmocked)
    // ProcessingWatcher should react to this and call finishFundingCheckout,
    // which starts polling — but polling itself has not resolved anything.
    act(() => {
      setCrossmintTestOrder({ phase: "delivery" });
    });

    expect(pollFundingStatus).toHaveBeenCalledTimes(1);
    // Nothing has polled yet, so no balance should be shown as updated —
    // proving the UI never invents a credited amount ahead of a real response.
    expect(screen.queryByText(/your balance is now/i)).not.toBeInTheDocument();
  });
});

describe("polling stop-states (manual_review / awaiting_reconciliation treated as processing)", () => {
  test("manual_review keeps the processing overlay open (not treated as terminal)", async () => {
    createFunding.mockResolvedValueOnce(crossmintResponse());
    let onUpdate: ((f: FundingRecord & { balance: number }) => void) | null = null;
    pollFundingStatus.mockImplementation((_id, cb) => {
      onUpdate = cb;
      return () => {};
    });

    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));
    await screen.findByTestId("fake-crossmint-checkout");

    // Polling only starts once the SDK is treated as "processing".
    act(() => {
      setCrossmintTestOrder({ phase: "delivery" });
    });
    expect(pollFundingStatus).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toBeNull();

    act(() => {
      onUpdate!({
        id: "fund_cm_1",
        sender_id: "usr_tomiwa",
        amount_eur: 100,
        amount_usdc: 108,
        status: "manual_review",
        rail: "crossmint",
        onramp_session_id: "order_cm_1",
        onramp_reference: null,
        failure_reason: "needs manual review",
        created_at: new Date(0).toISOString(),
        balance: 0,
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent(/under review/i);
    expect(screen.queryByText(/your balance is now/i)).not.toBeInTheDocument();
  });

  test("confirmed stops polling and shows the success toast with the real balance", async () => {
    createFunding.mockResolvedValueOnce(crossmintResponse());
    let onUpdate: ((f: FundingRecord & { balance: number }) => void) | null = null;
    pollFundingStatus.mockImplementation((_id, cb) => {
      onUpdate = cb;
      return () => {};
    });

    const { user, dialog } = await openAddFunds();
    await user.click(within(dialog).getByRole("button", { name: "Card / Apple Pay" }));
    await screen.findByTestId("fake-crossmint-checkout");

    act(() => {
      setCrossmintTestOrder({ phase: "delivery" });
    });
    expect(onUpdate).not.toBeNull();

    act(() => {
      onUpdate!({
        id: "fund_cm_1",
        sender_id: "usr_tomiwa",
        amount_eur: 100,
        amount_usdc: 108,
        status: "confirmed",
        rail: "crossmint",
        onramp_session_id: "order_cm_1",
        onramp_reference: "ref_123",
        failure_reason: null,
        created_at: new Date(0).toISOString(),
        balance: 108,
      });
    });
    expect(await screen.findByText(/your balance is now/i)).toBeInTheDocument();
  });
});
