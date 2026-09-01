import type { TransferStatus, TransferStatusGroup } from "./types";

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

/** Full date + time for the detail dialog's secondary info: "12 August 2026, 14:58". */
export function transferDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Middle-truncates a long opaque string (a transfer id, a Solana signature) so a
 * detail row can never force horizontal scroll. The full value stays available
 * via Copy / a `title` attribute.
 */
export function truncateMiddle(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Mock-mode signatures are `mock_sig_<id>` placeholders (see `lib/kobo/api.ts`);
 * real ones are ~87–88-char base58. Only the latter belong on-chain.
 */
export function isRealSolanaSignature(sig: string | null | undefined): sig is string {
  return !!sig && !sig.startsWith("mock_sig_") && /^[1-9A-HJ-NP-Za-km-z]{32,120}$/.test(sig);
}

/**
 * Solana Explorer URL for a real signature, or `null` for a placeholder /
 * missing one (never link to a fake). Kobo settles on devnet, so the cluster
 * is pinned unless `NEXT_PUBLIC_SOLANA_CLUSTER` overrides it.
 */
export function solanaExplorerUrl(sig: string | null | undefined): string | null {
  if (!isRealSolanaSignature(sig)) return null;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

/** The Activity history status filter — group label + the raw statuses it selects. */
export const TRANSFER_STATUS_GROUPS: {
  key: TransferStatusGroup;
  label: string;
  statuses: TransferStatus[];
}[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "delivered", label: "Delivered", statuses: ["confirmed"] },
  { key: "pending", label: "In progress", statuses: ["pending", "onramp_complete", "sent"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
];

/** The comma-joined `status=` query value for a group, or `undefined` for "all". */
export function statusGroupParam(group: TransferStatusGroup): string | undefined {
  const match = TRANSFER_STATUS_GROUPS.find((g) => g.key === group);
  return match && match.statuses.length ? match.statuses.join(",") : undefined;
}
