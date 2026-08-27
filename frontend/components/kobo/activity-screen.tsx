"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMarketOverview, getMyTransfers } from "@/lib/kobo/api";
import { getSolSpot } from "@/lib/kobo/jupiter";
import { formatAmount, nameToInitials } from "@/lib/kobo/format";
import type { ActivityTransfer, JupiterSpot, MarketOverview } from "@/lib/kobo/types";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";

const SOL_TICKER_POLL_MS = 45_000;
const MARKET_POLL_MS = 120_000;

/**
 * Activity — live crypto market data (Jupiter spot price client-side +
 * CoinGecko market card via the backend proxy) alongside the signed-in
 * user's real transfer history. "Gamified but not overwhelming" is one
 * understated stat strip (transfers completed / total sent / people reached)
 * — no points, badges or leaderboards. Same shell, palette and card chrome
 * as every other screen. Every data source degrades to a clean fallback.
 */
export function ActivityScreen() {
  // One fetch of the real transfer history, shared by the stats strip and the
  // history list. undefined = loading, null = failed, [] = none yet.
  const [transfers, setTransfers] = useState<ActivityTransfer[] | null | undefined>(undefined);

  async function loadTransfers() {
    setTransfers(undefined);
    try {
      setTransfers(await getMyTransfers());
    } catch {
      setTransfers(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch-on-mount, same pattern as kobo-app.tsx / settings-screen.tsx
    loadTransfers();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-12 sm:p-10">
      <div className="flex max-w-[48rem] flex-col gap-8">
        <header>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">Activity</h1>
          <p className="max-w-xl text-[15.5px] text-[#5E7A81]">
            The market your transfers move through, and everything you&apos;ve sent.
          </p>
        </header>

        <SolTicker />
        <MarketCard />
        <SendingStats transfers={transfers ?? null} loading={transfers === undefined} />
        <TransferHistory transfers={transfers} onRetry={loadTransfers} />
      </div>
    </div>
  );
}

/* ─────────────────────────  SOL ticker (Jupiter, client-side)  ───────────────────────── */

function SolTicker() {
  const [spot, setSpot] = useState<JupiterSpot | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await getSolSpot();
      if (alive) setSpot(s);
    };
    tick();
    const iv = setInterval(tick, SOL_TICKER_POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-kobo-ink/[0.07] bg-white/75 px-3.5 py-2">
        <span className="size-1.5 shrink-0 motion-safe:animate-pulse rounded-full bg-[#1E9B76]" />
        <span className="font-mono text-[12.5px] text-[#33565E]">
          {spot === undefined ? (
            "SOL ····"
          ) : spot === null ? (
            "SOL price unavailable"
          ) : (
            <>
              SOL ${spot.usd_price.toFixed(2)}
              {spot.change_24h !== null && (
                <span className={cn("ml-1.5", spot.change_24h >= 0 ? "text-[#1E9B76]" : "text-destructive")}>
                  {spot.change_24h >= 0 ? "+" : ""}
                  {spot.change_24h.toFixed(2)}% 24h
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <span className="text-[12.5px] text-[#9BB2B8]">Live from Jupiter</span>
    </div>
  );
}

/* ─────────────────────────  Market card (CoinGecko via backend)  ───────────────────────── */

function MarketCard() {
  const [data, setData] = useState<MarketOverview | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await getMarketOverview();
      if (!alive) return;
      // Keep the last good payload if a later poll fails — only show the
      // "unavailable" state when the very first fetch fails.
      setData((prev) => (d === null && prev ? prev : d));
    };
    tick();
    const iv = setInterval(tick, MARKET_POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <section>
      <Eyebrow>Market</Eyebrow>
      <Card className="gap-0 rounded-[28px] border border-white/90 bg-white p-6 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
        {data === undefined ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </div>
        ) : data === null ? (
          <div className="flex items-center gap-3 py-2">
            <TrendingUp className="size-[18px] text-[#9BB2B8]" strokeWidth={1.8} />
            <p className="text-[14px] text-[#7B959B]">
              Market data is unavailable right now — try again in a minute.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-5">
              <CoinRow
                name="Solana"
                symbol="SOL"
                price={data.sol.price_eur}
                change24h={data.sol.change_24h}
                change7d={data.sol.change_7d}
              />
              <Sparkline points={data.sol.sparkline_7d} positive={(data.sol.change_7d ?? 0) >= 0} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-5 border-t border-kobo-ink/[0.06] pt-4">
              <CoinRow
                name="USDC"
                symbol="USDC"
                price={data.usdc.price_eur}
                change24h={data.usdc.change_24h}
              />
              <span className="shrink-0 text-[12.5px] text-[#8AA3A9]">Designed to stay near $1</span>
            </div>

            <p className="mt-4 text-[12px] text-[#9BB2B8]">
              {data.stale ? "Prices may be delayed. " : ""}
              Prices in EUR · 7-day trend from CoinGecko · updated{" "}
              {new Date(data.updated_at).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </>
        )}
      </Card>
    </section>
  );
}

function ChangeChip({ pct, label }: { pct: number; label: string }) {
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[12.5px] font-medium",
        up ? "text-[#1E9B76]" : "text-destructive"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-[12px]" strokeWidth={2.4} />
      ) : (
        <ArrowDownRight className="size-[12px]" strokeWidth={2.4} />
      )}
      {Math.abs(pct).toFixed(2)}% {label}
    </span>
  );
}

function CoinRow({
  name,
  symbol,
  price,
  change24h,
  change7d,
}: {
  name: string;
  symbol: string;
  price: number;
  change24h: number | null;
  change7d?: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tracking-tight text-kobo-ink">{name}</span>
        <span className="text-[12px] font-medium text-[#9BB2B8]">{symbol}</span>
      </div>
      <div className="mt-1 font-mono text-[22px] font-semibold tracking-tight text-kobo-ink">
        €{price < 10 ? price.toFixed(4) : formatAmount(price)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {change24h !== null && <ChangeChip pct={change24h} label="24h" />}
        {change7d != null && <ChangeChip pct={change7d} label="7d" />}
      </div>
    </div>
  );
}

/** Tiny inline sparkline — no charting library. Trend shape only, no axes. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const w = 160;
  const h = 56;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`);
  const stroke = positive ? "#1E9B76" : "var(--destructive)";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline points={`0,${h} ${coords.join(" ")} ${w},${h}`} fill={stroke} fillOpacity={0.08} stroke="none" />
      <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────────  Understated sending stats  ───────────────────────── */

function SendingStats({ transfers, loading }: { transfers: ActivityTransfer[] | null; loading: boolean }) {
  const stats = useMemo(() => {
    const completed = (transfers ?? []).filter((t) => t.status === "confirmed");
    const totalEur = completed.reduce((sum, t) => sum + t.amount_eur, 0);
    const people = new Set(completed.map((t) => t.recipient_id)).size;
    return { count: completed.length, totalEur, people };
  }, [transfers]);

  const show = (v: string) => (loading || transfers === null ? "—" : v);

  return (
    <section>
      <Eyebrow>Your sending</Eyebrow>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Transfers completed" value={show(String(stats.count))} />
        <StatTile label="Sent all-time" value={show(`€${formatAmount(stats.totalEur)}`)} />
        <StatTile label={stats.people === 1 ? "Person reached" : "People reached"} value={show(String(stats.people))} />
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 rounded-[22px] border border-white/90 bg-white p-5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
      <div className="text-[10.5px] font-semibold tracking-[0.14em] text-[#9BB2B8] uppercase">{label}</div>
      <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-kobo-ink">
        {value}
      </div>
    </Card>
  );
}

/* ─────────────────────────  Real transfer history  ───────────────────────── */

const HISTORY_STATUS: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Delivered", className: "bg-[#DDF2E6] text-kobo-mint-dark" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};
const IN_PROGRESS = { label: "In progress", className: "bg-[#EFF5F6] text-[#5E7A81]" };

function TransferHistory({
  transfers,
  onRetry,
}: {
  transfers: ActivityTransfer[] | null | undefined;
  onRetry: () => void;
}) {
  return (
    <section>
      <Eyebrow>Transfer history</Eyebrow>
      <Card className="gap-1 rounded-[28px] border border-white/90 bg-white/70 p-6.5 pb-4 shadow-[0_24px_48px_-40px_rgba(11,31,36,0.7)] backdrop-blur-lg ring-0">
        {transfers === undefined ? (
          <div className="flex flex-col gap-2 pb-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        ) : transfers === null ? (
          <div className="flex items-center justify-between gap-3 py-3">
            <p className="text-[14px] text-[#7B959B]">Couldn&apos;t load your transfers.</p>
            <button
              onClick={onRetry}
              className="rounded-full border border-kobo-ink/[0.14] px-4 py-1.5 text-[13px] text-[#33565E] hover:border-kobo-teal-600"
            >
              Try again
            </button>
          </div>
        ) : transfers.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-[#8AA3A9]">
            No transfers yet — your history will show up here.
          </p>
        ) : (
          <div className="flex flex-col">
            {transfers.map((t) => {
              const meta = HISTORY_STATUS[t.status] ?? IN_PROGRESS;
              const name = t.recipient_name ?? "Recipient";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-4 rounded-2xl border-b border-kobo-ink/[0.06] p-2 last:border-b-0"
                >
                  <Avatar>
                    <AvatarFallback className="bg-gradient-to-br from-[#DDF2E6] to-[#C6EAD6] font-semibold text-kobo-mint-dark">
                      {nameToInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15.5px] font-medium text-kobo-ink">{name}</div>
                    <div className="font-mono text-xs text-[#9BB2B8]">{shortDate(t.created_at)}</div>
                  </div>
                  <span className="min-w-20 text-right font-mono text-sm text-kobo-ink">
                    €{formatAmount(t.amount_eur)}
                  </span>
                  <Badge className={meta.className}>{meta.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}

/* ─────────────────────────  shared  ───────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 text-[11.5px] font-semibold tracking-[0.16em] text-[#8AA3A9] uppercase">
      {children}
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}
