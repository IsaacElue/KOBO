import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";

/** Renders the full app (with Toaster mounted) and waits past the loading skeleton. */
export async function renderKoboApp() {
  const user = userEvent.setup();
  const utils = render(
    <>
      <KoboApp />
      <Toaster />
    </>
  );
  await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });
  return { user, ...utils };
}

/**
 * Confirm & Continue -> passcode -> the in-app confirmation dialog (real
 * instant-send path, no Transak checkout). Stops right after entering the
 * passcode, before the confirmation dialog's own Confirm click, so callers
 * that need to assert on the confirmation step itself can do so first.
 */
export async function openPasscodeThenConfirmDialog(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>
) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const passcodeDialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(passcodeDialog).getByRole("button", { name: `Digit ${d}` }));
  }
  return screen.findByRole("dialog", { name: /confirm transfer/i });
}

/** Goes all the way through to a submitted instant send (passcode + confirmation dialog's Confirm click). */
export async function confirmSend(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>
) {
  const confirmDialog = await openPasscodeThenConfirmDialog(user);
  await user.click(within(confirmDialog).getByRole("button", { name: /^confirm$/i }));
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
