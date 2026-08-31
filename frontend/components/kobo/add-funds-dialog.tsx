"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AMOUNT_PRESETS } from "@/lib/kobo/mock-data";
import { getRate } from "@/lib/kobo/api";
import type { FundingRail } from "@/lib/kobo/types";

/**
 * Funding-method picker (KOBO — CROSSMINT FRONTEND INTEGRATION, Step 3a).
 * Two options, both send `rail` explicitly — never the backend's
 * ONRAMP_PROVIDER default. Transak has no picker entry (still reachable
 * only via ONRAMP_PROVIDER=transak server default for whatever legacy path
 * still calls the rail-less API shape; not this dialog).
 */
export function AddFundsDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amountEur: number, rail: FundingRail) => void;
}) {
  const [amount, setAmount] = useState("100");
  const [estUsdc, setEstUsdc] = useState<number | null>(null);
  const numericAmount = parseFloat(amount) || 0;

  useEffect(() => {
    if (!open || numericAmount <= 0) {
      setEstUsdc(null);
      return;
    }
    let cancelled = false;
    getRate("EUR")
      .then((rate) => {
        if (!cancelled) setEstUsdc(Number((numericAmount * rate).toFixed(2)));
      })
      .catch(() => {
        if (!cancelled) setEstUsdc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, numericAmount]);

  function reset() {
    setAmount("100");
    setEstUsdc(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function pick(rail: FundingRail) {
    if (numericAmount <= 0) return;
    onSubmit(numericAmount, rail);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>
            Real USDC lands in your Kobo balance via our licensed on-ramp partners.
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
            {estUsdc !== null && (
              <p className="text-xs text-kobo-ink/50">≈ {estUsdc.toFixed(2)} USDC</p>
            )}
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

        <div className="mt-5 flex flex-col gap-2">
          <p className="text-xs font-medium text-kobo-ink/50">Choose how to pay</p>
          <button
            type="button"
            onClick={() => pick("crossmint")}
            disabled={numericAmount <= 0}
            aria-label="Card / Apple Pay"
            className="w-full rounded-2xl bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-4 py-3 text-left text-sm font-semibold text-kobo-mint-light transition-opacity disabled:opacity-40"
          >
            Card / Apple Pay
            <span className="mt-0.5 block text-xs font-normal text-kobo-mint-light/70">
              Fast, in-app checkout
            </span>
          </button>
          <button
            type="button"
            onClick={() => pick("moonpay")}
            disabled={numericAmount <= 0}
            aria-label="Card"
            className="w-full rounded-2xl border border-kobo-ink/[0.12] bg-white px-4 py-3 text-left text-sm font-semibold text-kobo-ink transition-opacity hover:border-kobo-teal-600 disabled:opacity-40"
          >
            Card
            <span className="mt-0.5 block text-xs font-normal text-kobo-ink/50">
              Redirects to our payment partner
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
