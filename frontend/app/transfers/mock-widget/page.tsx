"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Stand-in for Transak's hosted widget, used only when NEXT_PUBLIC_KOBO_API_URL is
 * unset (mock mode). Lets you manually exercise every postMessage outcome the real
 * embedded flow has to handle. Never reachable once a real backend/Transak account
 * is wired up (createTransfer() only points here in the mock branch).
 */
function MockWidget() {
  const params = useSearchParams();
  const amount = params.get("amount") ?? "0.00";
  const reference = params.get("reference") ?? "—";

  function send(eventId: string) {
    window.parent.postMessage({ event_id: eventId }, window.location.origin);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-kobo-bg p-8 text-center">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold tracking-widest text-[#8AA3A9]">
          TRANSAK (MOCK)
        </div>
        <div className="mt-2 text-2xl font-semibold text-kobo-ink">€{amount}</div>
        <div className="mt-1 font-mono text-xs text-[#9BB2B8]">{reference}</div>
      </div>
      <p className="max-w-xs text-sm text-[#5E7A81]">
        This stands in for Transak&apos;s real checkout in local/dev mode. Pick an outcome to
        simulate.
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={() => send("TRANSAK_ORDER_CREATED")} variant="outline">
          Simulate order created
        </Button>
        <Button
          onClick={() => send("TRANSAK_ORDER_SUCCESSFUL")}
          className="bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-kobo-mint-light"
        >
          Simulate payment success
        </Button>
        <Button onClick={() => send("TRANSAK_ORDER_FAILED")} variant="destructive">
          Simulate payment failure
        </Button>
        <Button onClick={() => send("TRANSAK_WIDGET_CLOSE")} variant="ghost">
          Close without paying
        </Button>
      </div>
    </div>
  );
}

export default function MockWidgetPage() {
  return (
    <Suspense>
      <MockWidget />
    </Suspense>
  );
}
