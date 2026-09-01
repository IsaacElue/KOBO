"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/kobo/mock-data";
import type { CurrencyCode } from "@/lib/kobo/types";

export function SendAmountCard({
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  presets,
  onPickPreset,
  balance,
  balanceValue,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  presets: number[];
  onPickPreset: (value: number) => void;
  balance: string;
  balanceValue: number;
}) {
  const meta = CURRENCIES[currency];
  const numericAmount = parseFloat(amount) || 0;
  const overBalance = numericAmount > balanceValue;

  return (
    <Card className="gap-4 rounded-[30px] border border-white/90 bg-gradient-to-br from-white to-[#FBFDFD] p-7 pb-6 shadow-[0_30px_60px_-44px_rgba(11,31,36,0.7)] ring-0">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold tracking-[0.16em] text-[#8AA3A9]">
          YOU SEND
        </span>
        <Select value={currency} onValueChange={(v) => onCurrencyChange(v as CurrencyCode)}>
          <SelectTrigger
            aria-label="Send currency"
            className="h-auto rounded-full border-kobo-ink/[0.06] bg-[#EFF5F6] px-3.5 py-2 text-sm font-semibold text-kobo-ink"
          >
            <span
              className="inline-block h-3 w-[18px] rounded-sm"
              style={{ backgroundColor: meta.flagColor }}
            />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(CURRENCIES).map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-baseline gap-2.5">
        <span className="text-4xl font-light text-[#94ADB3]">{meta.symbol}</span>
        <input
          value={amount}
          onChange={(e) => onAmountChange(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder="0"
          aria-label="Amount to send"
          aria-invalid={overBalance}
          className={cn(
            "w-full min-w-0 border-none bg-transparent p-0 text-5xl font-semibold tabular-nums tracking-tight outline-none placeholder:text-[#C3D2D5] sm:text-[66px]",
            overBalance ? "text-destructive" : "text-kobo-ink"
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        {presets.map((value) => {
          const active = numericAmount === value;
          return (
            <Button
              key={value}
              variant="outline"
              onClick={() => onPickPreset(value)}
              aria-pressed={active}
              className={cn(
                "h-auto rounded-full px-6 py-3 text-[15px] font-medium hover:-translate-y-0.5",
                active
                  ? "border-transparent bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-kobo-mint-light hover:opacity-95 hover:text-kobo-mint-light"
                  : "border-kobo-ink/[0.12] bg-white text-[#33565E] hover:border-kobo-teal-600 hover:text-kobo-ink"
              )}
            >
              {meta.symbol}
              {value}
            </Button>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm text-[#7B959B]">
          <span className="size-1.5 rounded-full bg-[#2EA37E]" />
          Balance <span className="font-medium text-[#3E5B62]">{balance}</span> available
        </div>
      </div>

      {overBalance && (
        <p role="alert" className="-mt-1.5 text-[13.5px] font-medium text-destructive">
          That&apos;s more than your available balance.
        </p>
      )}
    </Card>
  );
}
