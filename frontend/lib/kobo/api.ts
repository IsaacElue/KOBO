import type { CreateTransferRequest, CreateTransferResponse, OnrampSession, TransferRecord, TransferStatus } from "./types";

export const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: "Securing your transfer",
  onramp_complete: "Converting EUR to USDC",
  sent: "Confirming on Solana",
  confirmed: "Confirmed",
  failed: "Transfer failed",
};

const API_URL = process.env.NEXT_PUBLIC_KOBO_API_URL;

/** True while there's no real backend configured — see NEXT_PUBLIC_KOBO_API_URL in .env.example. */
export function isMockMode() {
  return !API_URL;
}

/**
 * `POST /transfers`. Returns the created transfer plus a Transak checkout session to launch.
 * Shape confirmed against the real backend — see API_CONTRACT.md.
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
  const id = `tr_${Math.random().toString(36).slice(2, 10)}`;

  const params = new URLSearchParams({
    transferId: id,
    amount: req.amount_eur.toFixed(2),
    reference: `KB-${9182 + (seed % 800)}-EU`,
  });
  const widgetUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/transfers/mock-widget?${params.toString()}`
      : `/transfers/mock-widget?${params.toString()}`;

  return {
    id,
    status: "pending",
    onramp_reference: null, // real backend leaves this null until the onramp webhook fires
    onramp: {
      sessionId: id,
      widgetUrl,
    },
  };
}

/**
 * `GET /transfers/:id`. The only source of truth for a transfer's real status — driven
 * server-side by Transak's signed webhook, never by anything the client observes directly.
 */
export async function getTransfer(
  id: string,
  opts?: { mockOutcome?: "confirmed" | "failed" }
): Promise<TransferRecord> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/transfers/${id}`);
    if (!res.ok) throw new Error(`GET /transfers/${id} failed: ${res.status}`);
    return res.json();
  }
  return mockGetTransfer(id, opts?.mockOutcome ?? "confirmed");
}

const MOCK_STAGES: TransferStatus[] = ["pending", "onramp_complete", "sent", "confirmed"];
const MOCK_STAGE_MS = 400;
const mockPollStartedAt = new Map<string, number>();

async function mockGetTransfer(id: string, outcome: "confirmed" | "failed"): Promise<TransferRecord> {
  const startedAt = mockPollStartedAt.get(id) ?? Date.now();
  mockPollStartedAt.set(id, startedAt);

  const elapsed = Date.now() - startedAt;
  const stageIndex = Math.min(MOCK_STAGES.length - 1, Math.floor(elapsed / MOCK_STAGE_MS));
  let status = MOCK_STAGES[stageIndex];
  let failure_reason: string | null = null;

  if (status === "confirmed" && outcome === "failed") {
    status = "failed";
    failure_reason = "The simulated payment could not be completed.";
  }

  return {
    id,
    status,
    solana_tx_signature: status === "sent" || status === "confirmed" ? `mock_sig_${id}` : null,
    amount_eur: 0,
    amount_usdc: null,
    failure_reason,
    retry_count: 0,
    onramp_session_id: id,
    onramp_reference: status === "pending" ? null : `KB-MOCK-${id.slice(-4)}`,
    created_at: new Date(startedAt).toISOString(),
  };
}

/**
 * Polls `GET /transfers/:id` until the transfer reaches a terminal status
 * (`confirmed` or `failed`), calling `onUpdate` with the latest record each time.
 * Returns a cancel function. This is the only thing that should ever decide whether
 * a transfer succeeded — never a client-side postMessage/iframe signal.
 */
export function pollTransferStatus(
  id: string,
  onUpdate: (transfer: TransferRecord) => void,
  opts?: { intervalMs?: number; mockOutcome?: "confirmed" | "failed" }
): () => void {
  let cancelled = false;
  // Real polling shouldn't hammer the server; the mock can afford to feel snappy for demos.
  const intervalMs = opts?.intervalMs ?? (isMockMode() ? MOCK_STAGE_MS : 3000);

  const tick = async () => {
    if (cancelled) return;
    let record: TransferRecord;
    try {
      record = await getTransfer(id, { mockOutcome: opts?.mockOutcome });
    } catch {
      // Transient network error - keep polling rather than getting stuck.
      if (!cancelled) setTimeout(tick, intervalMs);
      return;
    }
    if (cancelled) return;
    onUpdate(record);
    if (record.status !== "confirmed" && record.status !== "failed") {
      setTimeout(tick, intervalMs);
    }
  };

  tick();
  return () => {
    cancelled = true;
  };
}
