import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, openTransferDetail } from "./test-utils";

describe("transfer detail → Send again", () => {
  test("opens from the Activity list and prefills the Send form", async () => {
    const { user } = await renderKoboApp();

    const { dialog } = await openTransferDetail(user, "Chidi Balogun");
    expect(within(dialog).getByText("€120.00")).toBeInTheDocument();
    expect(within(dialog).getByText("Delivered")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /send again/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Lands back on the Send screen with the transfer's amount + recipient filled.
    expect(await screen.findByRole("heading", { name: /send money home/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/amount to send/i)).toHaveValue("120");
    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Chidi Balogun")).toBeInTheDocument();
    expect(await screen.findByText(/details filled in/i)).toBeInTheDocument();
  });

  test("also opens from the Overview 'Recent transfers' preview", async () => {
    const { user } = await renderKoboApp();

    await user.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Overview" }));
    await screen.findByRole("heading", { name: /welcome back/i });

    const preview = within(
      screen.getByText("Recent transfers").closest("[data-slot='card']") as HTMLElement
    );
    await user.click((await preview.findByText("Chidi Balogun")).closest("button")!);

    const dialog = await screen.findByRole("dialog", { name: /transfer details/i });
    expect(within(dialog).getByText("€120.00")).toBeInTheDocument();
  });
});
