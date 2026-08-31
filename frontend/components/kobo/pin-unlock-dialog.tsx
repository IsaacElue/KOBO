"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { verifyPin } from "@/lib/kobo/auth";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const PIN_LENGTH = 4;

/**
 * Returning-visit fast-unlock: a real, already-authenticated Supabase
 * session is already restored (see AuthGate) — this is just the PIN gate on
 * top of it, same numeric-keypad visual language as PasscodeDialog/
 * PinSetupDialog. A wrong PIN never says anything about the account itself,
 * matching POST /auth/pin/verify's own success/failure-only contract.
 */
export function PinUnlockDialog({
  firstName,
  onUnlocked,
  onLogout,
}: {
  firstName: string;
  onUnlocked: () => void;
  onLogout: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  function handleKey(k: string) {
    if (checking || !k) return;
    if (k === "⌫") {
      setCode((c) => c.slice(0, -1));
      return;
    }
    if (code.length >= PIN_LENGTH) return;

    const next = code + k;
    setCode(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  async function submit(pin: string) {
    setChecking(true);
    setError("");
    try {
      const ok = await verifyPin(pin);
      if (ok) {
        onUnlocked();
      } else {
        setError("Incorrect PIN. Try again.");
        setCode("");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[440px] gap-0 rounded-[32px] border-none bg-gradient-to-b from-kobo-teal-700 via-kobo-teal-900/[0.98] to-kobo-teal-950 p-8 pb-7 shadow-[0_60px_110px_-40px_rgba(0,0,0,0.7)] ring-0"
      >
        <DialogTitle className="text-2xl font-semibold tracking-tight text-kobo-mint-light">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[14.5px] leading-relaxed text-kobo-mint-light/62">
          Enter your PIN to unlock Kobo.
        </DialogDescription>

        <div className="my-7 flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-[15px] rounded-full border-[1.5px] border-kobo-mint-light/32",
                code.length > i && "border-transparent bg-kobo-mint shadow-[0_0_18px_rgba(158,227,198,0.6)]"
              )}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-center text-sm text-kobo-mint-light/80">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k, i) => (
            <button
              key={i}
              type="button"
              disabled={!k || checking}
              aria-hidden={!k}
              aria-label={k === "⌫" ? "Backspace" : k ? `Digit ${k}` : undefined}
              onClick={() => handleKey(k)}
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
          <span className="text-[12.5px] text-kobo-mint-light/50">Never share this PIN with anyone</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-5 w-full text-center text-sm text-kobo-mint-light/55 hover:text-kobo-mint-light"
        >
          Not you? <span className="font-medium text-kobo-mint">Log out</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
