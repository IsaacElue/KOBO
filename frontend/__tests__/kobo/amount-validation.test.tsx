import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

// Override just `getBalance` so a test can hold it pending (the window this
// whole file's "neutral on load" cases are about) or resolve it to an arbitrary
// figure. Everything else — getRate, getMyTransfers, createTransfer — stays the
// real mock-mode implementation.
const { getBalance } = vi.hoisted(() => ({ getBalance: vi.fn() }));
vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, getBalance };
});

beforeEach(() => {
  // Default: a comfortably-funded account, matching the old mock fixture.
  getBalance.mockResolvedValue(2000);
});

afterEach(() => {
  getBalance.mockReset();
});

const amountField = () => screen.getByRole("textbox", { name: /amount to send/i });
const confirmButton = () => screen.getByRole("button", { name: /confirm & continue/i });
const overBalanceAlert = () => screen.queryByText(/more than your available balance/i);

describe("send amount validation", () => {
  test("a preset button shows as active once its value is entered", async () => {
    const { user } = await renderKoboApp();

    const preset = screen.getByRole("button", { name: "€100" });
    expect(preset).toHaveAttribute("aria-pressed", "false");

    await user.click(preset);
    expect(preset).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "€250" })).toHaveAttribute("aria-pressed", "false");
  });

  test("entering more than the available balance warns and disables Confirm & Continue", async () => {
    const { user } = await renderKoboApp();

    await user.clear(amountField());
    await user.type(amountField(), "999999");

    expect(screen.getByText(/more than your available balance/i)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test("a zero amount also disables Confirm & Continue", async () => {
    const { user } = await renderKoboApp();

    await user.clear(amountField());
    await user.type(amountField(), "0");

    expect(confirmButton()).toBeDisabled();
  });
});

describe("send amount — neutral on load", () => {
  test("loads with an empty amount, no over-balance warning, Confirm disabled", async () => {
    await renderKoboApp();

    expect(amountField()).toHaveValue("");
    expect(overBalanceAlert()).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    // no preset pre-selected
    expect(screen.getByRole("button", { name: "€250" })).toHaveAttribute("aria-pressed", "false");
  });

  test("stays neutral in the window BEFORE the balance loads", async () => {
    // The original bug: amount was pre-seeded to 250 and the over-balance check
    // (amount > balance) ran against balance's initial 0 before refreshBalance()
    // resolved — flashing the red error on every load, permanently when the real
    // balance was 0. Hold getBalance pending so `balance` never leaves 0 and
    // assert the form is still calm.
    getBalance.mockReturnValue(new Promise<number>(() => {}));

    await renderKoboApp();

    expect(amountField()).toHaveValue("");
    expect(amountField()).toHaveAttribute("aria-invalid", "false");
    expect(overBalanceAlert()).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test("stays neutral on load even when the real balance is 0", async () => {
    getBalance.mockResolvedValue(0);

    await renderKoboApp();

    expect(amountField()).toHaveValue("");
    expect(overBalanceAlert()).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test("once an amount over a (now loaded) zero balance is typed, the warning does appear", async () => {
    getBalance.mockResolvedValue(0);

    const { user } = await renderKoboApp();
    await user.type(amountField(), "10");

    expect(await screen.findByText(/more than your available balance/i)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});
