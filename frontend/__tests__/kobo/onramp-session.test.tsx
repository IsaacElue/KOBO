import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";
import { loadOnrampDraft } from "@/lib/kobo/onramp-draft";
import type { CreateTransferResponse, OnrampSession } from "@/lib/kobo/types";

const { createTransfer } = vi.hoisted(() => ({ createTransfer: vi.fn() }));

vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, createTransfer };
});

async function goToCheckout(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const dialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(dialog).getByRole("button", { name: `Digit ${d}` }));
  }
}

beforeEach(() => {
  createTransfer.mockReset();
  sessionStorage.clear();
});

describe("session creation failure", () => {
  test("toasts and stays on the form with the CTA re-enabled", async () => {
    createTransfer.mockRejectedValueOnce(new Error("network down"));
    const userEvent = (await import("@testing-library/user-event")).default;
    const user = userEvent.setup();
    render(
      <>
        <KoboApp />
        <Toaster />
      </>
    );
    await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });

    await goToCheckout(user);

    expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: /confirm & continue/i });
    expect(cta).toBeEnabled();
  });
});

describe("redirect on-ramp path", () => {
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

  test("persists a draft and shows the handoff panel, with a manual link after ~3s", async () => {
    const session: OnrampSession = {
      sessionId: "sess_redirect_test",
      widgetUrl: "https://global.transak.com/checkout/tr_redirect_test",
    };
    const response: CreateTransferResponse & { onramp: OnrampSession } = {
      transfer_id: "tr_redirect_test",
      status: "pending",
      onramp_reference: "KB-1234-EU",
      onramp: session,
    };
    createTransfer.mockResolvedValueOnce(response);

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

    fireEvent.click(screen.getByRole("button", { name: /confirm & continue/i }));
    const dialog = screen.getByRole("dialog", { name: /enter your passcode/i });
    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(within(dialog).getByRole("button", { name: `Digit ${d}` }));
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/continuing to transak/i)).toBeInTheDocument();
    expect(screen.queryByText(/taking a while/i)).not.toBeInTheDocument();

    const draft = loadOnrampDraft();
    expect(draft?.transferId).toBe("tr_redirect_test");
    expect(draft?.reference).toBe("KB-1234-EU");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole("link", { name: /taking a while/i })).toHaveAttribute(
      "href",
      session.widgetUrl
    );
  });
});
