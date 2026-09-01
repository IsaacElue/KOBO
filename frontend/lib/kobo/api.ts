import type {
  ActivityTransfer,
  TransferHistoryPage,
  TransferHistoryQuery,
  BalanceResponse,
  CreateFundingRequest,
  CreateFundingResponse,
  CreateTransferRequest,
  CreateUserRequest,
  CreateUserResponse,
  CurrencyCode,
  FundingRecord,
  FundingStatus,
  MarketOverview,
  OnrampSession,
  RecipientLookupResult,
  RecipientLookupUser,
  RateResponse,
  TransferRecord,
  TransferStatus,
  UserProfile,
} from "./types";
import { CURRENT_USER, RECIPIENTS, TRANSFER_HISTORY, randomRate } from "./mock-data";
import { TRANSFER_STATUS_GROUPS, statusGroupParam } from "./transfer-display";
import { API_URL, isMockMode } from "./config";
import { generatePlaceholderWalletAddress } from "./solana";
import { getValidAccessToken, handleUnauthorized, updateStoredUser } from "./auth";

export { isMockMode };

export const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: "Securing your transfer",
  onramp_complete: "Converting EUR to USDC",
  sent: "Confirming on Solana",
  confirmed: "Confirmed",
  failed: "Transfer failed",
};

// Phase 1 (backend) added three reserved statuses for non-instant rails
// (SEPA/Stripe) that no current UI path can ever produce — no rail exists
// yet to create them. Labels included so this Record stays exhaustive against
// FundingStatus without a runtime fallback string scattered elsewhere.
export const FUNDING_STATUS_LABEL: Record<FundingStatus, string> = {
  pending: "Adding funds",
  confirmed: "Added",
  failed: "Couldn't add funds",
  awaiting_reconciliation: "Waiting for bank transfer",
  manual_review: "Under review",
  payout_pending: "Payout in progress",
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

// Mock-mode profile + password, mutated by updateProfile/changePassword so a
// mock demo of Settings behaves like the real thing (edits stick for the
// session, a wrong current password is rejected). Resets on a full reload,
// same as mockBalanceUsdc above.
const mockProfile: UserProfile = {
  id: CURRENT_USER.id,
  name: CURRENT_USER.name,
  role: "sender",
  country: "IE",
  wallet_address: "6Cx1cZ8mKpP1s6xM4mE9pN2vQ7wR3tYb5uH8jK4dLzAa",
  email: "you@example.com",
  created_at: "2026-06-01T09:00:00.000Z",
};
let mockPassword = "password123";

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
      throw new Error("Your session has expired. Please sign in again");
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
    const err = new Error("Insufficient balance. Add funds before sending") as ApiError;
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
    // Mock mode has no real Crossmint call to make — stand in with a
    // random valid-format address, same as the real backend would
    // eventually store, just not resolved from req.email for real.
    wallet_address: req.wallet_address ?? generatePlaceholderWalletAddress(),
    created_at: new Date().toISOString(),
  };
}

/**
 * `GET /users?email=` (no auth — recipients are payees, not logged-in accounts).
 * Looks up a saved recipient by email; returns the full `users` row (email
 * column included) or `null` when no row has that email (`404`). This is a
 * lookup only — it never provisions a wallet. Mock mode has no persisted
 * recipient rows to search, so it always returns `null` (matching a real
 * never-before-seen email). Shape confirmed against the real backend — see
 * API_CONTRACT.md.
 */
export async function findRecipientByEmail(email: string): Promise<RecipientLookupUser | null> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/users?email=${encodeURIComponent(email)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /users?email= failed: ${res.status}`);
    const body: RecipientLookupResult = await res.json();
    return body.user;
  }

  // Mock mode has no recipient rows to search — return "not found" without
  // provisioning anything (lookup must never create a wallet).
  await new Promise((r) => setTimeout(r, 150));
  return null;
}

/**
 * `GET /auth/me`. The signed-in sender's own full profile — name, country,
 * wallet_address, email, and member-since (`created_at`). The only endpoint
 * that returns a sender their own email/`created_at` (no `POST /auth/*`
 * response carries either). Settings-only. Shape confirmed against the real
 * backend — see API_CONTRACT.md.
 */
export async function getProfile(): Promise<UserProfile> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/auth/me`, { headers: await authHeaders() });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
    }
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      throw new Error(body?.error ?? `GET /auth/me failed: ${res.status}`);
    }
    const body: { user: UserProfile } = await res.json();
    return body.user;
  }
  return { ...mockProfile };
}

/**
 * `PATCH /auth/profile`. Updates the signed-in sender's own `name`/`country`.
 * On success also syncs the persisted session's cached user (so the header
 * name updates without a reload). Shape confirmed against the real backend —
 * see API_CONTRACT.md.
 */
export async function updateProfile(updates: { name?: string; country?: string }): Promise<UserProfile> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/auth/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(updates),
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
    }
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      throw new Error(body?.error ?? `PATCH /auth/profile failed: ${res.status}`);
    }
    const body: { user: UserProfile } = await res.json();
    updateStoredUser({ name: body.user.name, country: body.user.country });
    return body.user;
  }

  await new Promise((r) => setTimeout(r, 200));
  if (updates.name !== undefined) mockProfile.name = updates.name.trim();
  if (updates.country !== undefined) mockProfile.country = updates.country.trim();
  return { ...mockProfile };
}

/**
 * `POST /auth/password`. Changes the signed-in sender's account password via
 * Supabase Auth. Requires the current password as a re-entry check. The
 * backend revokes the session on success, so the caller must send the user
 * back to login afterward. Shape confirmed against the real backend — see
 * API_CONTRACT.md.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
    }
    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      throw new Error(body?.error ?? `POST /auth/password failed: ${res.status}`);
    }
    return;
  }

  await new Promise((r) => setTimeout(r, 200));
  if (currentPassword !== mockPassword) throw new Error("Current password is incorrect");
  if (newPassword.length < 8) throw new Error("new_password is required and must be at least 8 characters");
  if (newPassword === currentPassword) throw new Error("new_password must be different from your current password");
  mockPassword = newPassword;
}

/**
 * `GET /market/overview`. CoinGecko-backed SOL/USDC price + 24h/7d change +
 * 7-day sparkline, cached server-side (see backend `lib/market.ts`). Returns
 * `null` on any failure so the Activity page can show a "market data
 * unavailable" state instead of throwing. Shape confirmed against the real
 * backend — see API_CONTRACT.md.
 */
export async function getMarketOverview(): Promise<MarketOverview | null> {
  if (!isMockMode()) {
    try {
      const res = await fetch(`${API_URL}/market/overview`);
      if (!res.ok) return null;
      return (await res.json()) as MarketOverview;
    } catch {
      return null;
    }
  }

  await new Promise((r) => setTimeout(r, 200));
  // Deterministic-ish mock: a gently rising 7-day curve so the sparkline has shape.
  const spark = Array.from({ length: 48 }, (_, i) => 78 + i * 0.35 + Math.sin(i / 5) * 1.4);
  return {
    sol: { price_eur: spark[spark.length - 1], change_24h: 2.4, change_7d: 11.8, sparkline_7d: spark },
    usdc: { price_eur: 0.92, change_24h: -0.03, change_7d: 0.01, sparkline_7d: Array(48).fill(0.92) },
    updated_at: new Date().toISOString(),
    stale: false,
  };
}

/**
 * `GET /transfers`. The signed-in sender's own transfer history, newest
 * first, for the Activity page. Real `transfers` rows plus the joined
 * `recipient_name` — no invented fields. Mock mode derives the same shape
 * from the existing `TRANSFER_HISTORY` fixture. Shape confirmed against the
 * real backend — see API_CONTRACT.md.
 */
export async function getMyTransfers(): Promise<ActivityTransfer[]> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/transfers`, { headers: await authHeaders() });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
    }
    if (!res.ok) throw new Error(`GET /transfers failed: ${res.status}`);
    const body: { transfers: ActivityTransfer[] } = await res.json();
    return body.transfers;
  }

  await new Promise((r) => setTimeout(r, 200));
  return mockActivityTransfers();
}

/** The mock-mode `ActivityTransfer[]`, derived from the `TRANSFER_HISTORY`
 * fixture. Newest first (index 0), stable dates. Shared by `getMyTransfers`
 * (Overview + stats) and `getTransferHistory` (the Activity list). */
function mockActivityTransfers(): ActivityTransfer[] {
  const nameById = new Map(RECIPIENTS.map((r) => [r.id, r.name]));
  const base = Date.UTC(2026, 7, 20); // fixed reference so mock dates are stable
  return TRANSFER_HISTORY.map((t, i) => {
    const status: TransferStatus =
      t.status === "Delivered" ? "confirmed" : t.status === "Refunded" ? "failed" : "sent";
    return {
      id: t.id,
      recipient_id: t.recipientId,
      recipient_name: nameById.get(t.recipientId) ?? null,
      amount_eur: t.amountEur,
      amount_usdc: status === "confirmed" ? Number((t.amountEur * 1.08).toFixed(2)) : null,
      status,
      solana_tx_signature: status === "confirmed" || status === "sent" ? `mock_sig_${t.id}` : null,
      failure_reason: t.status === "Refunded" ? "The transfer was refunded." : null,
      created_at: new Date(base - i * 6 * 86_400_000).toISOString(),
    };
  });
}

/**
 * `GET /transfers?q=&status=&limit=&offset=` — one filtered, paginated page of
 * the signed-in sender's history, for the Activity screen's "Transfer history"
 * block. Real rows in real mode (server does the filtering); mock mode
 * filters/paginates the `TRANSFER_HISTORY` fixture in memory (no fixture
 * history ever reaches real mode). Shape confirmed against the real backend —
 * see API_CONTRACT.md.
 */
export const TRANSFER_HISTORY_PAGE_SIZE = 10;

export async function getTransferHistory(
  query: TransferHistoryQuery = {}
): Promise<TransferHistoryPage> {
  const limit = query.limit ?? TRANSFER_HISTORY_PAGE_SIZE;
  const offset = query.offset ?? 0;
  const group = query.group ?? "all";
  const q = query.q?.trim() || undefined;
  const statusParam = statusGroupParam(group);

  if (!isMockMode()) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (statusParam) params.set("status", statusParam);
    if (q) params.set("q", q);

    const res = await fetch(`${API_URL}/transfers?${params.toString()}`, {
      headers: await authHeaders(),
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
    }
    if (!res.ok) throw new Error(`GET /transfers failed: ${res.status}`);
    const body: Partial<TransferHistoryPage> & { transfers: ActivityTransfer[] } = await res.json();
    return {
      transfers: body.transfers,
      total: body.total ?? body.transfers.length,
      limit: body.limit ?? limit,
      offset: body.offset ?? offset,
      has_more: body.has_more ?? false,
    };
  }

  await new Promise((r) => setTimeout(r, 200));
  const groupStatuses = TRANSFER_STATUS_GROUPS.find((g) => g.key === group)?.statuses ?? [];
  const all = mockActivityTransfers().filter((t) => {
    if (groupStatuses.length && !groupStatuses.includes(t.status)) return false;
    if (q) {
      const hay = q.toLowerCase();
      return (
        (t.recipient_name ?? "").toLowerCase().includes(hay) ||
        t.id.toLowerCase().includes(hay) ||
        (t.solana_tx_signature ?? "").toLowerCase().includes(hay)
      );
    }
    return true;
  });
  const page = all.slice(offset, offset + limit);
  return {
    transfers: page,
    total: all.length,
    limit,
    offset,
    has_more: offset + page.length < all.length,
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
      throw new Error("Your session has expired. Please sign in again");
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
): Promise<CreateFundingResponse> {
  if (!isMockMode()) {
    const res = await fetch(`${API_URL}/funding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please sign in again");
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
): Promise<CreateFundingResponse> {
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
    // Mock mode has no real ONRAMP_PROVIDER to resolve against — "moonpay"
    // matches the real backend's own default when rail is omitted.
    rail: req.rail ?? "moonpay",
    onramp_session_id: id,
    onramp_reference: null,
    failure_reason: null,
    created_at: new Date().toISOString(),
  };
  mockFundingRequests.set(id, record);

  if (record.rail === "crossmint") {
    // Mock mode has no real Crossmint order — a fake clientSecret is enough
    // for the embedded-checkout mock harness (see CrossmintCheckoutModal's
    // own mock-mode branch) to render its own simulated UI.
    return {
      ...record,
      fundingRequestId: id,
      orderId: id,
      onramp: { sessionId: id, widgetUrl: "", checkoutClientSecret: `mock_secret_${id}`, paymentStatus: "awaiting-payment" },
    };
  }

  const params = new URLSearchParams({
    transferId: id,
    amount: req.amount_eur.toFixed(2),
    reference: `KB-FUND-${id.slice(-4)}`,
  });
  const widgetUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/transfers/mock-widget?${params.toString()}`
      : `/transfers/mock-widget?${params.toString()}`;

  return { ...record, fundingRequestId: id, orderId: null, onramp: { sessionId: id, widgetUrl } };
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
      throw new Error("Your session has expired. Please sign in again");
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
      throw new Error("Your session has expired. Please sign in again");
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
