import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

const recipientCard = () => within(screen.getByText("RECIPIENT").closest("button") as HTMLElement);

describe("recipient identity in the Send flow", () => {
  test("the recipient card leads with name + email + country, not the wallet address", async () => {
    await renderKoboApp();

    const card = recipientCard();
    expect(card.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(card.getByText("adaeze@example.com")).toBeInTheDocument();
    expect(card.getByText(/Nigeria/)).toBeInTheDocument();
    // the raw wallet address is not surfaced here
    expect(card.queryByText(/0x7a3f/)).not.toBeInTheDocument();
  });

  test("the summary panel identifies the recipient as a person", async () => {
    const { user } = await renderKoboApp();
    await user.type(screen.getByRole("textbox", { name: /amount to send/i }), "100");

    const panel = within(
      screen.getByText(/recipient receives/i).closest("[data-slot='card']") as HTMLElement
    );
    expect(panel.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(panel.getByText("adaeze@example.com")).toBeInTheDocument();
    expect(panel.getByText(/Nigeria/)).toBeInTheDocument();
  });

  test("a recipient added by email carries that email onto the card", async () => {
    const { user } = await renderKoboApp();
    await user.click(screen.getByText("RECIPIENT").closest("button")!);
    const region = screen.getByRole("region", { name: /saved recipients/i });
    await user.type(within(region).getByPlaceholderText(/search saved recipients/i), "zzz");
    await user.click(within(region).getByRole("button", { name: /add new recipient/i }));

    const dialog = await screen.findByRole("dialog", { name: /add new recipient/i });
    await user.type(within(dialog).getByLabelText(/name/i), "Bola Ade");
    await user.type(within(dialog).getByLabelText(/email address/i), "bola@example.com");
    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));

    await screen.findByText(/bola ade added as a recipient/i);
    expect(recipientCard().getByText("bola@example.com")).toBeInTheDocument();
  });
});
