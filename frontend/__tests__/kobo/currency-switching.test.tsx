import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";
import { CURRENCIES, BALANCES } from "@/lib/kobo/mock-data";
import { formatAmount } from "@/lib/kobo/format";

async function switchCurrency(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>,
  code: "GBP" | "USD"
) {
  await user.click(screen.getByRole("combobox", { name: /send currency/i }));
  await user.click(await screen.findByRole("option", { name: code }));
}

describe("currency switching", () => {
  test("EUR → GBP → USD updates symbol, presets, balance, rate readouts, fee/sent rows and subhead", async () => {
    const { user } = await renderKoboApp();

    expect(screen.getByText(/euros from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "€50" })).toBeInTheDocument();

    await switchCurrency(user, "GBP");

    expect(screen.getByText(/pounds from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "£50" })).toBeInTheDocument();
    expect(
      screen.getAllByText(`£${formatAmount(BALANCES.GBP)}`, { exact: false }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/1 GBP = /)).toBeInTheDocument();
    expect(screen.getByText(/^1 GBP ≈/)).toBeInTheDocument();
    expect(screen.getByText("£250.00")).toBeInTheDocument();

    await switchCurrency(user, "USD");

    expect(screen.getByText(/dollars from your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "$50" })).toBeInTheDocument();
    expect(
      screen.getAllByText(`$${formatAmount(BALANCES.USD)}`, { exact: false }).length
    ).toBeGreaterThan(0);
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
