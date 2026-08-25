import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

describe("transfer detail → Send again", () => {
  test("prefills amount + recipient and toasts", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByText("Chidi Balogun").closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: /transfer details/i });
    expect(within(dialog).getByText("€120.00")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /send again/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/amount to send/i)).toHaveValue("120");
    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Chidi Balogun")).toBeInTheDocument();
    expect(await screen.findByText(/details filled in/i)).toBeInTheDocument();
  });
});
