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
 * Confirm & Continue -> passcode -> 4 digits. With the default `undoGraceSeconds:
 * 0` from `renderKoboApp`, entering the fourth digit advances straight to the
 * processing checklist (the real instant-send path, no Transak checkout).
 */
export async function confirmSend(
  user: ReturnType<typeof import("@testing-library/user-event").default.setup>
) {
  await user.click(screen.getByRole("button", { name: /confirm & continue/i }));
  const passcodeDialog = await screen.findByRole("dialog", { name: /enter your passcode/i });
  for (const d of ["1", "2", "3", "4"]) {
    await user.click(within(passcodeDialog).getByRole("button", { name: `Digit ${d}` }));
  }
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
