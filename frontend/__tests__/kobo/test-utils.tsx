import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";

/**
 * Renders the full app (with Toaster mounted) and waits past the loading
 * skeleton. `undoGraceSeconds` defaults to 0 here so `confirmSend` runs straight
 * through the post-passcode undo window without a real wait; pass a positive
 * value to exercise that window.
 */
export async function renderKoboApp(
  opts: { undoGraceSeconds?: number; processingStepMs?: number } = {}
) {
  const user = userEvent.setup();
  const utils = render(
    <>
      <KoboApp
        undoGraceSeconds={opts.undoGraceSeconds ?? 0}
        processingStepMs={opts.processingStepMs ?? 20}
      />
      <Toaster />
    </>
  );
  await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });
  return { user, ...utils };
}

/**
 * The desktop sidebar's nav button for a given label. Both the sidebar and the
 * mobile bottom bar carry the same labels; jsdom applies no CSS so both are in
 * the tree at once, and an unscoped `getByRole("button", { name })` would be
 * ambiguous. The sidebar is the `<aside>` (role "complementary").
 */
export function sidebarNavButton(label: string) {
  return within(screen.getByRole("complementary")).getByRole("button", { name: label });
}

/**
 * Enter an amount (the send form now loads with an empty amount field, not a
 * pre-filled €250), then Confirm & Continue -> passcode -> 4 digits. With the
 * default `undoGraceSeconds: 0` from `renderKoboApp`, entering the fourth digit
 * advances straight to the processing checklist (the real instant-send path, no
 * Transak checkout). `amount` defaults to "250" so existing fee/receive math in
 * the flow tests is unchanged.
 */
export async function confirmSend(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>,
  amount = "250"
) {
  const amountInput = screen.getByRole("textbox", { name: /amount to send/i });
  await user.clear(amountInput);
  await user.type(amountInput, amount);
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const passcodeDialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(passcodeDialog).getByRole("button", { name: `Digit ${d}` }));
  }
}

/**
 * Navigate to Activity, wait for the history list, and open the shared
 * TransferDetailDialog for the given recipient's row. Returns the row button
 * (the focus-return target) and the dialog.
 */
export async function openTransferDetail(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>,
  recipientName: string
) {
  await user.click(sidebarNavButton("Activity"));
  const row = (await screen.findByText(recipientName)).closest("button") as HTMLButtonElement;
  await user.click(row);
  const dialog = await screen.findByRole("dialog", { name: /transfer details/i });
  return { row, dialog };
}

/**
 * Dispatches a same-origin postMessage as the mock Transak widget would, so tests can
 * drive the embedded on-ramp step (order-created / order-successful / order-failed /
 * widget-closed) without needing the iframe's document to actually load under jsdom.
 */
export function simulateTransakEvent(eventId: string) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event_id: eventId },
        origin: window.location.origin,
      })
    );
  });
}

export * from "@testing-library/react";
