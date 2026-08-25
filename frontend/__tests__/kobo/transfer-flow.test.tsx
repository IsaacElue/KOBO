import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, simulateTransakEvent } from "./test-utils";
import { formatAmount } from "@/lib/kobo/format";

/** Passcode → mock Transak checkout → simulated successful payment → processing begins. */
async function enterPasscode(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const dialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(dialog).getByRole("button", { name: `Digit ${d}` }));
  }
  await screen.findByRole("dialog", { name: /transak checkout/i }, { timeout: 2000 });
  simulateTransakEvent("TRANSAK_ORDER_SUCCESSFUL");
}

describe("processing → success", () => {
  test("advances through the three status labels in order, then renders success", async () => {
    const { user } = await renderKoboApp();
    await enterPasscode(user);

    const status = await screen.findByRole("status", {}, { timeout: 2000 });
    expect(status).toHaveTextContent(/securing your transfer/i);

    expect(
      await screen.findByText(/converting eur to usdc/i, {}, { timeout: 2000 })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/broadcasting on base/i, {}, { timeout: 2000 })
    ).toBeInTheDocument();

    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 2000 });
    expect(success).toBeInTheDocument();
  });

  test("the receipt shows recipient, reference, rate and fee derived from real math", async () => {
    const { user } = await renderKoboApp();

    // €250 is the default amount; capture the live rate off the summary panel before confirming.
    const rateText = screen.getByText(/^1 EUR ≈/).textContent!;
    const rate = parseFloat(rateText.match(/([\d.]+) USDC/)![1]);

    await enterPasscode(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 4000 });

    const expectedFee = 250 * 0.0053;
    const expectedReceive = (250 - expectedFee) * rate;

    expect(within(success).getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(within(success).getByText(/^KB-\d+-EU$/)).toBeInTheDocument();
    expect(within(success).getByText(`1 EUR = ${rate.toFixed(4)}`)).toBeInTheDocument();
    expect(within(success).getByText(`€${formatAmount(expectedFee)}`)).toBeInTheDocument();
    expect(within(success).getByText(formatAmount(expectedReceive), { exact: false })).toBeInTheDocument();
  });

  test("Done resets to the form", async () => {
    const { user } = await renderKoboApp();
    await enterPasscode(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 4000 });

    await user.click(within(success).getByRole("button", { name: /^done$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });

  test("Download receipt closes the dialog and shows a toast", async () => {
    const { user } = await renderKoboApp();
    await enterPasscode(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 4000 });

    await user.click(within(success).getByRole("button", { name: /download receipt/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/receipt downloaded/i)).toBeInTheDocument();
  });
});
