"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { countryFlag, countryName } from "@/lib/kobo/currencies";
import { ShieldCheck, ArrowRight, TriangleAlert } from "lucide-react";

/**
 * The Send confirmation panel. Sprint 1C reorders it around what the sender
 * actually thinks about — "I'm sending money to a person":
 *
 *   Recipient  →  You send  →  Recipient receives  →  Rate (+ source)  →
 *   Fee  →  Total you pay  →  Confirm
 *
 * No Solana terminology in this primary flow. If the display rate is
 * unavailable (real mode, provider down) the rate-derived figures show "—",
 * a clear notice replaces the rate lock, and Confirm is disabled by the
 * parent — a real transfer is never confirmed off a rate we can't stand behind.
 */
export function TransferSummaryPanel({
  recipientName,
  recipientEmail,
  recipientCountry,
  currencyCode,
  currencySymbol,
  rate,
  rateAvailable,
  rateSourceLabel,
  secsUntilLock,
  amountSent,
  fee,
  totalStr,
  receiveStr,
  onConfirm,
  disabled,
}: {
  recipientName: string;
  recipientEmail?: string | null;
  recipientCountry?: string | null;
  currencyCode: string;
  currencySymbol: string;
  /** 4dp rate string, or "—" when unavailable. */
  rate: string;
  rateAvailable: boolean;
  /** "Market rate" / "Demo rate (mock mode)" — what kind of rate this is. */
  rateSourceLabel: string | null;
  secsUntilLock: number;
  amountSent: number;
  fee: number;
  /** Total the sender is charged, currency-formatted. */
  totalStr: string;
  /** Destination amount string, or "—" when the rate is unavailable. */
  receiveStr: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const lockPct = Math.round((secsUntilLock / 30) * 100);
  const approxRate = Number.isFinite(Number(rate)) ? Number(rate).toFixed(2) : rate;
  const countryLabel = countryName(recipientCountry);

  return (
    <Card className="sticky top-0 gap-0 rounded-[30px] border border-white/95 bg-gradient-to-br from-white/92 to-[#EEF5F6]/78 p-7 shadow-[0_34px_66px_-46px_rgba(11,31,36,0.75)] backdrop-blur-xl ring-0">
      {/* Rate / lock, or an unavailable notice */}
      {rateAvailable ? (
        <div className="flex items-center gap-3 border-b border-kobo-ink/[0.07] pb-4.5">
          <span className="relative size-2 shrink-0">
            <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-[#1E9B76]" />
            <span className="absolute inset-0 rounded-full bg-[#1E9B76]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13.5px] text-kobo-ink">
              1 {currencyCode} ≈ {approxRate} USDC
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-kobo-ink/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1E9B76] to-kobo-teal-600 transition-all"
                style={{ width: `${lockPct}%` }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap text-[12.5px] text-[#7B959B]">
            Rate held · refreshes in {secsUntilLock}s
          </span>
        </div>
      ) : (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" strokeWidth={2} />
          <div className="text-[13px] leading-snug text-[#7A5A20]">
            <span className="font-semibold">Rate unavailable.</span> We can&apos;t show a
            live conversion right now, so this transfer can&apos;t be confirmed yet. Try
            again in a moment.
          </div>
        </div>
      )}

      {/* Recipient — a person, not an address */}
      <div className="pt-4.5">
        <SectionLabel>To</SectionLabel>
        <div className="mt-1 text-[16px] font-semibold tracking-tight text-kobo-ink">
          {recipientName}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[#7B959B]">
          <span>{recipientEmail ? recipientEmail : "Saved recipient"}</span>
          {countryLabel && (
            <span>
              <span aria-hidden>{countryFlag(recipientCountry)}</span> {countryLabel}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-kobo-ink/[0.07] pt-4">
        <Row label="You send" value={`${currencySymbol}${amountSent.toFixed(2)} ${currencyCode}`} />
        <Row label="Conversion fee" value={`− ${currencySymbol}${fee.toFixed(2)}`} hint="taken from the amount above" />
        <Row
          label="Rate"
          value={rateAvailable ? `1 ${currencyCode} → ${rate} USDC` : "Unavailable"}
          hint={rateAvailable ? rateSourceLabel ?? undefined : undefined}
        />
        <Row label="Total charged to you" value={totalStr} strong />

        <div
          className="my-4.5 h-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(11,31,36,.18) 0 5px, transparent 5px 11px)",
          }}
        />

        <div className="text-base font-semibold tracking-tight text-kobo-ink">
          Recipient receives
        </div>
        <div className="mt-0.5 text-[13px] text-[#8AA3A9]">
          US Dollar Coin (USDC) · usually within minutes
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[44px] font-semibold tabular-nums tracking-tight text-kobo-teal-600">
            {receiveStr}
          </span>
          <span className="text-[15px] font-medium text-[#7B959B]">USDC</span>
        </div>
        <div className="mt-3.5 text-[13.5px] leading-relaxed text-[#7B959B]">
          That&apos;s everything. No hidden costs, no receiving fee on their side.
        </div>
      </div>

      <Button
        onClick={onConfirm}
        disabled={disabled}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.16em] text-[#8AA3A9] uppercase">
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[14.5px] text-[#5E7A81]">
        {label}
        {hint && <span className="mt-0.5 block text-[12px] text-[#9BB2B8]">{hint}</span>}
      </span>
      <span
        className={
          strong
            ? "font-mono text-[15px] font-semibold text-kobo-ink"
            : "font-mono text-[14.5px] text-kobo-ink"
        }
      >
        {value}
      </span>
    </div>
  );
}
