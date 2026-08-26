import type {
  BalanceResponse,
  CreateFundingRequest,
  CreateTransferRequest,
  CreateUserRequest,
  CreateUserResponse,
  CurrencyCode,
  FundingRecord,
  FundingStatus,
  OnrampSession,
  RateResponse,
  TransferRecord,
  TransferStatus,
} from "./types";
import { randomRate } from "./mock-data";
import { API_URL, isMockMode } from "./config";
import { getValidAccessToken, handleUnauthorized } from "./auth";

export { isMockMode };

export const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: "Securing your transfer",
  onramp_complete: "Converting EUR to USDC",
  sent: "Confirming on Solana",
  confirmed: "Confirmed",
  failed: "Transfer failed",
};

export const FUNDING_STATUS_LABEL: Record<FundingStatus, string> = {
  pending: "Adding funds",
  confirmed: "Added",
  failed: "Couldn't add funds",
};

/** `Authorization: Bearer <token>` for a protected endpoint, or `{}` if there's no valid session (the request will then 401, same as today with no session at all). */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Thrown by `createTransfer()` on a `400`/`500` — `code`/`requiredUsdc` are only set for `INSUFFICIENT_BALANCE`. */
export interface ApiError extends Error {
  code?: string;
  requiredUsdc?: number;
}

// Mock-mode's own real-shaped ledger (module-scope, resets on a full reload) —
// seeded generously so a mock demo can send right away without needing to fund
// first, same spirit as the old static BALANCES fixture it replaces, but now a
// single real USDC figure instead of one per fiat currency.
let mockBalanceUsdc = 2000;

/**
 * `POST /transfers`. No longer creates a Transak session — the backend is
 * balance-checked and, when funded, instant. Returns the settled transfer row
 * directly (same shape `GET /transfers/:id` already returns) for every outcome
 * that isn't a request-level failure: `200`/`202`/`422`/`502` are all real
 * settlement outcomes (confirmed/sent/failed), not exceptions — only a `400`
 * (validation, or `INSUFFICIENT_BALANCE`) or `500` throws. Shape confirmed
 * against the real backend — see API_CONTRACT.md.
 */
export async function createTransfer(req: CreateTransferRequest): Promise<TransferRecord> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    const body = await res.json().catch(() => null);
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired — please sign in again");
    }
    if (res.status === 400 || res.status === 403 || res.status === 500) {
      const err = new Error(body?.error ?? `POST /transfers failed: ${res.status}`) as ApiError;
      err.code = body?.code;
      err.requiredUsdc = body?.required_usdc;
      throw err;
    }
    return body as TransferRecord;
  }

  return mockCreateTransfer(req);
}

async function mockCreateTransfer(req: CreateTransferRequest): Promise<TransferRecord> {
  await new Promise((r) => setTimeout(r, 250));

  const rate = randomRate("EUR"); // mock equivalent of the real getMarketRate("EUR")
  const amount_usdc = Number((req.amount_eur * rate).toFixed(6));

  if (mockBalanceUsdc < amount_usdc) {
    const err = new Error("Insufficient balance — add funds before sending") as ApiError;
    err.code = "INSUFFICIENT_BALANCE";
    err.requiredUsdc = amount_usdc;
    throw err;
  }
  mockBalanceUsdc = Number((mockBalanceUsdc - amount_usdc).toFixed(6));

  const id = `tr_${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    status: "pending",
    solana_tx_signature: null,
    amount_eur: req.amount_eur,
    amount_usdc,
    failure_reason: null,
    retry_count: 0,
    onramp_session_id: null,
    onramp_reference: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * `POST /users`. Creates a sender or recipient row.
 * Shape confirmed against the real backend — see API_CONTRACT.md.
 */
export async function createUser(req: CreateUserRequest): Promise<CreateUserResponse> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      throw new Error(body?.error ?? `POST /users failed: ${res.status}`);
    }
    return res.json();
  }

  return mockCreateUser(req);
}

async function mockCreateUser(req: CreateUserRequest): Promise<CreateUserResponse> {
  await new Promise((r) => setTimeout(r, 250));
  return {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    name: req.name,
    role: req.role,
    country: req.country,
    wallet_address: req.wallet_address,
    created_at: new Date().toISOString(),
  };
}

/**
 * `GET /rate`. A live fiat -> USDC market rate, proxied from Transak's public Get
 * Price quote (no separate rate API needed — Transak already prices this for real
 * checkout sessions). Shape confirmed against the real backend — see API_CONTRACT.md.
 */
export async function getRate(currency: CurrencyCode): Promise<number> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/rate?fiatCurrency=${currency}`);
    if (!res.ok) throw new Error(`GET /rate failed: ${res.status}`);
    const body: RateResponse = await res.json();
    return body.rate;
  }

  return randomRate(currency);
}

/**
 * `GET /balances/:userId`. Real for both senders (post-funding, post-send debit/
 * credit) and recipients (post-transfer credit) now. Shape confirmed against the
 * real backend — see API_CONTRACT.md.
 */
export async function getBalance(userId: string): Promise<number> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/balances/${userId}`, { headers: await authHeaders() });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired — please sign in again");
    }
    if (!res.ok) throw new Error(`GET /balances/${userId} failed: ${res.status}`);
    const body: BalanceResponse = await res.json();
    return body.usdc_balance;
  }

  return mockBalanceUsdc;
}

/**
 * `POST /funding`. Creates a Transak session that tops up the sender's own
 * balance — same session-creation shape `POST /transfers` used to return, just
 * for a different purpose. Shape confirmed against the real backend — see
 * API_CONTRACT.md.
 */
export async function createFunding(
  req: CreateFundingRequest
): Promise<FundingRecord & { onramp: OnrampSession }> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/funding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired — please sign in again");
    }
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      throw new Error(body?.error ?? `POST /funding failed: ${res.status}`);
    }
    return res.json();
  }

  return mockCreateFunding(req);
}

const mockFundingRequests = new Map<string, FundingRecord>();

async function mockCreateFunding(
  req: CreateFundingRequest
): Promise<FundingRecord & { onramp: OnrampSession }> {
  await new Promise((r) => setTimeout(r, 250));

  const rate = randomRate("EUR");
  const amount_usdc = Number((req.amount_eur * rate).toFixed(6));
  const id = `fund_${Math.random().toString(36).slice(2, 10)}`;

  const record: FundingRecord = {
    id,
    sender_id: req.sender_id,
    amount_eur: req.amount_eur,
    amount_usdc,
    status: "pending",
    onramp_session_id: id,
    onramp_reference: null,
    failure_reason: null,
    created_at: new Date().toISOString(),
  };
  mockFundingRequests.set(id, record);

  const params = new URLSearchParams({
    transferId: id,
    amount: req.amount_eur.toFixed(2),
    reference: `KB-FUND-${id.slice(-4)}`,
  });
  const widgetUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/transfers/mock-widget?${params.toString()}`
      : `/transfers/mock-widget?${params.toString()}`;

  return { ...record, onramp: { sessionId: id, widgetUrl } };
}

/**
 * `GET /funding/:id`. Poll this for live status after `POST /funding`, same
 * pattern as `GET /transfers/:id`. `balance` is the sender's current real
 * balance, not just this one request's amount — the resulting total, not a
 * delta. Shape confirmed against the real backend — see API_CONTRACT.md.
 */
export async function getFundingRequest(
  id: string,
  opts?: { mockOutcome?: "confirmed" | "failed" }
): Promise<FundingRecord & { balance: number }> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/funding/${id}`, { headers: await authHeaders() });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired — please sign in again");
    }
    if (!res.ok) throw new Error(`GET /funding/${id} failed: ${res.status}`);
    return res.json();
  }
  return mockGetFundingRequest(id, opts?.mockOutcome ?? "confirmed");
}

const FUNDING_STAGE_MS = 400;
const mockFundingStartedAt = new Map<string, number>();

async function mockGetFundingRequest(
  id: string,
  outcome: "confirmed" | "failed"
): Promise<FundingRecord & { balance: number }> {
  const record = mockFundingRequests.get(id);
  if (!record) throw new Error(`Mock funding request ${id} not found`);

  const startedAt = mockFundingStartedAt.get(id) ?? Date.now();
  mockFundingStartedAt.set(id, startedAt);
  const elapsed = Date.now() - startedAt;

  // Claim once, exactly like the real webhook's conditional update — a second
  // poll after the request already resolved must not credit twice.
  if (elapsed >= FUNDING_STAGE_MS && record.status === "pending") {
    if (outcome === "failed") {
      record.status = "failed";
      record.failure_reason = "The simulated top-up could not be completed.";
    } else {
      record.status = "confirmed";
      record.onramp_reference = `KB-MOCK-${id.slice(-4)}`;
      mockBalanceUsdc = Number((mockBalanceUsdc + (record.amount_usdc ?? 0)).toFixed(6));
    }
  }

  return { ...record, balance: mockBalanceUsdc };
}

/**
 * Polls `GET /funding/:id` until the request reaches a terminal status
 * (`confirmed` or `failed`). Same shape as `pollTransferStatus` below —
 * deliberately, so both flows share one polling pattern.
 */
export function pollFundingStatus(
  id: string,
  onUpdate: (funding: FundingRecord & { balance: number }) => void,
  opts?: { intervalMs?: number; mockOutcome?: "confirmed" | "failed" }
): () => void {
  let cancelled = false;
  const intervalMs = opts?.intervalMs ?? (isMockMode() ? FUNDING_STAGE_MS : 3000);

  const tick = async () => {
    if (cancelled) return;
    let record: FundingRecord & { balance: number };
    try {
      record = await getFundingRequest(id, { mockOutcome: opts?.mockOutcome });
    } catch {
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

/**
 * `GET /transfers/:id`. The only source of truth for a transfer's real status — driven
 * server-side by Transak's signed webhook, never by anything the client observes directly.
 */
export async function getTransfer(
  id: string,
  opts?: { mockOutcome?: "confirmed" | "failed" }
): Promise<TransferRecord> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/transfers/${id}`, { headers: await authHeaders() });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired — please sign in again");
    }
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
