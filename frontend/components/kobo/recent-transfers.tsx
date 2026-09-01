"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Recipient, TransferHistoryItem } from "@/lib/kobo/types";

export function RecentTransfers({
  history,
  recipients,
  onSelect,
  onViewAll,
}: {
  history: TransferHistoryItem[];
  recipients: Recipient[];
  onSelect: (item: TransferHistoryItem) => void;
  /** Opens the full history — the Activity screen. */
  onViewAll: () => void;
}) {
  const byId = new Map(recipients.map((r) => [r.id, r]));

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
      <div className="flex flex-col">
        {history.map((h) => {
          const recipient = byId.get(h.recipientId);
          if (!recipient) return null;
          return (
            <button
              key={h.id}
              onClick={() => onSelect(h)}
              className="flex items-center gap-3 rounded-2xl border-b border-kobo-ink/[0.06] p-2 text-left transition-all hover:translate-x-1 hover:bg-white/90 sm:gap-4"
            >
              <Avatar>
                <AvatarFallback className="bg-gradient-to-br from-[#DDF2E6] to-[#C6EAD6] font-semibold text-kobo-mint-dark">
                  {recipient.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15.5px] font-medium text-kobo-ink">
                  {recipient.name}
                </div>
                <div className="font-mono text-xs text-[#9BB2B8]">{h.reference}</div>
              </div>
              {/* Trailing meta: stacks vertically on phones so the fixed-width
                  amount + badge don't starve the flex-1 name column down to
                  "A…". Reverts to an inline row at >=640px. */}
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="hidden text-[13px] text-[#8AA3A9] sm:inline">{h.date}</span>
                <span className="text-right font-mono text-sm text-kobo-ink sm:min-w-24">
                  €{h.amountEur.toFixed(2)}
                </span>
                <Badge
                  className={
                    h.status === "Delivered"
                      ? "bg-[#DDF2E6] text-kobo-mint-dark"
                      : "bg-kobo-sand text-kobo-sand-dark"
                  }
                >
                  {h.status}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
