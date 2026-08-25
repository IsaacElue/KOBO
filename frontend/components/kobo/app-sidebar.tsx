"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/kobo/nav";
import { ShieldCheck, CircleDot } from "lucide-react";

export function AppSidebar({
  activeIndex,
  onSelect,
  balanceLabel,
  balance,
  iban,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  balanceLabel: string;
  balance: string;
  iban: string;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-kobo-ink/[0.07] bg-white/55 p-5 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-2.5 px-2 py-1">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 shadow-lg shadow-kobo-teal-900/40">
          <CircleDot className="size-4 text-kobo-mint-light" strokeWidth={1.7} />
        </div>
        <span className="text-xl font-semibold tracking-tight text-kobo-ink">Kobo</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((label, i) => (
          <button
            key={label}
            onClick={() => onSelect(i)}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-[15px] font-medium text-[#4A6970] transition-all hover:translate-x-0.5 hover:bg-white/90 hover:text-kobo-ink active:scale-[0.98]",
              i === activeIndex && "bg-white/95 text-kobo-ink"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full bg-kobo-ink/15",
                i === activeIndex && "bg-[#1E9B76]"
              )}
            />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-[22px] bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 p-5 text-kobo-mint-light shadow-xl shadow-kobo-teal-900/40">
        <div className="text-[11.5px] font-semibold tracking-[0.16em] text-kobo-mint-light/60">
          {balanceLabel}
        </div>
        <div className="mt-2 text-[30px] font-semibold tabular-nums tracking-tight">{balance}</div>
        <div className="mt-1.5 text-[13px] text-kobo-mint-light/60">
          IBAN ·· {iban} · Instant SEPA
        </div>
        <Button
          variant="outline"
          className="mt-4 h-auto w-full rounded-full border-white/20 bg-white/10 py-2.5 text-[14px] font-medium text-kobo-mint-light hover:bg-white/20"
        >
          Add funds
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-2">
        <ShieldCheck className="size-3.5 text-kobo-teal-400" strokeWidth={1.8} />
        <span className="text-[12.5px] text-[#7B959B]">Licensed &amp; insured · EU</span>
      </div>
    </aside>
  );
}
