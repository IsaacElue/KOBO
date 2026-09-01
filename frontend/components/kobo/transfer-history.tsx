"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getTransferHistory, TRANSFER_HISTORY_PAGE_SIZE } from "@/lib/kobo/api";
import { formatAmount, nameToInitials } from "@/lib/kobo/format";
import {
  transferShortDate,
  transferStatusMeta,
  TRANSFER_STATUS_GROUPS,
} from "@/lib/kobo/transfer-display";
import type { ActivityTransfer, TransferStatusGroup } from "@/lib/kobo/types";
import { Search } from "lucide-react";

const SEARCH_DEBOUNCE_MS = 300;

type Phase = "loading" | "loadingMore" | "ready" | "error";

/**
 * The Activity screen's "Transfer history" — a compact, scalable window onto
 * the signed-in sender's real history via `getTransferHistory()` (server-side
 * `q` / status / pagination in real mode; the same shape over the mock fixture
 * in mock mode). Search, a status filter, "Load more" and reset — designed to
 * stay usable whether there are 5 transfers or 10,000. Rows open the shared
 * TransferDetailDialog.
 */
export function TransferHistory({
  onOpenDetail,
}: {
  onOpenDetail: (transfer: ActivityTransfer) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState(""); // debounced search term actually sent
  const [group, setGroup] = useState<TransferStatusGroup>("all");

  const [rows, setRows] = useState<ActivityTransfer[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");

  // Guards against an out-of-order response overwriting a newer one (fast typing).
  const requestId = useRef(0);

  const filtersActive = q.trim() !== "" || group !== "all";

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      setPhase(offset === 0 ? "loading" : "loadingMore");
      try {
        const page = await getTransferHistory({
          q,
          group,
          offset,
          limit: TRANSFER_HISTORY_PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        setRows((prev) => (offset === 0 ? page.transfers : [...prev, ...page.transfers]));
        setTotal(page.total);
        setHasMore(page.has_more);
        setPhase("ready");
      } catch {
        if (id !== requestId.current) return;
        setPhase("error");
      }
    },
    [q, group]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-fetch page 1 whenever the query or filter changes
    load(0);
  }, [load]);

  function resetFilters() {
    setSearchInput("");
    setQ("");
    setGroup("all");
  }

  return (
    <Card className="gap-0 rounded-[28px] border border-white/90 bg-white/70 p-6.5 pb-4 shadow-[0_24px_48px_-40px_rgba(11,31,36,0.7)] backdrop-blur-lg ring-0">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#9BB2B8]"
            strokeWidth={1.9}
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search transfers"
            placeholder="Search by name, reference or signature"
            className="h-10 rounded-full border-kobo-ink/[0.1] bg-white pl-9 text-[14px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {TRANSFER_STATUS_GROUPS.map((g) => {
            const active = group === g.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={active}
                onClick={() => setGroup(g.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-kobo-teal-600/30 focus-visible:outline-none",
                  active
                    ? "border-transparent bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-kobo-mint-light"
                    : "border-kobo-ink/[0.12] bg-white text-[#33565E] hover:border-kobo-teal-600"
                )}
              >
                {g.label}
              </button>
            );
          })}
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-kobo-teal-600 hover:text-kobo-teal-800 focus-visible:ring-3 focus-visible:ring-kobo-teal-600/30 focus-visible:outline-none"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-kobo-ink/[0.06] pt-1">
        <Body
          phase={phase}
          rows={rows}
          total={total}
          hasMore={hasMore}
          filtersActive={filtersActive}
          onOpenDetail={onOpenDetail}
          onRetry={() => load(0)}
          onLoadMore={() => load(rows.length)}
          onClearFilters={resetFilters}
        />
      </div>
    </Card>
  );
}

function Body({
  phase,
  rows,
  total,
  hasMore,
  filtersActive,
  onOpenDetail,
  onRetry,
  onLoadMore,
  onClearFilters,
}: {
  phase: Phase;
  rows: ActivityTransfer[];
  total: number;
  hasMore: boolean;
  filtersActive: boolean;
  onOpenDetail: (transfer: ActivityTransfer) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onClearFilters: () => void;
}) {
  if (phase === "loading") {
    return (
      <div className="flex flex-col gap-2 py-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <p className="text-[14px] text-[#7B959B]">Couldn&apos;t load your transfers.</p>
        <button
          onClick={onRetry}
          className="rounded-full border border-kobo-ink/[0.14] px-4 py-1.5 text-[13px] text-[#33565E] hover:border-kobo-teal-600"
        >
          Try again
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return filtersActive ? (
      <div className="flex flex-col items-center gap-2.5 py-7 text-center">
        <p className="text-[14px] text-[#8AA3A9]">No transfers match your search.</p>
        <button
          onClick={onClearFilters}
          className="rounded-full border border-kobo-ink/[0.14] px-4 py-1.5 text-[13px] text-[#33565E] hover:border-kobo-teal-600"
        >
          Show all transfers
        </button>
      </div>
    ) : (
      <p className="py-7 text-center text-[14px] text-[#8AA3A9]">
        No transfers yet. Your history will show up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((t) => (
        <TransferRow key={t.id} transfer={t} onOpenDetail={onOpenDetail} />
      ))}

      <div className="flex items-center justify-between gap-3 px-1 pt-3 pb-1">
        <span className="text-[12px] text-[#9BB2B8]">
          Showing {rows.length} of {total}
        </span>
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={phase === "loadingMore"}
            className="rounded-full border border-kobo-ink/[0.14] px-4 py-1.5 text-[13px] font-medium text-[#33565E] transition-colors hover:border-kobo-teal-600 disabled:opacity-60"
          >
            {phase === "loadingMore" ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

function TransferRow({
  transfer: t,
  onOpenDetail,
}: {
  transfer: ActivityTransfer;
  onOpenDetail: (transfer: ActivityTransfer) => void;
}) {
  const meta = transferStatusMeta(t.status);
  const name = t.recipient_name ?? "Recipient";
  return (
    <button
      onClick={() => onOpenDetail(t)}
      className="flex items-center gap-3 rounded-2xl border-b border-kobo-ink/[0.06] p-2 text-left transition-all last:border-b-0 hover:translate-x-1 hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-kobo-teal-600/30 focus-visible:outline-none sm:gap-4"
    >
      <Avatar>
        <AvatarFallback className="bg-gradient-to-br from-[#DDF2E6] to-[#C6EAD6] font-semibold text-kobo-mint-dark">
          {nameToInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-kobo-ink">{name}</div>
        <div className="font-mono text-xs text-[#9BB2B8]">{transferShortDate(t.created_at)}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-right font-mono text-sm text-kobo-ink sm:min-w-20">
          €{formatAmount(t.amount_eur)}
        </span>
        <Badge className={meta.className}>{meta.label}</Badge>
      </div>
    </button>
  );
}
