"use client";

import { Loader2 } from "lucide-react";

export function ProcessingOverlay({
  open,
  label,
  sentStr,
  firstName,
}: {
  open: boolean;
  label: string;
  sentStr: string;
  firstName: string;
}) {
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
    </div>
  );
}
