"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

export function FailedDialog({
  open,
  reference,
  onTryAgain,
  onContactSupport,
}: {
  open: boolean;
  reference: string;
  onTryAgain: () => void;
  onContactSupport: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onTryAgain()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[520px] gap-0 rounded-[34px] border border-kobo-sand-dark/10 bg-gradient-to-b from-kobo-sand to-[#FBFDFD] p-9 pb-7 shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)] ring-0"
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative flex size-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-kobo-sand-dark/20" />
            <div className="relative flex size-[88px] items-center justify-center rounded-full bg-gradient-to-br from-[#B98A3F] to-kobo-sand-dark shadow-lg shadow-kobo-sand-dark/40">
              <TriangleAlert className="size-10 text-[#FFF8EC]" strokeWidth={2.6} />
            </div>
          </div>
          <DialogTitle className="mt-5.5 text-[15px] font-medium tracking-wide text-kobo-sand-dark">
            Payment didn&apos;t go through
          </DialogTitle>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-kobo-ink">
            Transfer failed
          </div>
          <div className="mt-2 text-[15px] text-[#5E7A81]">
            No funds were moved — your balance is unaffected.
          </div>
        </div>

        <div className="mt-6.5 rounded-3xl border border-kobo-sand-dark/15 bg-white/80 p-5.5 pb-4.5">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-[#5E7A81]">Reference</span>
            <span className="font-mono text-[13.5px] text-kobo-ink">{reference}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-[#5E7A81]">Status</span>
            <span className="font-mono text-[13.5px] text-kobo-sand-dark">Not completed</span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={onContactSupport}
            variant="outline"
            className="h-auto flex-1 rounded-full border-kobo-ink/[0.14] bg-white/90 py-4 text-base font-medium text-kobo-ink hover:-translate-y-0.5 hover:border-kobo-teal-600"
          >
            Contact support
          </Button>
          <Button
            onClick={onTryAgain}
            className="h-auto flex-[1.3] rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-4 text-base font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            Try again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
