"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShieldCheck, X } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PasscodeDialog({
  open,
  code,
  firstName,
  sentStr,
  receiveStr,
  onKeyPress,
  onBack,
}: {
  open: boolean;
  code: string;
  firstName: string;
  sentStr: string;
  receiveStr: string;
  onKeyPress: (key: string) => void;
  onBack: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onBack()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[440px] gap-0 rounded-[32px] border-none bg-gradient-to-b from-kobo-teal-700 via-kobo-teal-900/[0.98] to-kobo-teal-950 p-8 pb-7 shadow-[0_60px_110px_-40px_rgba(0,0,0,0.7)] ring-0"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-2xl font-semibold tracking-tight text-kobo-mint-light">
              Enter your passcode
            </DialogTitle>
            <DialogDescription className="mt-2 text-[14.5px] leading-relaxed text-kobo-mint-light/62">
              Sending <span className="font-medium text-kobo-mint">{sentStr}</span> to{" "}
              {firstName} · {receiveStr} USDC
            </DialogDescription>
          </div>
          <Button
            onClick={onBack}
            variant="outline"
            size="icon"
            aria-label="Back to form"
            className="size-11 shrink-0 rounded-full border-white/18 bg-white/[0.06] text-kobo-mint-light hover:bg-white/16"
          >
            <X className="size-[15px]" strokeWidth={2.2} />
          </Button>
        </div>

        <div className="my-7 flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              data-slot="passcode-dot"
              data-filled={code.length > i}
              className={cn(
                "size-[15px] rounded-full border-[1.5px] border-kobo-mint-light/32",
                code.length > i && "border-transparent bg-kobo-mint shadow-[0_0_18px_rgba(158,227,198,0.6)]"
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k, i) => (
            <button
              key={i}
              type="button"
              disabled={!k}
              aria-hidden={!k}
              aria-label={k === "⌫" ? "Backspace" : k ? `Digit ${k}` : undefined}
              onClick={() => onKeyPress(k)}
              className={cn(
                "h-[60px] rounded-[20px] border border-white/10 bg-white/[0.07] text-[22px] font-medium text-[#EDF8F5] transition-all active:scale-[0.93] active:bg-kobo-mint/28",
                !k && "pointer-events-none opacity-0",
                k && "hover:bg-white/15"
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-[13px] text-kobo-mint-light/50" strokeWidth={1.8} />
          <span className="text-[12.5px] text-kobo-mint-light/50">
            Never share this code with anyone
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
