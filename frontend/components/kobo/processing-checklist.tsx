"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * Step 5 of the send flow (design handoff): replaces the bare spinner with a
 * three-step checklist so the wait always has state detail. The steps advance on
 * a fixed cadence for reassurance; the *exit* to success/failure is driven by the
 * real transfer result in `kobo-app.tsx`, which also holds the flow here for a
 * minimum dwell so the checklist is never a flash.
 */
export const SEND_PROCESSING_STEPS = [
  "Securing your transaction",
  "Applying your protected rate",
  "Broadcasting on-chain",
] as const;

export function ProcessingChecklist({
  sentStr,
  firstName,
  stepMs = 900,
}: {
  sentStr: string;
  firstName: string;
  /** Time each step spends "running" before the next starts. */
  stepMs?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timers = SEND_PROCESSING_STEPS.slice(1).map((_, i) =>
      setTimeout(() => setActiveIndex(i + 1), stepMs * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [stepMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-kobo-teal-950/72 backdrop-blur-md"
    >
      <div className="w-[400px] max-w-[calc(100%-2rem)] rounded-[28px] bg-gradient-to-b from-kobo-teal-700 via-kobo-teal-900/[0.98] to-kobo-teal-950 p-7 pb-6 shadow-[0_60px_110px_-40px_rgba(0,0,0,0.7)]">
        <div className="mb-4.5 text-[11.5px] font-semibold tracking-[0.16em] text-kobo-mint-light/55">
          SENDING YOUR TRANSFER
        </div>

        <div className="flex flex-col gap-1">
          {SEND_PROCESSING_STEPS.map((label, i) => {
            const done = i < activeIndex;
            const running = i === activeIndex;
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-3.5 px-1 py-2.5 transition-opacity",
                  i <= activeIndex ? "opacity-100" : "opacity-45"
                )}
              >
                {done ? (
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full border border-kobo-mint/40 bg-kobo-mint/[0.18]">
                    <Check className="size-[13px] text-kobo-mint" strokeWidth={2.6} />
                  </span>
                ) : running ? (
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-kobo-mint/50">
                    <span className="size-2 rounded-full bg-kobo-mint motion-safe:animate-pulse" />
                  </span>
                ) : (
                  <span className="size-[26px] shrink-0 rounded-full border-[1.5px] border-kobo-mint-light/20" />
                )}
                <span className="flex-1 text-[15px] font-medium text-[#EDF8F5]">{label}</span>
                <span
                  className={cn(
                    "text-[12.5px] font-medium",
                    running ? "text-kobo-mint" : "text-kobo-mint-light/50"
                  )}
                >
                  {done ? "Done" : running ? "Running" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 border-t border-white/8 pt-4 text-[13px] text-kobo-mint-light/55">
          {sentStr} · {firstName}
        </div>
      </div>
    </div>
  );
}
