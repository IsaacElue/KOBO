import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

async function openPasscode(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  // The send form loads with an empty amount; set one so Confirm is enabled.
  // Clear first — this helper is called twice in one test and the amount
  // persists across a "back to form".
  const amountInput = screen.getByRole("textbox", { name: /amount to send/i });
  await user.clear(amountInput);
  await user.type(amountInput, "250");
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  return screen.findByRole("dialog", { name: /enter your passcode/i });
}

function dots(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll('[data-slot="passcode-dot"]')).map(
    (el) => el.getAttribute("data-filled") === "true"
  );
}

describe("passcode dialog", () => {
  test("four digits fill four dots, backspace removes one", async () => {
    const { user } = await renderKoboApp();
    const dialog = await openPasscode(user);

    await user.click(within(dialog).getByRole("button", { name: "Digit 1" }));
    await user.click(within(dialog).getByRole("button", { name: "Digit 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Digit 3" }));

    expect(dots(dialog)).toEqual([true, true, true, false]);

    await user.click(within(dialog).getByRole("button", { name: /backspace/i }));
    expect(dots(dialog)).toEqual([true, true, false, false]);
  });

  test("the 4th digit auto-advances into the undo grace window", async () => {
    const { user } = await renderKoboApp({ undoGraceSeconds: 5 });
    const dialog = await openPasscode(user);

    for (const d of ["1", "2", "3", "4"]) {
      await user.click(within(dialog).getByRole("button", { name: `Digit ${d}` }));
    }

    expect(dots(dialog)).toEqual([true, true, true, true]);
    const undo = await screen.findByRole("dialog", { name: /sending .* to/i }, { timeout: 2000 });
    expect(within(undo).getByRole("button", { name: /cancel transfer/i })).toBeInTheDocument();
  });

  test("the close button returns to the form and clears the entered code", async () => {
    const { user } = await renderKoboApp();
    let dialog = await openPasscode(user);

    await user.click(within(dialog).getByRole("button", { name: "Digit 5" }));
    await user.click(within(dialog).getByRole("button", { name: "Digit 5" }));
    await user.click(within(dialog).getByRole("button", { name: /back to form/i }));

    expect(screen.queryByRole("dialog", { name: /enter your passcode/i })).not.toBeInTheDocument();

    dialog = await openPasscode(user);
    expect(dots(dialog)).toEqual([false, false, false, false]);
  });
});
