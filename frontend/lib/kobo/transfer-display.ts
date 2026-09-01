import type { TransferStatus } from "./types";

/**
 * One place that turns a raw `TransferStatus` (from `GET /transfers`) into the
 * label + badge classes the UI shows. Used by the Activity history list, the
 * Overview "Recent transfers" preview and the shared TransferDetailDialog — so
 * a transfer reads the same everywhere.
 */
const IN_PROGRESS = { label: "In progress", className: "bg-[#EFF5F6] text-[#5E7A81]" };

export const TRANSFER_STATUS_META: Record<
  TransferStatus,
  { label: string; className: string }
> = {
  confirmed: { label: "Delivered", className: "bg-[#DDF2E6] text-kobo-mint-dark" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  pending: IN_PROGRESS,
  onramp_complete: IN_PROGRESS,
  sent: IN_PROGRESS,
};

export function transferStatusMeta(status: TransferStatus) {
  return TRANSFER_STATUS_META[status] ?? IN_PROGRESS;
}

/** Compact, relative-then-absolute date for list rows: "Today", "3 days ago", "12 Aug". */
export function transferShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

/** Fuller date for the detail dialog: "12 August 2026". */
export function transferLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * `GET /transfers` carries no separate human reference — the transfer id is what
 * the success receipt already shows, so reuse it here for consistency.
 */
export function transferReference(id: string): string {
  return id;
}
