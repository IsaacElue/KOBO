import { describe, expect, test } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { renderKoboApp, simulateTransakEvent } from "./test-utils";

async function reachCheckout(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const dialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(dialog).getByRole("button", { name: `Digit ${d}` }));
  }
  return screen.findByRole("dialog", { name: /transak checkout/i }, { timeout: 2000 });
}

describe("embedded on-ramp step", () => {
  test("ignores a postMessage from an origin outside the allowlist", async () => {
    const { user } = await renderKoboApp();
    await reachCheckout(user);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event_id: "TRANSAK_ORDER_SUCCESSFUL" },
          origin: "https://evil.example.com",
        })
      );
    });

    // Still showing the checkout, not processing/success - the spoofed message was dropped.
    expect(screen.getByRole("dialog", { name: /transak checkout/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("order-successful (same-origin) hands off to the existing processing → success flow", async () => {
    const { user } = await renderKoboApp();
    await reachCheckout(user);

    simulateTransakEvent("TRANSAK_ORDER_SUCCESSFUL");

    expect(await screen.findByRole("status", {}, { timeout: 2000 })).toHaveTextContent(
      /securing your transfer/i
    );
    expect(
      await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 4000 })
    ).toBeInTheDocument();
  });

  test("order-failed shows the failure state with a working Try again", async () => {
    const { user } = await renderKoboApp();
    await reachCheckout(user);

    simulateTransakEvent("TRANSAK_ORDER_FAILED");

    const failed = await screen.findByRole("dialog", { name: /payment didn't go through/i });
    expect(within(failed).getByText(/no funds were moved/i)).toBeInTheDocument();

    await user.click(within(failed).getByRole("button", { name: /try again/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });

  test("closing the widget without paying is treated as a cancel", async () => {
    const { user } = await renderKoboApp();
    const checkout = await reachCheckout(user);

    await user.click(within(checkout).getByRole("button", { name: /close checkout/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/payment cancelled — nothing was charged/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });

  test("a TRANSAK_WIDGET_CLOSE message is also treated as a cancel", async () => {
    const { user } = await renderKoboApp();
    await reachCheckout(user);

    simulateTransakEvent("TRANSAK_WIDGET_CLOSE");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/payment cancelled — nothing was charged/i)).toBeInTheDocument();
  });
});
