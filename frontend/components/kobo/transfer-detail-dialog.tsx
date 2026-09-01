"use client";

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
  transferLongDate,
  transferReference,
  transferStatusMeta,
} from "@/lib/kobo/transfer-display";
import type { ActivityTransfer, Recipient } from "@/lib/kobo/types";

/**
 * The one transaction-detail / receipt view: status, amounts, rate-derived
 * figures, reference, on-chain signature. Reachable from the Overview "Recent
 * transfers" preview and the full Activity history list — both feed it the same
 * `ActivityTransfer` from `getMyTransfers()`.
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
  const wallet = recipient?.wallet ?? "";
  const status = transferStatusMeta(transfer.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer details</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex items-center gap-3.5">
          <Avatar size="lg">
            <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-kobo-ink">{name}</div>
            {wallet && (
              <div className="truncate font-mono text-xs text-muted-foreground">{wallet}</div>
            )}
          </div>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4">
          <DetailRow label="Amount" value={`€${formatAmount(transfer.amount_eur)}`} />
          {transfer.amount_usdc != null && (
            <DetailRow label="Received" value={`${formatAmount(transfer.amount_usdc)} USDC`} />
          )}
          <DetailRow label="Reference" value={transferReference(transfer.id)} />
          <DetailRow label="Date" value={transferLongDate(transfer.created_at)} />
          {transfer.solana_tx_signature && (
            <DetailRow
              label="Transaction"
              value={`${transfer.solana_tx_signature.slice(0, 6)}…${transfer.solana_tx_signature.slice(-4)}`}
            />
          )}
        </div>

        {transfer.status === "failed" && transfer.failure_reason && (
          <p className="text-[13px] text-destructive">{transfer.failure_reason}</p>
        )}

        <DialogFooter>
          <Button onClick={() => onSendAgain(transfer)}>Send again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-kobo-ink">{value}</span>
    </div>
  );
}
