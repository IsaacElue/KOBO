"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { allowedOnrampOrigins, parseTransakMessage, type TransakBridgeEvent } from "@/lib/kobo/onramp-transak";

export function EmbeddedWidgetModal({
  embedUrl,
  onEvent,
}: {
  embedUrl: string;
  onEvent: (event: TransakBridgeEvent) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!allowedOnrampOrigins().includes(e.origin)) return;
      const event = parseTransakMessage(e.data);
      if (!event) return;
      if (event.kind === "widget-closed") {
        if (closedRef.current) return;
        closedRef.current = true;
      }
      onEvent(event);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onEvent]);

  function handleManualClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    onEvent({ kind: "widget-closed" });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transak checkout"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md"
      style={{ backgroundColor: "rgba(6,32,30,.5)" }}
    >
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)]" style={{ maxHeight: "calc(100vh - 80px)" }}>
        <button
          onClick={handleManualClose}
          aria-label="Close checkout"
          className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-kobo-ink shadow transition-transform hover:scale-105 active:scale-95"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>

        {!loaded && (
          <div className="absolute inset-0 flex flex-col gap-4 p-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-10 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
        )}

        <iframe
          src={embedUrl}
          title="Transak checkout"
          onLoad={() => setLoaded(true)}
          className="h-[600px] w-full flex-1 border-0"
          style={{ visibility: loaded ? "visible" : "hidden" }}
        />
      </div>
    </div>
  );
}
