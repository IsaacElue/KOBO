import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";
import type { FundingRecord, OnrampSession } from "@/lib/kobo/types";

// The send flow no longer creates a Transak session at all (instant,
// balance-checked) — POST /funding (Add Funds) is the only place left that does,
// so this file's session-creation-failure and redirect-handoff coverage now
// exercises that flow instead.
const { createFunding } = vi.hoisted(() => ({ createFunding: vi.fn() }));

vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, createFunding };
});

async function openAddFunds(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /add funds/i }));
  const dialog = await screen.findByRole("dialog", { name: /add funds/i });
  await user.click(within(dialog).getByRole("button", { name: /^add funds$/i }));
}

beforeEach(() => {
  createFunding.mockReset();
  sessionStorage.clear();
});

describe("funding session creation failure", () => {
  test("toasts and closes the dialog with the CTA re-enabled", async () => {
    createFunding.mockRejectedValueOnce(new Error("network down"));
    const userEvent = (await import("@testing-library/user-event")).default;
    const user = userEvent.setup();
    render(
      <>
        <KoboApp />
        <Toaster />
      </>
    );
    await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });

    await openAddFunds(user);

    expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: /add funds/i });
    expect(cta).toBeEnabled();
  });
});

describe("funding redirect on-ramp path", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    vi.useFakeTimers();
    // preferRedirectOnramp() picks redirect below a mobile breakpoint.
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 500 });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalWidth });
  });

  test("shows the handoff panel, with a manual link after ~3s", async () => {
    const session: OnrampSession = {
      sessionId: "sess_redirect_test",
      widgetUrl: "https://global.transak.com/checkout/fund_redirect_test",
    };
    const response: FundingRecord & { onramp: OnrampSession } = {
      id: "fund_redirect_test",
      sender_id: "usr_tomiwa",
      amount_eur: 100,
      amount_usdc: 108,
      status: "pending",
      rail: "transak",
      onramp_session_id: "sess_redirect_test",
      onramp_reference: null,
      failure_reason: null,
      created_at: new Date(0).toISOString(),
      onramp: session,
    };
    createFunding.mockResolvedValueOnce(response);

    render(
      <>
        <KoboApp />
        <Toaster />
      </>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByRole("heading", { name: /send money home/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add funds/i }));
    const dialog = screen.getByRole("dialog", { name: /add funds/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^add funds$/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/continuing to transak/i)).toBeInTheDocument();
    expect(screen.queryByText(/taking a while/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole("link", { name: /taking a while/i })).toHaveAttribute(
      "href",
      session.widgetUrl
    );
  });
});
