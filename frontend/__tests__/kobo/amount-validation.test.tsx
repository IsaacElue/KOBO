import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

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

    const amountInput = screen.getByRole("textbox", { name: /amount to send/i });
    await user.clear(amountInput);
    await user.type(amountInput, "999999");

    expect(screen.getByText(/more than your available balance/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeDisabled();
  });

  test("a zero amount also disables Confirm & Continue", async () => {
    const { user } = await renderKoboApp();

    const amountInput = screen.getByRole("textbox", { name: /amount to send/i });
    await user.clear(amountInput);
    await user.type(amountInput, "0");

    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeDisabled();
  });
});
