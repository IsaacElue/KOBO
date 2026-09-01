import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";
import type { FxQuoteResult } from "@/lib/kobo/fx";

const { getQuote } = vi.hoisted(() => ({ getQuote: vi.fn() }));
vi.mock("@/lib/kobo/fx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/fx")>();
  return { ...actual, koboFxProvider: { getQuote } };
});

function available(source: "transak-market" | "mock", rate = 1.0837): FxQuoteResult {
  return {
    available: true,
    base: "EUR",
    quote: "USDC",
    rate,
    timestamp: new Date().toISOString(),
    source,
    expiresAt: null,
  };
}
const unavailable: FxQuoteResult = {
  available: false,
  base: "EUR",
  quote: "USDC",
  reason: "provider_error",
};

const amountField = () => screen.getByRole("textbox", { name: /amount to send/i });
const confirmButton = () => screen.getByRole("button", { name: /confirm & continue/i });
const summary = () =>
  within(screen.getByText(/recipient receives/i).closest("[data-slot='card']") as HTMLElement);

describe("Send — quote safety", () => {
  beforeEach(() => getQuote.mockReset());

  test("when the rate is unavailable, the conversion is not shown and Confirm is blocked", async () => {
    getQuote.mockResolvedValue(unavailable);
    const { user } = await renderKoboApp();

    await user.type(amountField(), "250");

    expect(await screen.findByText(/rate unavailable/i)).toBeInTheDocument();
    // no fabricated destination amount
    expect(summary().getByText("—")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  test("an unavailable rate keeps the passcode gate shut for any amount", async () => {
    getQuote.mockResolvedValue(unavailable);
    const { user } = await renderKoboApp();

    await user.type(amountField(), "250");
    expect(confirmButton()).toBeDisabled();
    await user.click(confirmButton()); // disabled — no-op

    expect(screen.queryByRole("dialog", { name: /enter your passcode/i })).not.toBeInTheDocument();
  });

  test("a verified market rate is labelled by source and unlocks Confirm", async () => {
    getQuote.mockResolvedValue(available("transak-market"));
    const { user } = await renderKoboApp();
    await user.type(amountField(), "250");

    expect(summary().getByText(/1 EUR → 1\.0837 USDC/)).toBeInTheDocument();
    expect(summary().getByText(/market rate/i)).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  test("a mock-mode rate is explicitly labelled as a demo rate", async () => {
    getQuote.mockResolvedValue(available("mock"));
    await renderKoboApp();

    expect(await screen.findByText(/demo rate \(mock mode\)/i)).toBeInTheDocument();
  });

  test("the summary is ordered recipient → you send → receives → fee → total", async () => {
    getQuote.mockResolvedValue(available("transak-market"));
    const { user } = await renderKoboApp();
    await user.type(amountField(), "250");

    const s = summary();
    expect(s.getByText("To")).toBeInTheDocument();
    expect(s.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(s.getByText("adaeze@example.com")).toBeInTheDocument();
    expect(s.getByText("You send")).toBeInTheDocument();
    expect(s.getByText(/€250\.00 EUR/)).toBeInTheDocument();
    expect(s.getByText("Conversion fee")).toBeInTheDocument();
    expect(s.getByText("Total charged to you")).toBeInTheDocument();
    expect(s.getByText(/recipient receives/i)).toBeInTheDocument();
    // no Solana wording in the primary flow
    expect(s.queryByText(/solana/i)).not.toBeInTheDocument();
  });
});
