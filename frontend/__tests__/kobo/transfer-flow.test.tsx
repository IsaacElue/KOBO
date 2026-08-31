import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, confirmSend } from "./test-utils";
import { formatAmount } from "@/lib/kobo/format";

describe("processing → success", () => {
  test("runs the 3-step processing checklist, then renders success", async () => {
    const { user } = await renderKoboApp();
    await confirmSend(user);

    const status = await screen.findByRole("status", {}, { timeout: 2000 });
    expect(status).toHaveTextContent(/securing your transaction/i);
    expect(status).toHaveTextContent(/applying your protected rate/i);
    expect(status).toHaveTextContent(/broadcasting on-chain/i);

    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 5000 });
    expect(success).toBeInTheDocument();
  });

  test("the receipt shows recipient, reference, rate and fee derived from real math", async () => {
    const { user } = await renderKoboApp();

    // €250 is the default amount; capture the exact 4dp rate off the header
    // ticker before confirming (the summary panel's top line is a coarse 2dp
    // "about" figure now).
    const rateText = screen.getByText(/^1 EUR = /).textContent!;
    const rate = parseFloat(rateText.match(/([\d.]+) USDC/)![1]);

    await confirmSend(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 6000 });

    const expectedFee = 250 * 0.0053;
    const expectedReceive = (250 - expectedFee) * rate;

    expect(within(success).getByText("Adaeze Okonkwo")).toBeInTheDocument();
    // onramp_reference is always null for an instant-send transfer (it never
    // touches Transak); the reference shown falls back to the transfer's real id.
    expect(within(success).getByText(/^tr_[a-z0-9]+$/)).toBeInTheDocument();
    expect(within(success).getByText(`1 EUR = ${rate.toFixed(4)}`)).toBeInTheDocument();
    expect(within(success).getByText(`€${formatAmount(expectedFee)}`)).toBeInTheDocument();
    expect(within(success).getByText(formatAmount(expectedReceive), { exact: false })).toBeInTheDocument();
  });

  test("Done resets to the form", async () => {
    const { user } = await renderKoboApp();
    await confirmSend(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 6000 });

    await user.click(within(success).getByRole("button", { name: /^done$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });

  test("Download receipt closes the dialog and shows a toast", async () => {
    const { user } = await renderKoboApp();
    await confirmSend(user);
    const success = await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 6000 });

    await user.click(within(success).getByRole("button", { name: /download receipt/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(/receipt downloaded/i)).toBeInTheDocument();
  });
});
