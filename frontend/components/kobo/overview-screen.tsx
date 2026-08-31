"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMyTransfers } from "@/lib/kobo/api";
import { formatAmount } from "@/lib/kobo/format";
import type { ActivityTransfer, Recipient } from "@/lib/kobo/types";
import { ArrowRight } from "lucide-react";

/**
 * Overview — the dashboard from the "Kobo Web App" design export: a greeting,
 * four stat tiles, a six-month "sent" bar chart, a "send again" shortlist and
 * a rate-watch card.
 *
 * Wired to real data, not the export's sample numbers:
 *  - Available balance comes from KoboApp's live `GET /balances/:userId` state.
 *  - Everything else is derived from `GET /transfers` (the signed-in sender's
 *    own history — same source the Activity screen uses).
 *  - "Avg delivery" has no field in the API contract (no settlement timestamp),
 *    so it stays an illustrative constant — see the note by that tile.
 */

const IN_TRANSIT_STATUSES = new Set(["pending", "onramp_complete", "sent"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function OverviewScreen({
  userName,
  balanceStr,
  rate,
  recipients,
  onStartSend,
  onSendAgain,
}: {
  userName: string;
  /** Already currency-formatted by KoboApp, e.g. "€1,840.50". */
  balanceStr: string;
  /** Live EUR→USDC rate string from KoboApp, e.g. "1.0814". */
  rate: string;
  recipients: Recipient[];
  onStartSend: () => void;
  onSendAgain: (recipientId: string) => void;
}) {
  const firstName = userName.split(" ")[0] || "there";

  // undefined = loading, null = failed, [] = none yet.
  const [transfers, setTransfers] = useState<ActivityTransfer[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getMyTransfers()
      .then((t) => alive && setTransfers(t))
      .catch(() => alive && setTransfers(null));
    return () => {
      alive = false;
    };
  }, []);

  const loading = transfers === undefined;

  const stats = useMemo(() => {
    const rows = transfers ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let sentThisMonth = 0;
    let sentThisMonthCount = 0;
    let inTransit = 0;
    let inTransitCount = 0;

    for (const t of rows) {
      const when = new Date(t.created_at);
      if (t.status === "confirmed" && when >= monthStart) {
        sentThisMonth += t.amount_eur;
        sentThisMonthCount += 1;
      }
      if (IN_TRANSIT_STATUSES.has(t.status)) {
        inTransit += t.amount_eur;
        inTransitCount += 1;
      }
    }

    // Six-month buckets, oldest → newest, ending on the current month.
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], total: 0 };
    });
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of rows) {
      if (t.status !== "confirmed") continue;
      const d = new Date(t.created_at);
      const b = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (b) b.total += t.amount_eur;
    }
    const sixMonthTotal = buckets.reduce((s, b) => s + b.total, 0);
    const monthsWithSends = buckets.filter((b) => b.total > 0).length || 1;

    return {
      sentThisMonth,
      sentThisMonthCount,
      inTransit,
      inTransitCount,
      buckets,
      sixMonthTotal,
      sixMonthAvg: sixMonthTotal / monthsWithSends,
    };
  }, [transfers]);

  const peakBar = Math.max(1, ...stats.buckets.map((b) => b.total));

  const quickSend = recipients.slice(0, 4);

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-11 sm:p-10">
      <header className="mb-6">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">
          Welcome back, {firstName}
        </h1>
        <p className="text-[15.5px] text-[#5E7A81]">Here&apos;s where your money stands today.</p>
      </header>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          dark
          label="AVAILABLE"
          value={balanceStr}
          sub="Instant SEPA · IBAN ·· 4417"
        />
        <StatTile
          label="SENT THIS MONTH"
          value={loading ? undefined : `€${formatAmount(stats.sentThisMonth)}`}
          sub={
            loading
              ? undefined
              : stats.sentThisMonthCount === 0
                ? "Nothing sent yet this month"
                : `${stats.sentThisMonthCount} transfer${stats.sentThisMonthCount === 1 ? "" : "s"}`
          }
        />
        <StatTile
          label="IN TRANSIT"
          value={loading ? undefined : `€${formatAmount(stats.inTransit)}`}
          sub={
            loading
              ? undefined
              : stats.inTransitCount === 0
                ? "Nothing pending right now"
                : `${stats.inTransitCount} still settling`
          }
        />
        {/* No settlement-time field in the API contract — illustrative until one exists. */}
        <StatTile label="AVG DELIVERY" value="~2 min" sub="Typical on Solana" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        {/* Six-month bar chart */}
        <Card className="gap-0 rounded-[28px] border border-kobo-ink/[0.05] bg-white p-7 shadow-[0_24px_50px_-38px_rgba(11,31,36,0.75)] ring-0">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.16em] text-[#8AA3A9]">
                SENT, LAST SIX MONTHS
              </div>
              <div className="mt-2.5 text-[27px] font-semibold tracking-tight tabular-nums">
                {loading ? <Skeleton className="h-8 w-32" /> : `€${formatAmount(stats.sixMonthTotal)}`}
              </div>
            </div>
            {!loading && (
              <div className="text-[13px] text-[#5E7A81]">
                €{formatAmount(stats.sixMonthAvg)} average
              </div>
            )}
          </div>

          <div className="mt-6 grid h-[170px] grid-cols-6 items-end gap-2 sm:gap-3.5">
            {stats.buckets.map((b, i) => {
              const last = i === stats.buckets.length - 1;
              const h = loading ? 8 : Math.round((b.total / peakBar) * 100);
              return (
                <div key={b.key} className="flex flex-col items-center justify-end gap-2.5">
                  {/* Per-bar € label needs ~40px; a column is ~31px at 360px, so
                      it's tablet+ only. Bar heights + the headline total carry it
                      on phones. */}
                  <div className="hidden font-mono text-[11.5px] text-[#7B959B] sm:block">
                    {loading || b.total === 0 ? "—" : `€${Math.round(b.total)}`}
                  </div>
                  <div className="flex h-[120px] w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-[10px] rounded-b-[4px] transition-[height] duration-500",
                        last && !loading
                          ? "bg-gradient-to-b from-[#1E9B76] to-kobo-teal-500"
                          : "bg-[#DCE9E9]",
                      )}
                      style={{ height: `${Math.max(h, 3)}%` }}
                    />
                  </div>
                  <div className="text-[12.5px] text-[#8AA3A9]">{b.month}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right column: send again + rate watch */}
        <div className="flex flex-col gap-5">
          <Card className="gap-0 rounded-[28px] border border-kobo-ink/[0.05] bg-white p-6 shadow-[0_24px_50px_-38px_rgba(11,31,36,0.75)] ring-0">
            <div className="mb-3.5 text-[11.5px] font-semibold tracking-[0.16em] text-[#8AA3A9]">
              SEND AGAIN
            </div>
            <div className="flex flex-col gap-1.5">
              {quickSend.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSendAgain(r.id)}
                  className="flex items-center gap-3.5 rounded-2xl p-3 text-left transition-all hover:translate-x-0.5 hover:bg-[#F1F6F7] active:scale-[0.99]"
                >
                  <Avatar>
                    <AvatarFallback className="bg-gradient-to-br from-[#D7F0E2] to-[#BFE7D1] font-semibold text-kobo-mint-dark">
                      {r.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-kobo-ink">{r.name}</div>
                    <div className="truncate text-[12.5px] text-[#8AA3A9]">{r.lastSent}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-kobo-teal-400" strokeWidth={2} />
                </button>
              ))}
            </div>
          </Card>

          <Card className="gap-0 rounded-[28px] border-none bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 p-6 text-kobo-mint-light shadow-xl shadow-kobo-teal-900/40 ring-0">
            <div className="text-[11.5px] font-semibold tracking-[0.16em] text-kobo-mint-light/60">
              RATE WATCH
            </div>
            <div className="mt-2.5 font-mono text-[21px]">1 EUR ≈ {rate} USDC</div>
            <p className="mt-2.5 mb-4.5 text-[13.5px] leading-relaxed text-kobo-mint-light/70">
              Live market rate. It locks for 30 seconds once you start a transfer, with no spread
              added after that.
            </p>
            <Button
              onClick={onStartSend}
              variant="outline"
              className="h-auto w-full rounded-full border-white/20 bg-white/10 py-3 text-[14.5px] font-medium text-kobo-mint-light hover:bg-white/20"
            >
              Send money now
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  dark,
}: {
  label: string;
  value: string | undefined;
  sub: string | undefined;
  dark?: boolean;
}) {
  return (
    <Card
      className={cn(
        "gap-0 rounded-3xl border p-5.5 ring-0 shadow-[0_20px_44px_-36px_rgba(11,31,36,0.7)]",
        dark
          ? "border-none bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-kobo-mint-light"
          : "border-kobo-ink/[0.06] bg-white",
      )}
    >
      <div
        className={cn(
          "text-[11.5px] font-semibold tracking-[0.16em]",
          dark ? "text-kobo-mint-light/60" : "text-[#8AA3A9]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-2.5 text-[29px] font-semibold tracking-tight tabular-nums",
          dark ? "text-[#F1FAF7]" : "text-kobo-ink",
        )}
      >
        {value ?? <Skeleton className="h-8 w-24" />}
      </div>
      <div className={cn("mt-1.5 text-[13px]", dark ? "text-kobo-mint-light/60" : "text-[#5E7A81]")}>
        {sub ?? <Skeleton className="mt-1 h-3.5 w-28" />}
      </div>
    </Card>
  );
}
