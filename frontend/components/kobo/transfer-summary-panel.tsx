"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight } from "lucide-react";

export function TransferSummaryPanel({
  currencyCode,
  currencySymbol,
  rate,
  secsUntilLock,
  amountSent,
  fee,
  receiveUsdc,
  onConfirm,
}: {
  currencyCode: string;
  currencySymbol: string;
  rate: string;
  secsUntilLock: number;
  amountSent: number;
  fee: number;
  receiveUsdc: number;
  onConfirm: () => void;
}) {
  const lockPct = Math.round((secsUntilLock / 30) * 100);

  return (
    <Card className="sticky top-0 gap-0 rounded-[30px] border border-white/95 bg-gradient-to-br from-white/92 to-[#EEF5F6]/78 p-7 shadow-[0_34px_66px_-46px_rgba(11,31,36,0.75)] backdrop-blur-xl ring-0">
      <div className="flex items-center gap-3 border-b border-kobo-ink/[0.07] pb-4.5">
        <span className="relative size-2 shrink-0">
          <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-[#1E9B76]" />
          <span className="absolute inset-0 rounded-full bg-[#1E9B76]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13.5px] text-kobo-ink">
            1 {currencyCode} ≈ {rate} USDC
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-kobo-ink/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#1E9B76] to-kobo-teal-600 transition-all"
              style={{ width: `${lockPct}%` }}
            />
          </div>
        </div>
        <span className="whitespace-nowrap text-[12.5px] text-[#7B959B]">
          Locks in {secsUntilLock}s
        </span>
      </div>

      <div className="pt-4.5">
        <Row label="Amount sent" value={`${currencySymbol}${amountSent.toFixed(2)}`} />
        <Row label="Conversion fee" value={`− ${currencySymbol}${fee.toFixed(2)}`} />
        <Row label="Converted at" value={rate} />
        <div
          className="my-4.5 h-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(11,31,36,.18) 0 5px, transparent 5px 11px)",
          }}
        />
        <div className="text-base font-semibold tracking-tight text-kobo-ink">
          Recipient gets
        </div>
        <div className="mt-0.5 text-[13px] text-[#8AA3A9]">USDC on Solana · arrives in ~2 min</div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[44px] font-semibold tracking-tight text-kobo-teal-600">
            {receiveUsdc.toFixed(2)}
          </span>
          <span className="text-[15px] font-medium text-[#7B959B]">USDC</span>
        </div>
        <div className="mt-3.5 text-[13.5px] leading-relaxed text-[#7B959B]">
          That&apos;s everything. No hidden costs, no receiving fee on their side.
        </div>
      </div>

      <Button
        onClick={onConfirm}
        className="mt-5.5 h-auto w-full gap-3 rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-5 text-[17.5px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
      >
        Confirm &amp; Continue
        <ArrowRight className="size-[19px]" strokeWidth={2} />
      </Button>
      <div className="mt-3.5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="size-[13px] text-[#8AA3A9]" strokeWidth={1.8} />
        <span className="text-[13px] text-[#8AA3A9]">Protected by bank-grade encryption</span>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[14.5px] text-[#5E7A81]">{label}</span>
      <span className="font-mono text-[14.5px] text-kobo-ink">{value}</span>
    </div>
  );
}
