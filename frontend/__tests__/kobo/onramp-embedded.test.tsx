import { describe, expect, test } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { renderKoboApp, simulateTransakEvent } from "./test-utils";

// The send flow no longer touches Transak at all (instant, balance-checked) — the
// only place a Transak widget still opens from the frontend is Add Funds. Same
// embedded-widget mechanics as the old per-send flow (allowlist check, postMessage
// bridge, close button), just reached through Add Funds now.
async function reachFundingCheckout(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /add funds/i }));
  const dialog = await screen.findByRole("dialog", { name: /add funds/i });
  // "Card" (moonpay rail) — the mock widgetUrl it gets back isn't a real
  // moonpay.com host, so at desktop width the existing isMoonPayWidget ||
  // preferRedirectOnramp() resolution still lands on "embedded", exercising
  // the same widget mechanics this file has always tested.
  await user.click(within(dialog).getByRole("button", { name: "Card or bank transfer" }));
  return screen.findByRole("dialog", { name: /transak checkout/i }, { timeout: 2000 });
}

describe("embedded on-ramp step (Add Funds)", () => {
  test("ignores a postMessage from an origin outside the allowlist", async () => {
    const { user } = await renderKoboApp();
    await reachFundingCheckout(user);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event_id: "TRANSAK_ORDER_SUCCESSFUL" },
          origin: "https://evil.example.com",
        })
      );
    });

    // Still showing the checkout, not processing - the spoofed message was dropped.
    expect(screen.getByRole("dialog", { name: /transak checkout/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("order-successful (same-origin) hands off to polling and credits the real balance", async () => {
    const { user } = await renderKoboApp();
    await reachFundingCheckout(user);

    simulateTransakEvent("TRANSAK_ORDER_SUCCESSFUL");

    expect(await screen.findByRole("status", {}, { timeout: 2000 })).toHaveTextContent(
      /adding funds/i
    );
    expect(await screen.findByText(/your balance is now/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("order-failed polls for the real status (not an immediate local failure) and toasts the failure", async () => {
    const { user } = await renderKoboApp();
    await reachFundingCheckout(user);

    simulateTransakEvent("TRANSAK_ORDER_FAILED");

    // The widget closing never decides the outcome by itself - it should still be
    // polling GET /funding/:id (shown as the processing overlay) before failing.
    expect(await screen.findByRole("status", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(
      await screen.findByText(/simulated top-up could not be completed/i, {}, { timeout: 4000 })
    ).toBeInTheDocument();
  });

  test("closing the widget without paying is treated as a cancel", async () => {
    const { user } = await renderKoboApp();
    const checkout = await reachFundingCheckout(user);

    await user.click(within(checkout).getByRole("button", { name: /close checkout/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/add funds cancelled\. nothing was charged/i)).toBeInTheDocument();
  });

  test("a TRANSAK_WIDGET_CLOSE message is also treated as a cancel", async () => {
    const { user } = await renderKoboApp();
    await reachFundingCheckout(user);

    simulateTransakEvent("TRANSAK_WIDGET_CLOSE");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/add funds cancelled\. nothing was charged/i)).toBeInTheDocument();
  });
});
