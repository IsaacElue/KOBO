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
import type { Recipient, TransferHistoryItem } from "@/lib/kobo/types";

export function TransferDetailDialog({
  open,
  onOpenChange,
  transfer,
  recipient,
  onSendAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: TransferHistoryItem | null;
  recipient: Recipient | null;
  onSendAgain: (transfer: TransferHistoryItem) => void;
}) {
  if (!transfer || !recipient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer details</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex items-center gap-3.5">
          <Avatar size="lg">
            <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
              {recipient.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-kobo-ink">{recipient.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{recipient.wallet}</div>
          </div>
          <Badge
            className={
              transfer.status === "Delivered"
                ? "bg-[#DDF2E6] text-kobo-mint-dark"
                : "bg-kobo-sand text-kobo-sand-dark"
            }
          >
            {transfer.status}
          </Badge>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4">
          <DetailRow label="Amount" value={`€${transfer.amountEur.toFixed(2)}`} />
          <DetailRow label="Reference" value={transfer.reference} />
          <DetailRow label="Date" value={transfer.date} />
        </div>

        <DialogFooter>
          <Button onClick={() => onSendAgain(transfer)}>Send again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-kobo-ink">{value}</span>
    </div>
  );
}
