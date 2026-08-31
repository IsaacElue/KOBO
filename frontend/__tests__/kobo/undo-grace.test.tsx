import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

type User = Awaited<ReturnType<typeof renderKoboApp>>["user"];

async function reachUndoWindow(user: User) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const passcode = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(passcode).getByRole("button", { name: `Digit ${d}` }));
  }
  return screen.findByRole("dialog", { name: /sending .* to/i });
}

describe("undo grace window", () => {
  test("cancelling returns to the editable form and confirms nothing was sent", async () => {
    const { user } = await renderKoboApp({ undoGraceSeconds: 5 });

    const undo = await reachUndoWindow(user);
    await user.click(within(undo).getByRole("button", { name: /cancel transfer/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
    expect(await screen.findByText(/nothing left your account/i)).toBeInTheDocument();
  });

  test("letting it elapse advances to the processing checklist", async () => {
    const { user } = await renderKoboApp({ undoGraceSeconds: 1 });

    await reachUndoWindow(user);

    const status = await screen.findByRole("status", {}, { timeout: 4000 });
    expect(status).toHaveTextContent(/securing your transaction/i);
  });
});
