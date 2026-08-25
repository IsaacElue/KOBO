import type { CreateTransferRequest, CreateTransferResponse, OnrampSession, TransferStatus } from "./types";

const STATUS_SEQUENCE: TransferStatus[] = ["pending", "onramp_complete", "sent", "confirmed"];

export const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: "Securing your transfer",
  onramp_complete: "Converting EUR to USDC",
  sent: "Broadcasting on Solana",
  confirmed: "Confirmed",
};

const API_URL = process.env.NEXT_PUBLIC_KOBO_API_URL;

/** True while there's no real backend configured — see NEXT_PUBLIC_KOBO_API_URL in .env.example. */
export function isMockMode() {
  return !API_URL;
}

/**
 * `POST /transfers`. Returns the created transfer plus a Transak checkout session to launch.
 * `onramp` shape confirmed against the real backend — see API_CONTRACT.md.
 */
export async function createTransfer(
  req: CreateTransferRequest
): Promise<CreateTransferResponse & { onramp: OnrampSession }> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`POST /transfers failed: ${res.status}`);
    return res.json();
  }

  return mockCreateTransfer(req);
}

async function mockCreateTransfer(
  req: CreateTransferRequest
): Promise<CreateTransferResponse & { onramp: OnrampSession }> {
  await new Promise((r) => setTimeout(r, 250));
  const seed = [...req.recipient_id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const transferId = `tr_${Math.random().toString(36).slice(2, 10)}`;
  const reference = `KB-${9182 + (seed % 800)}-EU`;

  const params = new URLSearchParams({
    transferId,
    amount: req.amount_eur.toFixed(2),
    reference,
  });
  const widgetUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/transfers/mock-widget?${params.toString()}`
      : `/transfers/mock-widget?${params.toString()}`;

  return {
    transfer_id: transferId,
    status: "pending",
    onramp_reference: reference,
    onramp: {
      sessionId: transferId,
      widgetUrl,
    },
  };
}

/**
 * Mocks the backend pushing status updates for a transfer (pending -> onramp_complete -> sent -> confirmed).
 * Returns a cancel function so callers can stop the simulation on unmount.
 */
export function watchTransferStatus(
  onStatus: (status: TransferStatus) => void,
  stepMs = 900
): () => void {
  let cancelled = false;
  let idx = 0;
  const tick = () => {
    if (cancelled) return;
    onStatus(STATUS_SEQUENCE[idx]);
    if (idx < STATUS_SEQUENCE.length - 1) {
      idx += 1;
      setTimeout(tick, stepMs);
    }
  };
  tick();
  return () => {
    cancelled = true;
  };
}
