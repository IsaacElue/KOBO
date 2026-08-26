import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";
import { CURRENCIES } from "@/lib/kobo/mock-data";

async function switchCurrency(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>,
  code: "GBP" | "USD"
) {
  await user.click(screen.getByRole("combobox", { name: /send currency/i }));
  await user.click(await screen.findByRole("option", { name: code }));
}

/**
 * Balance is now real (mock mode: a random-live-rate USDC->currency conversion,
 * not a fixed fixture) — can't assert an exact expected figure, but every place
 * it's shown (sidebar, SendAmountCard) should show the *same* figure, proving
 * they share one real source instead of drifting. Reads the sidebar's own figure
 * first (scoped to the <aside> landmark, role "complementary") rather than a bare
 * currency-shaped regex over the whole page — the transfer summary's "Amount
 * sent" row happens to be formatted identically and would otherwise collide.
 */
function consistentBalanceFigures(symbol: "£" | "$") {
  const escaped = symbol === "£" ? "£" : "\\$";
  const sidebar = screen.getByRole("complementary");
  const sidebarBalance = within(sidebar).getByText(new RegExp(`^${escaped}[\\d,]+\\.\\d{2}$`));
  const value = sidebarBalance.textContent!;
  expect(screen.getAllByText(value).length).toBeGreaterThan(1);
}

describe("currency switching", () => {
  test("EUR → GBP → USD updates symbol, presets, balance, rate readouts, fee/sent rows and subhead", async () => {
    const { user } = await renderKoboApp();

    expect(screen.getByText(/euros from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "€50" })).toBeInTheDocument();

    await switchCurrency(user, "GBP");

    expect(screen.getByText(/pounds from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "£50" })).toBeInTheDocument();
    consistentBalanceFigures("£");
    expect(screen.getByText(/1 GBP = /)).toBeInTheDocument();
    expect(screen.getByText(/^1 GBP ≈/)).toBeInTheDocument();
    expect(screen.getByText("£250.00")).toBeInTheDocument();

    await switchCurrency(user, "USD");

    expect(screen.getByText(/dollars from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "$50" })).toBeInTheDocument();
    consistentBalanceFigures("$");
    expect(screen.getByText(/1 USD = /)).toBeInTheDocument();
    expect(screen.getByText(/^1 USD ≈/)).toBeInTheDocument();
    expect(screen.getByText("$250.00")).toBeInTheDocument();
  });

  test("currency metadata used by the app stays internally consistent", () => {
    expect(CURRENCIES.EUR.symbol).toBe("€");
    expect(CURRENCIES.GBP.symbol).toBe("£");
    expect(CURRENCIES.USD.symbol).toBe("$");
  });
});
