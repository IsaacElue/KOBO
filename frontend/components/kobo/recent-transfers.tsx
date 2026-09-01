"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, nameToInitials } from "@/lib/kobo/format";
import { transferShortDate, transferStatusMeta } from "@/lib/kobo/transfer-display";
import type { ActivityTransfer } from "@/lib/kobo/types";

const PREVIEW_COUNT = 4;

/**
 * Home-screen preview of recent activity — a short window onto the same
 * `getMyTransfers()` history the Activity tab shows in full. Rows open the
 * shared TransferDetailDialog; "View all" jumps to Activity. Not shown on the
 * Send screen (that's just amount + recipient + confirm now).
 */
export function RecentTransfers({
  transfers,
  onViewAll,
  onOpenDetail,
}: {
  /** undefined = loading, null = failed, [] = none yet. */
  transfers: ActivityTransfer[] | null | undefined;
  onViewAll: () => void;
  onOpenDetail: (transfer: ActivityTransfer) => void;
}) {
  const preview = (transfers ?? []).slice(0, PREVIEW_COUNT);

  return (
    <Card className="gap-1 rounded-[28px] border border-white/90 bg-white/70 p-6.5 pb-4 shadow-[0_24px_48px_-40px_rgba(11,31,36,0.7)] backdrop-blur-lg ring-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight text-kobo-ink">
          Recent transfers
        </span>
        <button
          type="button"
          onClick={onViewAll}
          className="-mr-2 rounded-lg px-2 py-1.5 text-[13.5px] font-medium text-kobo-teal-600 transition-colors hover:text-kobo-teal-800 focus-visible:ring-3 focus-visible:ring-kobo-teal-600/40 focus-visible:outline-none"
        >
          View all
        </button>
      </div>

      {transfers === undefined ? (
        <div className="flex flex-col gap-2 py-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      ) : transfers === null ? (
        <p className="py-5 text-[13.5px] text-[#8AA3A9]">Couldn&apos;t load your transfers.</p>
      ) : preview.length === 0 ? (
        <p className="py-5 text-[13.5px] text-[#8AA3A9]">
          No transfers yet. Your history will show up here.
        </p>
      ) : (
        <div className="flex flex-col">
          {preview.map((t) => {
            const status = transferStatusMeta(t.status);
            const name = t.recipient_name ?? "Recipient";
            return (
              <button
                key={t.id}
                onClick={() => onOpenDetail(t)}
                className="flex items-center gap-3 rounded-2xl border-b border-kobo-ink/[0.06] p-2 text-left transition-all last:border-b-0 hover:translate-x-1 hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-kobo-teal-600/30 focus-visible:outline-none sm:gap-4"
              >
                <Avatar>
                  <AvatarFallback className="bg-gradient-to-br from-[#DDF2E6] to-[#C6EAD6] font-semibold text-kobo-mint-dark">
                    {nameToInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-medium text-kobo-ink">{name}</div>
                  <div className="font-mono text-xs text-[#9BB2B8]">
                    {transferShortDate(t.created_at)}
                  </div>
                </div>
                {/* Trailing meta stacks on phones so the fixed amount + badge
                    don't crush the flex-1 name; inline row at >=640. */}
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <span className="text-right font-mono text-sm text-kobo-ink sm:min-w-24">
                    €{formatAmount(t.amount_eur)}
                  </span>
                  <Badge className={status.className}>{status.label}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
