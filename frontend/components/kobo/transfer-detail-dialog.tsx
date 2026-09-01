"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatAmount, nameToInitials } from "@/lib/kobo/format";
import {
  transferDateTime,
  transferReference,
  transferStatusMeta,
  truncateMiddle,
  solanaExplorerUrl,
} from "@/lib/kobo/transfer-display";
import type { ActivityTransfer, Recipient } from "@/lib/kobo/types";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * The one transaction-detail / receipt view. Information is ordered by what a
 * normal user cares about — recipient, amount, status first; the rate-derived
 * figure next; the technical trail (reference, on-chain signature, timestamp)
 * last and visually quieter. A user never needs to understand Solana to read
 * it. Reachable from the Overview "Recent transfers" preview and the Activity
 * history list — both feed the same `ActivityTransfer` from the API.
 */
export function TransferDetailDialog({
  open,
  onOpenChange,
  transfer,
  recipient,
  onSendAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: ActivityTransfer | null;
  /** Full saved recipient if we still have one (avatar initials + wallet); null if not. */
  recipient: Recipient | null;
  onSendAgain: (transfer: ActivityTransfer) => void;
}) {
  if (!transfer) return null;

  const name = recipient?.name ?? transfer.recipient_name ?? "Recipient";
  const initials = recipient?.initials ?? nameToInitials(name);
  const status = transferStatusMeta(transfer.status);

  const converted = transfer.amount_usdc;
  const impliedRate =
    converted != null && transfer.amount_eur > 0 ? converted / transfer.amount_eur : null;
  const explorer = solanaExplorerUrl(transfer.solana_tx_signature);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer details</DialogTitle>
        </DialogHeader>

        {/* Primary — recipient, amount, status */}
        <div className="flex items-center gap-3.5">
          <Avatar size="lg">
            <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-kobo-ink">{name}</div>
            <div className="text-xs text-muted-foreground">Recipient</div>
          </div>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        <div className="rounded-2xl bg-muted/50 p-4">
          <div className="text-xs text-muted-foreground">Amount sent</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-kobo-ink">
            €{formatAmount(transfer.amount_eur)}
          </div>
          {converted != null && (
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-kobo-ink/[0.07] pt-2 text-sm">
              <span className="text-muted-foreground">Recipient gets</span>
              <span className="font-mono text-kobo-ink">{formatAmount(converted)} USDC</span>
            </div>
          )}
          {impliedRate != null && (
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-mono text-kobo-ink">1 EUR ≈ {impliedRate.toFixed(4)} USDC</span>
            </div>
          )}
        </div>

        {transfer.status === "failed" && transfer.failure_reason && (
          <p className="text-[13px] text-destructive">{transfer.failure_reason}</p>
        )}

        {/* Secondary — the technical trail, quieter */}
        <dl className="flex flex-col gap-3 rounded-2xl border border-kobo-ink/[0.07] p-4">
          <CopyableRow label="Reference" value={transferReference(transfer.id)} field="reference" />
          {transfer.solana_tx_signature && (
            <CopyableRow
              label="Transaction hash"
              value={transfer.solana_tx_signature}
              field="hash"
              action={
                explorer && (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-kobo-teal-600 hover:text-kobo-teal-800"
                  >
                    Open in Explorer
                    <ExternalLink className="size-3" strokeWidth={2} />
                  </a>
                )
              }
            />
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Date &amp; time
            </dt>
            <dd className="text-[13px] text-kobo-ink">{transferDateTime(transfer.created_at)}</dd>
          </div>
        </dl>

        <DialogFooter>
          <Button onClick={() => onSendAgain(transfer)}>Send again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A technical-trail row: label, a middle-truncated value (so a long hash can
 * never force horizontal scroll — `break-all` is a further safety net), a Copy
 * button with an inline "Copied" confirmation, and an optional trailing action
 * (e.g. Open in Explorer).
 */
function CopyableRow({
  label,
  value,
  field,
  action,
}: {
  label: string;
  value: string;
  field: string;
  action?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard unavailable (denied permission, insecure context) — the full
      // value is still visible via the title attribute for manual selection.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="flex items-start justify-between gap-3">
        <span
          className="min-w-0 font-mono text-[13px] break-all text-kobo-ink"
          title={value}
          data-testid={`copyable-${field}`}
        >
          {truncateMiddle(value, 10, 8)}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {action}
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label.toLowerCase()}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-kobo-teal-600 hover:text-kobo-teal-800 focus-visible:ring-3 focus-visible:ring-kobo-teal-600/30 focus-visible:outline-none"
          >
            {copied ? (
              <>
                <Check className="size-3.5" strokeWidth={2.4} />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" strokeWidth={2} />
                Copy
              </>
            )}
          </button>
        </div>
      </dd>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </div>
  );
}
