import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

function openPicker(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  return user.click(screen.getByText("RECIPIENT").closest("button")!);
}

describe("recipient picker", () => {
  test("opens on click and shows saved recipients", async () => {
    const { user } = await renderKoboApp();

    expect(screen.queryByRole("region", { name: /saved recipients/i })).not.toBeInTheDocument();

    await openPicker(user);

    const panel = screen.getByRole("region", { name: /saved recipients/i });
    expect(within(panel).getByPlaceholderText(/search saved recipients/i)).toBeInTheDocument();
    expect(within(panel).getByText("Chidi Balogun")).toBeInTheDocument();
    expect(within(panel).getByText("Ngozi Eze")).toBeInTheDocument();
  });

  test("search narrows results", async () => {
    const { user } = await renderKoboApp();
    await openPicker(user);
    const panel = screen.getByRole("region", { name: /saved recipients/i });

    await user.type(within(panel).getByPlaceholderText(/search saved recipients/i), "chidi");

    expect(within(panel).getByText("Chidi Balogun")).toBeInTheDocument();
    expect(within(panel).queryByText("Ngozi Eze")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Emeka Nwachukwu")).not.toBeInTheDocument();
  });

  test("selecting a recipient updates the recipient card and closes the picker", async () => {
    const { user } = await renderKoboApp();
    await openPicker(user);
    const panel = screen.getByRole("region", { name: /saved recipients/i });

    await user.click(within(panel).getByText("Chidi Balogun").closest("button")!);

    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Chidi Balogun")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /saved recipients/i })).not.toBeInTheDocument();
  });

  test("a query with no matches shows the empty state", async () => {
    const { user } = await renderKoboApp();
    await openPicker(user);
    const panel = screen.getByRole("region", { name: /saved recipients/i });

    await user.type(within(panel).getByPlaceholderText(/search saved recipients/i), "zzz-no-one");

    expect(within(panel).getByText(/no one by that name/i)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /add new recipient/i })).toBeInTheDocument();
  });

  test("add new recipient by email — rejects an empty/invalid email and adds a valid one", async () => {
    const { user } = await renderKoboApp();
    await openPicker(user);
    const panel = screen.getByRole("region", { name: /saved recipients/i });
    await user.type(within(panel).getByPlaceholderText(/search saved recipients/i), "zzz-no-one");
    await user.click(within(panel).getByRole("button", { name: /add new recipient/i }));

    const dialog = await screen.findByRole("dialog", { name: /add new recipient/i });
    // Email is the default/primary mode — no toggle click needed.
    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/enter the recipient's email address/i);

    await user.type(within(dialog).getByLabelText(/email address/i), "not-an-email");
    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/doesn't look like a valid email address/i);

    await user.clear(within(dialog).getByLabelText(/email address/i));
    await user.type(within(dialog).getByLabelText(/name/i), "Folake Adeyemi");
    await user.type(within(dialog).getByLabelText(/email address/i), "folake@example.com");
    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));

    // createUser() (mock mode) resolves after a real setTimeout — wait for the
    // dialog to actually close rather than assuming the submit settled by now.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /add new recipient/i })).not.toBeInTheDocument();
    });
    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Folake Adeyemi")).toBeInTheDocument();
    expect(await screen.findByText(/folake adeyemi added as a recipient/i)).toBeInTheDocument();
  });

  test("add new recipient by pasted address — via the 'paste it instead' toggle", async () => {
    const { user } = await renderKoboApp();
    await openPicker(user);
    const panel = screen.getByRole("region", { name: /saved recipients/i });
    await user.type(within(panel).getByPlaceholderText(/search saved recipients/i), "zzz-no-one");
    await user.click(within(panel).getByRole("button", { name: /add new recipient/i }));

    const dialog = await screen.findByRole("dialog", { name: /add new recipient/i });
    await user.click(within(dialog).getByRole("button", { name: /paste it instead/i }));

    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/enter a solana wallet address/i);

    await user.type(within(dialog).getByLabelText(/name/i), "Tunde Bakare");
    await user.type(
      within(dialog).getByLabelText(/solana wallet address/i),
      "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    );
    await user.click(within(dialog).getByRole("button", { name: /add recipient/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /add new recipient/i })).not.toBeInTheDocument();
    });
    const recipientCard = screen.getByText("RECIPIENT").closest("button")!;
    expect(within(recipientCard).getByText("Tunde Bakare")).toBeInTheDocument();
  });
});
