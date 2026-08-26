"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Recipient } from "@/lib/kobo/types";

/**
 * The in-app review step that replaced Transak checkout for sends — recipient,
 * amount, fee, estimated arrival, confirm/cancel. Sending is instant once
 * confirmed (no second Transak step), so this is the last chance to back out.
 */
export function SendConfirmationDialog({
  open,
  recipient,
  sentStr,
  feeStr,
  receiveStr,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  recipient: Pick<Recipient, "name" | "initials" | "wallet">;
  sentStr: string;
  feeStr: string;
  receiveStr: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-0 rounded-[32px] border border-white/95 bg-white p-8 pb-7 shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)] ring-0"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight text-kobo-ink">
            Confirm transfer
          </DialogTitle>
          <DialogDescription className="text-[14.5px] text-[#5E7A81]">
            This sends instantly from your Kobo balance.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 rounded-3xl border border-kobo-ink/[0.06] bg-[#F6FAFA] p-5 pb-4">
          <div className="flex items-center gap-3.5 border-b border-kobo-ink/[0.07] pb-4">
            <Avatar size="lg">
              <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
                {recipient.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[16.5px] font-semibold text-kobo-ink">{recipient.name}</div>
              <div className="truncate font-mono text-[12.5px] text-[#8AA3A9]">{recipient.wallet}</div>
            </div>
          </div>
          <Row label="Amount sent" value={sentStr} />
          <Row label="Conversion fee" value={`− ${feeStr}`} />
          <Row label="Estimated arrival" value="~2 min" />
          <div className="mt-3 flex items-center justify-between border-t border-kobo-ink/[0.07] pt-3">
            <span className="text-[14.5px] font-medium text-kobo-ink">Recipient gets</span>
            <span className="font-mono text-[15px] font-semibold text-kobo-teal-600">
              {receiveStr} USDC
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={onCancel}
            variant="outline"
            className="h-auto flex-1 rounded-full border-kobo-ink/[0.14] bg-white py-3.5 text-[15px] font-medium text-kobo-ink hover:-translate-y-0.5 hover:border-kobo-teal-600"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="h-auto flex-[1.3] rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[#5E7A81]">{label}</span>
      <span className="font-mono text-[13.5px] text-kobo-ink">{value}</span>
    </div>
  );
}
