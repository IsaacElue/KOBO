import type { CurrencyCode } from "./types";

const KEY = "kobo:onramp-draft";

/**
 * Snapshot of everything needed to resume after a full-page round trip to Transak's
 * hosted checkout: enough to restore the form on cancel/failure, and enough to render
 * the existing success/failed receipts without re-deriving them from a recipient list
 * that may have changed (e.g. a recipient added right before confirming).
 */
export interface OnrampDraft {
  transferId: string;
  reference: string;
  currency: CurrencyCode;
  amount: string;
  recipientId: string;
  recipient: { name: string; initials: string; wallet: string };
  sentStr: string;
  feeStr: string;
  receiveStr: string;
  rate: string;
  /** Set once the return page has confirmed the transfer, so a duplicate visit is a no-op. */
  completed?: boolean;
}

export function saveOnrampDraft(draft: OnrampDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage unavailable (private mode, etc.) - the return page falls back
    // to its "no matching local session" handling.
  }
}

export function loadOnrampDraft(): OnrampDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OnrampDraft) : null;
  } catch {
    return null;
  }
}

export function markOnrampDraftCompleted() {
  const draft = loadOnrampDraft();
  if (draft) saveOnrampDraft({ ...draft, completed: true });
}

export function clearOnrampDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
