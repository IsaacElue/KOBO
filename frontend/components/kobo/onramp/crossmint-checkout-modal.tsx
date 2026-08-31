"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  CrossmintProvider,
  CrossmintEmbeddedCheckout,
  CrossmintCheckoutProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";

const CLIENT_API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY;

/**
 * Watches the SDK's own order state (useCrossmintCheckout) purely for a
 * cosmetic "selecting" -> "processing" label change in the parent — never
 * the source of truth for whether the funding request actually succeeded.
 * That's always GET /funding/:id polling (started independently, the same
 * instant this modal mounts — see kobo-app.tsx), exactly the same
 * "the widget only ever signals checkout ended, never the real outcome"
 * principle already documented for the Transak embedded flow. If this
 * hook's `order.phase` ever behaves differently than expected, the only
 * consequence is the label staying on "selecting" a bit longer — polling
 * is unaffected.
 */
function ProcessingWatcher({ onProcessing }: { onProcessing: () => void }) {
  const { order } = useCrossmintCheckout();
  useEffect(() => {
    if (order?.phase && order.phase !== "payment") {
      onProcessing();
    }
  }, [order?.phase, onProcessing]);
  return null;
}

export function CrossmintCheckoutModal({
  orderId,
  clientSecret,
  receiptEmail,
  onClose,
  onProcessing,
}: {
  orderId: string;
  clientSecret: string;
  /** Optional — purely for Crossmint's own checkout UI (pre-fill/receipt).
   * The order's actual receipt email was already set server-side at
   * creation time (routes/funding.ts, from the authenticated session). */
  receiptEmail?: string;
  onClose: () => void;
  onProcessing: () => void;
}) {
  if (!CLIENT_API_KEY) {
    // Shouldn't happen in a real deploy (see KOBO_BUILD_PLAN.md's founder
    // console pre-reqs) — fail loud rather than silently render nothing.
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crossmint checkout"
        className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md"
        style={{ backgroundColor: "rgba(6,32,30,.5)" }}
      >
        <div className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center text-sm text-kobo-ink">
          Card checkout isn&apos;t configured on this deploy (missing NEXT_PUBLIC_CROSSMINT_CLIENT_KEY).
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-full bg-kobo-teal-700 py-2 text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crossmint checkout"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md"
      style={{ backgroundColor: "rgba(6,32,30,.5)" }}
    >
      <div
        className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)]"
        style={{ maxHeight: "calc(100vh - 80px)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close checkout"
          className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-kobo-ink shadow transition-transform hover:scale-105 active:scale-95"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>

        <div className="max-h-[calc(100vh-80px)] overflow-y-auto p-6 pt-14">
          <CrossmintProvider apiKey={CLIENT_API_KEY}>
            <CrossmintCheckoutProvider>
              <ProcessingWatcher onProcessing={onProcessing} />
              <CrossmintEmbeddedCheckout
                orderId={orderId}
                clientSecret={clientSecret}
                payment={{
                  receiptEmail,
                  crypto: { enabled: false },
                  fiat: { enabled: true },
                  defaultMethod: "fiat",
                }}
              />
            </CrossmintCheckoutProvider>
          </CrossmintProvider>
        </div>
      </div>
    </div>
  );
}
