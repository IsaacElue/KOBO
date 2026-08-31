"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";

/**
 * Step 4 of the send flow (design handoff): a 5-second grace window after the
 * passcode, before anything is broadcast. The real `createTransfer` call only
 * fires if this window elapses without a cancel — so "Cancel transfer" here
 * genuinely means nothing left the account. Framing is protective, never a
 * threatening countdown.
 */
export function UndoGraceDialog({
  open,
  sentStr,
  firstName,
  secondsRemaining,
  totalSeconds,
  onCancel,
}: {
  open: boolean;
  sentStr: string;
  firstName: string;
  secondsRemaining: number;
  totalSeconds: number;
  onCancel: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[440px] gap-0 rounded-[32px] border-none bg-gradient-to-b from-kobo-teal-700 via-kobo-teal-900/[0.98] to-kobo-teal-950 p-8 pb-7 shadow-[0_60px_110px_-40px_rgba(0,0,0,0.7)] ring-0"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-kobo-mint/[0.14]">
            <ShieldCheck className="size-4 text-kobo-mint" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[19px] font-semibold tracking-tight text-kobo-mint-light">
              Sending {sentStr} to {firstName}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13.5px] text-kobo-mint-light/60">
              Broadcasts in {secondsRemaining}s. You can still stop it.
            </DialogDescription>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1E9B76] to-kobo-mint transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>

        <Button
          onClick={onCancel}
          variant="outline"
          className="mt-5.5 h-auto w-full gap-2.5 rounded-full border-white/18 bg-white/[0.07] py-4 text-[15px] font-semibold text-kobo-mint-light hover:border-[#B4472E]/50 hover:bg-[#B4472E]/28 hover:text-white"
        >
          <X className="size-3.5" strokeWidth={2.3} />
          Cancel transfer
        </Button>
      </DialogContent>
    </Dialog>
  );
}
