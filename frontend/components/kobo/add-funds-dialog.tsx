"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AMOUNT_PRESETS } from "@/lib/kobo/mock-data";

export function AddFundsDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amountEur: number) => void;
}) {
  const [amount, setAmount] = useState("100");
  const numericAmount = parseFloat(amount) || 0;

  function reset() {
    setAmount("100");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (numericAmount <= 0) return;
    onSubmit(numericAmount);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add funds</DialogTitle>
            <DialogDescription>
              Real USDC lands in your Kobo balance via our licensed on-ramp partner.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="funding-amount" className="text-sm font-medium text-kobo-ink">
                Amount (EUR)
              </label>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-light text-[#94ADB3]">€</span>
                <input
                  id="funding-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  aria-label="Amount to add"
                  className="w-full min-w-0 border-none bg-transparent p-0 text-3xl font-semibold tabular-nums tracking-tight text-kobo-ink outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {AMOUNT_PRESETS.map((value) => {
                const active = numericAmount === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(String(value))}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                      active
                        ? "bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-kobo-mint-light"
                        : "border border-kobo-ink/[0.12] bg-white text-[#33565E] hover:border-kobo-teal-600"
                    )}
                  >
                    €{value}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={numericAmount <= 0}>
              Add funds
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
