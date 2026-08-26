import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, confirmSend } from "./test-utils";

describe("overlay dismissal + focus management", () => {
  test("Escape closes the passcode dialog and returns focus to the trigger", async () => {
    const { user } = await renderKoboApp();
    const trigger = screen.getByRole("button", { name: /confirm & continue/i });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /enter your passcode/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("Escape closes the add-recipient dialog and returns focus to the trigger", async () => {
    const { user } = await renderKoboApp();
    await user.click(screen.getByText("RECIPIENT").closest("button")!);
    const panel = screen.getByRole("region", { name: /saved recipients/i });
    await user.type(within(panel).getByPlaceholderText(/search saved recipients/i), "zzz-no-one");
    const trigger = within(panel).getByRole("button", { name: /add new recipient/i });

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: /add new recipient/i });
    expect(dialog).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("Escape closes the transfer detail dialog and returns focus to the trigger", async () => {
    const { user } = await renderKoboApp();
    const trigger = screen.getByText("Chidi Balogun").closest("button")!;

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /transfer details/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("Escape closes the success dialog and resets to the form", async () => {
    const { user } = await renderKoboApp();
    await confirmSend(user);
    await screen.findByRole("dialog", { name: /sent to adaeze/i }, { timeout: 4000 });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });

  test("the rest of the page is removed from the accessibility tree while the passcode dialog is open", async () => {
    const { user } = await renderKoboApp();
    await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
    screen.getByRole("dialog", { name: /enter your passcode/i });

    // Base UI's modal marks the rest of the page inert/aria-hidden while open, so
    // background controls disappear from the accessibility tree entirely - the
    // actual contract assistive tech and the trap both rely on. (Simulating its
    // internal focus-guard sentinel's Tab redirect isn't reliable under jsdom.)
    expect(
      screen.queryByRole("button", { name: /confirm & continue/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send money" })).not.toBeInTheDocument();
  });
});

describe("passcode keypad keyboard operability", () => {
  test("digits can be entered via keyboard alone", async () => {
    const { user } = await renderKoboApp();
    await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
    const dialog = screen.getByRole("dialog", { name: /enter your passcode/i });

    within(dialog).getByRole("button", { name: "Digit 1" }).focus();
    await user.keyboard("{Enter}");
    const dotsAfterOne = dialog.querySelectorAll('[data-slot="passcode-dot"][data-filled="true"]');
    expect(dotsAfterOne).toHaveLength(1);

    await user.tab();
    await user.keyboard(" ");
    const dotsAfterTwo = dialog.querySelectorAll('[data-slot="passcode-dot"][data-filled="true"]');
    expect(dotsAfterTwo).toHaveLength(2);
  });
});

describe("toast announcements", () => {
  test("toasts render inside an aria-live region", async () => {
    const { user } = await renderKoboApp();
    await user.click(screen.getByText("Chidi Balogun").closest("button")!);
    const dialog = screen.getByRole("dialog", { name: /transfer details/i });

    await user.click(within(dialog).getByRole("button", { name: /send again/i }));

    const toast = await screen.findByText(/details filled in/i);
    expect(toast.closest("[aria-live], [role='status'], [role='alert']")).not.toBeNull();
  });
});
