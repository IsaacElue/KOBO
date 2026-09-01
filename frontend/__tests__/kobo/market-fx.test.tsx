import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityScreen } from "@/components/kobo/activity-screen";

// The Activity screen fans out to several live feeds; in mock mode they all
// resolve to mock payloads, which is all this suite needs.
function renderActivity() {
  return render(<ActivityScreen onOpenDetail={vi.fn()} />);
}

describe("Market section", () => {
  test("crypto: SOL and USDC still render with prices", async () => {
    renderActivity();
    const marketCard = within(
      (await screen.findByText("Market")).closest("section") as HTMLElement
    );
    expect(await marketCard.findByText("Solana")).toBeInTheDocument();
    expect(marketCard.getAllByText("USDC").length).toBeGreaterThan(0);
    expect(marketCard.getByText(/designed to stay near \$1/i)).toBeInTheDocument();
    expect(marketCard.getByText("Crypto")).toBeInTheDocument();
  });

  test("FX: EUR→NGN is shown as unavailable, with no fabricated price", async () => {
    renderActivity();
    const marketCard = within(
      (await screen.findByText("Market")).closest("section") as HTMLElement
    );

    expect(marketCard.getByText("FX")).toBeInTheDocument();
    expect(marketCard.getByText(/EUR → NGN/)).toBeInTheDocument();
    expect(marketCard.getByText(/rate unavailable/i)).toBeInTheDocument();

    // nothing that looks like an actual naira quote
    expect(marketCard.queryByText(/₦\s?[\d,]+/)).not.toBeInTheDocument();
    expect(marketCard.queryByText(/1\s*EUR\s*[=→]\s*[\d.,]+\s*NGN/i)).not.toBeInTheDocument();
  });

  test("the FX section is labelled informational, not an executable quote", async () => {
    renderActivity();
    const marketCard = within(
      (await screen.findByText("Market")).closest("section") as HTMLElement
    );
    expect(marketCard.getByText(/informational only — not a remittance quote/i)).toBeInTheDocument();
  });
});
