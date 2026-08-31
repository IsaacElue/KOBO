import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";

async function goToRecipients(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(sidebarNavButton("Recipients"));
  return screen.findByRole("heading", { name: "Recipients" });
}

describe("Recipients screen", () => {
  test("search filters the list, and shows a no-results empty state", async () => {
    const { user } = await renderKoboApp();
    await goToRecipients(user);

    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("Chidi Balogun")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search by name/i), "adaeze");
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.queryByText("Chidi Balogun")).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search by name/i));
    await user.type(screen.getByPlaceholderText(/search by name/i), "nobody here");
    expect(screen.getByText(/no one by that name/i)).toBeInTheDocument();
  });

  test("Send on a recipient card jumps to Send money with that recipient selected", async () => {
    const { user } = await renderKoboApp();
    await goToRecipients(user);

    const card = screen.getByText("Chidi Balogun").closest("[data-slot='card']") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /^send$/i }));

    await screen.findByRole("heading", { name: /send money home/i });
    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Chidi Balogun")).toBeInTheDocument();
  });

  test("removing a recipient asks for confirmation, then removes it", async () => {
    const { user } = await renderKoboApp();
    await goToRecipients(user);

    const card = screen.getByText("Chidi Balogun").closest("[data-slot='card']") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /remove chidi balogun/i }));

    const dialog = await screen.findByRole("alertdialog", { name: /remove chidi balogun/i });
    await user.click(within(dialog).getByRole("button", { name: /^remove$/i }));

    expect(screen.queryByText("Chidi Balogun")).not.toBeInTheDocument();
    expect(await screen.findByText(/chidi balogun removed/i)).toBeInTheDocument();
  });

  test("cancelling the confirm dialog keeps the recipient", async () => {
    const { user } = await renderKoboApp();
    await goToRecipients(user);

    const card = screen.getByText("Ngozi Eze").closest("[data-slot='card']") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /remove ngozi eze/i }));

    const dialog = await screen.findByRole("alertdialog", { name: /remove ngozi eze/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Ngozi Eze")).toBeInTheDocument();
  });
});
