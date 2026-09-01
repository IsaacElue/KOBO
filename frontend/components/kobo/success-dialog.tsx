"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Check, Sprout } from "lucide-react";
import type { Recipient } from "@/lib/kobo/types";
import type { HabitSummary } from "@/lib/kobo/habit";

export function SuccessDialog({
  open,
  recipient,
  firstName,
  currencyCode,
  sentStr,
  receiveStr,
  feeStr,
  rate,
  reference,
  habit,
  onDone,
  onDownloadReceipt,
}: {
  open: boolean;
  recipient: Pick<Recipient, "name" | "initials" | "wallet"> &
    Partial<Pick<Recipient, "email">>;
  firstName: string;
  currencyCode: string;
  sentStr: string;
  receiveStr: string;
  feeStr: string;
  rate: string;
  reference: string;
  habit: HabitSummary;
  onDone: () => void;
  onDownloadReceipt: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDone()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-4rem)] max-w-[520px] gap-0 overflow-y-auto rounded-[34px] border border-white/95 bg-gradient-to-b from-[#E7F7EE] to-[#FBFDFD] p-8 pb-7 shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)] ring-0 sm:p-10"
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative flex size-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[#1E9B76]/28" />
            <div className="relative flex size-[88px] items-center justify-center rounded-full bg-gradient-to-br from-kobo-teal-400 to-kobo-teal-700 shadow-lg shadow-kobo-teal-700/40">
              <Check className="size-10 text-[#EAFBF3]" strokeWidth={3.2} />
            </div>
          </div>
          <DialogTitle className="mt-5.5 text-[15px] font-medium tracking-wide text-[#3E7A68]">
            Sent to {firstName}
          </DialogTitle>
          <div className="mt-1.5 flex items-baseline gap-2 text-5xl font-semibold tabular-nums tracking-tight text-kobo-ink">
            {receiveStr}
            <span className="text-xl font-medium text-[#7B959B]">USDC</span>
          </div>
          <div className="mt-2 text-[15px] text-[#5E7A81]">
            {sentStr} debited · arriving in ~2 minutes
          </div>
        </div>

        {/* Kobo Habit Tracker — illustrative, see lib/kobo/habit.ts */}
        <div className="mt-5.5 rounded-[22px] border border-[#155E4C]/10 bg-white/75 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-[30px] items-center justify-center rounded-[10px] bg-kobo-mint-light">
              <Sprout className="size-[15px] text-kobo-mint-dark" strokeWidth={1.9} />
            </span>
            <span className="text-[14.5px] font-semibold tracking-tight text-[#0B4A45]">
              Kobo Habit Tracker
            </span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#5E7A81]">
            You&apos;ve hit your{" "}
            <span className="font-semibold text-kobo-teal-600">
              {habit.transferOrdinal} transfer this quarter
            </span>
            . Average delivery speed:{" "}
            <span className="font-mono text-[13.5px] text-kobo-ink">{habit.avgDeliveryStr}</span>.
          </p>
          <div className="mt-2.5 flex gap-1.5">
            {Array.from({ length: habit.segmentsTotal }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[5px] flex-1 rounded-full",
                  i < habit.segmentsFilled ? "bg-[#1E9B76]" : "bg-kobo-ink/10"
                )}
              />
            ))}
          </div>

          <div className="mt-4 border-t border-kobo-ink/[0.06] pt-3.5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-[11.5px] font-semibold tracking-[0.14em] text-[#7B959B]">
                MONTHLY VOLUME VS TARGET
              </span>
              <span className="text-xs text-[#5E7A81]">
                Target {habit.currencySymbol}
                {habit.monthlyTarget}/mo
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {habit.bars.map((bar) => {
                const width = Math.round((Math.min(bar.value, 340) / 340) * 100);
                const underTarget = bar.value <= habit.monthlyTarget;
                return (
                  <div key={bar.month} className="flex items-center gap-2.5">
                    <span className="w-7 shrink-0 text-xs text-[#5E7A81]">{bar.month}</span>
                    <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-kobo-ink/[0.05]">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          bar.current && underTarget
                            ? "bg-gradient-to-r from-[#1E9B76] to-kobo-teal-600"
                            : bar.current
                              ? "bg-kobo-ink/16"
                              : "bg-kobo-ink/10"
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "w-11 shrink-0 text-right font-mono text-[11.5px]",
                        bar.current ? "text-kobo-teal-600" : "text-[#7B959B]"
                      )}
                    >
                      {habit.currencySymbol}
                      {bar.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 min-w-0 rounded-3xl border border-kobo-ink/[0.06] bg-white/80 p-5.5 pb-4.5">
          <div className="flex items-center gap-3.5 border-b border-kobo-ink/[0.07] pb-4">
            <Avatar size="lg">
              <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
                {recipient.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[16.5px] font-semibold text-kobo-ink">{recipient.name}</div>
              <div
                className={cn(
                  "truncate text-[12.5px] text-[#8AA3A9]",
                  !recipient.email && "font-mono"
                )}
              >
                {recipient.email ?? recipient.wallet}
              </div>
            </div>
          </div>
          <Row label="Reference" value={reference} />
          <Row label="Rate" value={`1 ${currencyCode} = ${rate}`} />
          <Row label="Fee" value={feeStr} />
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={onDownloadReceipt}
            variant="outline"
            className="h-auto flex-1 rounded-full border-kobo-ink/[0.14] bg-white/90 py-4 text-base font-medium text-kobo-ink hover:-translate-y-0.5 hover:border-kobo-teal-600"
          >
            Download receipt
          </Button>
          <Button
            onClick={onDone}
            className="h-auto flex-[1.3] rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-4 text-base font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[#5E7A81]">{label}</span>
      <span className="font-mono text-[13.5px] text-kobo-ink">{value}</span>
    </div>
  );
}
