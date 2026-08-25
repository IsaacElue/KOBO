import { act, render, screen } from "@testing-library/react";
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
