"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function ProcessingOverlay({
  open,
  label,
  sentStr,
  firstName,
  onDismiss,
  dismissAfterMs = 45000,
}: {
  open: boolean;
  label: string;
  sentStr: string;
  firstName: string;
  /**
   * Optional. When provided, a "still processing, safe to leave" dismiss
   * action appears after `dismissAfterMs`. Undefined at every existing
   * MoonPay/Transak call-site — those keep today's non-dismissible overlay
   * unchanged. Added for the Crossmint checkout flow (KOBO — CROSSMINT
   * FRONTEND INTEGRATION), whose webhook confirmation can take longer than
   * a user wants to sit on this screen for.
   */
  onDismiss?: () => void;
  dismissAfterMs?: number;
}) {
  const [showDismiss, setShowDismiss] = useState(false);

  useEffect(() => {
    if (!open || !onDismiss) {
      setShowDismiss(false);
      return;
    }
    const t = setTimeout(() => setShowDismiss(true), dismissAfterMs);
    return () => clearTimeout(t);
  }, [open, onDismiss, dismissAfterMs]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-kobo-teal-950/72 backdrop-blur-md"
    >
      <Loader2
        className="size-[52px] motion-safe:animate-spin text-kobo-mint"
        strokeWidth={1.5}
      />
      <div className="text-center">
        <div className="text-[19px] font-semibold tracking-tight text-kobo-mint-light">
          {label}
        </div>
        <div className="mt-1.5 text-sm text-kobo-mint-light/55">
          {sentStr} · {firstName}
        </div>
      </div>
      {onDismiss && showDismiss && (
        <div className="mt-2 flex flex-col items-center gap-2 text-center">
          <p className="max-w-[280px] text-sm text-kobo-mint-light/70">
            Still processing — you can safely close this. We&apos;ll update your balance automatically.
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-kobo-mint-light/25 px-4 py-1.5 text-sm font-medium text-kobo-mint-light hover:bg-kobo-mint-light/10"
          >
            Close — I&apos;ll check back later
          </button>
        </div>
      )}
    </div>
  );
}
