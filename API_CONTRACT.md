# Kobo API Contract

Shared source of truth between `backend/` (Person B / Isaac — Express + Supabase +
Solana devnet + Transak) and `frontend/` (Person A / Shina — Next.js). Describes what
is **actually implemented** on each side as of this sync, not what was planned.

Update this file in place when either side's contract changes — don't append a new
dated section, overwrite the stale one.

**Backend read at:** `main` @ `07aa827` ("docs: add POST /users to API_CONTRACT,
resolves mismatch #5").
**Frontend read at:** `restructure-frontend-folder` @ `bef70f3` — `main` and
`restructure-frontend-folder` are now fully merged (both directions), so this is a
single monorepo branch, not a pending PR.

**Since the last sync:** frontend now matches the real `{ sessionId, widgetUrl }`
onramp shape and picks redirect-vs-embedded itself, including the outer `id` field
(`transfer_id` is gone) (Resolved #1); the `TRANSAK_REFERRER_DOMAIN` question is
answered (Resolved #2); `POST /users` exists on the backend (Resolved #3); the wrong
"Base" chain label is fixed to "Confirming on Solana" (Resolved #4); and
`frontend/.env.example` was silently gitignored and never actually committed until now
(Resolved #5). The postMessage-vs-webhook dual-signal issue is also now fixed: the
frontend polls the real `GET /transfers/:id` for status instead of faking it
client-side, and a `failed` status is now handled end to end (Resolved #6, #7 — see
below, these were "Still open" #1 and #5).

---

## Base URL & health

- Backend: Express app, `app.listen(process.env.PORT || 4000)`.
- `GET /health` → `{ "status": "ok" }`. No auth.
- **No CORS middleware is set up in `backend/src/index.ts`** and **no auth/session
  middleware exists on any route** — every endpoint below is currently open and will
  hit CORS errors if called from the frontend's origin in the browser. See "Still
  open" #6 and #7 below.

---

## `POST /users`

Creates a user (sender or recipient). See "Resolved this sync" #3 below.

**Request body** (backend/src/routes/users.ts):
```json
{
  "name": "string",
  "role": "sender | recipient",
  "country": "string",
  "wallet_address": "string"
}
```
- All four fields required.
- `role` must be exactly `"sender"` or `"recipient"`.
- `wallet_address` is checked with `new PublicKey(...)` (base58 charset + correct
  32-byte length) — a format check only, no on-chain existence check.

**Success response — `201`:** the created row, verbatim:
```json
{
  "id": "uuid",
  "name": "string",
  "role": "sender" | "recipient",
  "country": "string",
  "wallet_address": "string",
  "created_at": "2026-08-25T12:00:00.000Z"
}
```

**Error responses:**
- `400` — `{ "error": "name is required" }`
- `400` — `{ "error": "role must be one of: sender, recipient" }`
- `400` — `{ "error": "country is required" }`
- `400` — `{ "error": "wallet_address is required" }`
- `400` — `{ "error": "wallet_address does not look like a valid Solana address" }`
- `500` — `{ "error": "<supabase error message>" }`

No `GET /users` / listing / lookup endpoint exists — out of scope for now. No auth —
same open-endpoint caveat as everything else (see "Still open" #6).

---

## `POST /funding` (NEW this sync)

Tops up the **sender's own** real balance — not a send to anyone. Creates a
Transak widget session, same underlying mechanics as the old per-transfer session
creation (`createWidgetSession`, reused unchanged), except the destination wallet
is **Kobo's own pooled backend wallet** (`backendWallet.publicKey`,
`backend/src/lib/solana.ts`), not a recipient's. Real USDC that lands there via
this flow is credited to the sender's row in `balances` once
`POST /webhooks/onramp` confirms it — see that section below.

**Request body** (`backend/src/routes/funding.ts`):
```json
{ "sender_id": "uuid", "amount_eur": 100 }
```
- Both fields required; `amount_eur` must be a JS `number` and `> 0`.
- `sender_id` must be an existing `uuid` row in `users` (any role — the route
  doesn't check `role === "sender"`, same laxness `POST /transfers` already had
  around sender/recipient roles).

**Success response — `201`:**
```json
{
  "id": "uuid",
  "sender_id": "uuid",
  "amount_eur": 100,
  "amount_usdc": 116.428667,
  "status": "pending",
  "onramp_session_id": "string | null",
  "onramp_reference": null,
  "failure_reason": null,
  "created_at": "2026-08-26T12:00:00.000Z",
  "onramp": { "sessionId": "string | null", "widgetUrl": "https://global-stg.transak.com/...(single-use, valid 5 min)" }
}
```
The whole `funding_requests` row (new table — see Data model below), plus the same
`onramp: { sessionId, widgetUrl }` shape `POST /transfers` used to return.
`amount_usdc` is computed with the **real live market rate**
(`getMarketRate("EUR")`, `backend/src/lib/transak.ts` — the same function
`GET /rate` uses), not a placeholder — this is a fresh code path with no old
convention to preserve, and the figure directly determines how much gets credited
to the sender's balance once confirmed, so accuracy matters here more than it did
for the old display-only `POST /transfers` estimate (see "Still open" #9, still
unresolved for the parts of the system it was already scoped to).

**Error responses:**
- `400` — `{ "error": "sender_id and numeric amount_eur are required" }`
- `400` — `{ "error": "amount_eur must be positive" }`
- `400` — `{ "error": "sender_id must be a valid UUID" }`
- `400` — `{ "error": "Sender not found" }`
- `502` — `{ "error": "Failed to fetch conversion rate: <message>" }`
- `502` — `{ "error": "Failed to create Transak widget session: <message>" }` — the
  `funding_requests` row is deleted server-side before this is returned (no
  orphaned rows), same pattern `POST /transfers` used to follow.
- `500` — `{ "error": "<supabase error message>" }`

## `POST /transfers` — **behavior changed this sync, no longer creates a Transak session**

**Breaking change from the shape documented in every prior sync of this file:**
this endpoint no longer ever returns an `onramp` object, and no longer ever
returns `201`. It's now balance-checked and, when funded, **instant** — see
`KOBO_BUILD_PLAN.md` "Sender-side balance — SUPERSEDED" for the product decision
behind this. **No parallel/legacy per-transfer Transak-session path was kept** —
if you want to add funds, that's `POST /funding` now, a separate step before
sending, not something `POST /transfers` falls back to.

**Request body unchanged** (`backend/src/routes/transfers.ts`):
```json
{ "sender_id": "uuid", "recipient_id": "uuid", "amount_eur": 250 }
```
Same three required fields as before. New: `amount_eur` must also be `> 0` (not
previously enforced — added because this number now directly drives a real ledger
debit, where it wasn't before).

**New flow, in order:**
1. Validate inputs, look up sender (existence only) and recipient (existence +
   `wallet_address`) — unchanged from before.
2. Compute `amount_usdc` from the **real live rate** (`getMarketRate("EUR")`,
   same function `POST /funding` and `GET /rate` use) — no longer the old 1.08
   placeholder; that constant was deleted, it's dead code now (nothing calls the
   old per-transfer Transak path anymore).
3. Check the sender's real balance (`debitBalanceIfSufficient`,
   `backend/src/lib/balances.ts`) — **debits atomically as part of the check**: a
   conditional `UPDATE ... WHERE usdc_balance >= amount` guards against a
   concurrent debit racing the balance negative between the read and the write
   (see that file's doc comment for the one race it does *not* cover, matching
   the same demo-scale rigor `creditBalance`'s read-then-upsert already had).
4. **Insufficient balance → `400`, no `transfers` row created at all:**
   ```json
   { "error": "Insufficient balance — add funds before sending", "code": "INSUFFICIENT_BALANCE", "required_usdc": 232.906416 }
   ```
   `code: "INSUFFICIENT_BALANCE"` is the machine-readable signal for the frontend
   to prompt Add Funds — a plain string match on `error` was never a stable
   contract, this is. `required_usdc` is the exact amount that would have been
   needed, at the real rate quoted for this attempt.
5. **Sufficient → instant send**, reusing the *exact* Solana
   send/confirm/retry/idempotency/failure-handling logic `POST /webhooks/onramp`
   already used — extracted verbatim into `settleTransfer()`
   (`backend/src/lib/settlement.ts`) so both callers share one implementation,
   not two forks of it. No Transak session, no async wait for a webhook — the
   full send-and-confirm sequence (real Solana broadcast, up to 3 retries, up to
   a 45s confirmation poll) runs **synchronously inside this request**, exactly
   as it always has inside `POST /webhooks/onramp` (that handler already blocked
   on the same sequence before responding to Transak — this isn't new latency
   behavior, just the same latency now also happening on this endpoint).
6. **On failure** (`settleTransfer`'s result has `status: "failed"` in its body):
   the debited amount is credited straight back to the sender
   (`creditBalance`) before responding — every `failed` outcome happens either
   before a successful broadcast or after the chain itself rejected the
   transaction, so no funds ever actually left Kobo's wallet either way, making
   the refund always correct. (A `sent`/timeout or `confirmed` result is never
   refunded — the send may still land, or already has.) **This refund logic
   wasn't explicitly spelled out in the task that created it, but follows
   directly from "a failure must be visible and reported, never silently
   swallowed" — a permanent debit with nothing to show for it on a failed send
   would itself be a silent loss, not just an unreported one.**

**Response — status code and body are now exactly whatever `settleTransfer`
produced** (same shape `GET /transfers/:id` already returns — no more `onramp`
field, ever):
- `200` — the `confirmed` transfer row (real `solana_tx_signature` set).
- `202` — the `sent` transfer row — confirmation timed out (not a failure, the tx
  may still land; check `explorer.solana.com/?cluster=devnet`).
- `422` — the `failed` transfer row — a non-retryable send error (bad recipient
  address, backend wallet's *on-chain* USDC insufficient — a distinct thing from
  the sender's *ledger* balance in `balances`, see the note under Data model).
- `502` — the `failed` transfer row — retries exhausted, or the confirmation poll
  itself errored.
- `400` — see step 4 above (insufficient ledger balance; also the pre-existing
  `sender_id`/`recipient_id`/`amount_eur` validation errors, unchanged).
- `500` — `{ "error": "<message>" }` — unexpected Supabase/infra error.

**Known integration gap, flagged, not fixed here (backend-only task):** the
frontend's `lib/kobo/api.ts` `createTransfer()` still types this response as
`CreateTransferResponse & { onramp: OnrampSession }` and
`components/kobo/kobo-app.tsx`'s `applySession()` unconditionally checks
`session.widgetUrl`, showing "Couldn't start checkout" and resetting to the form
if it's falsy — which it now always will be, since `onramp` is never returned
anymore. **The frontend has not been touched by this sync** (this was an
explicitly backend-only task); wiring it to the new instant/balance-checked
contract, plus a real Add Funds UI calling `POST /funding`, is real, necessary,
separately-scoped follow-up work — not guessed at or silently patched here.

## `GET /transfers/:id`

Unchanged. Poll this for live status.

**Response — `200`:**
```json
{
  "id": "uuid",
  "status": "pending",
  "solana_tx_signature": "string | null",
  "amount_eur": 250,
  "amount_usdc": 270,
  "failure_reason": "string | null",
  "retry_count": 0,
  "onramp_session_id": "string | null",
  "onramp_reference": "string | null",
  "created_at": "2026-08-25T12:00:00.000Z"
}
```
`400` → `{ "error": "id must be a valid UUID" }` if `:id` isn't a well-formed UUID.
`404` → `{ "error": "Transfer not found" }` if it's a well-formed UUID with no matching row.
For a transfer created via the new instant-send path, `onramp_session_id` and
`onramp_reference` are always `null` — nothing about that transfer ever touched
Transak.

## `POST /webhooks/onramp` — extended this sync to also handle funding

Transak → backend only. Not called by the frontend. Verifies a JWT-signed payload
(signed with the partner access token) **exactly as before, unchanged** — this
sync only extended what happens *after* verification, never touched
`verifyWebhook()` itself. Only runs a pipeline on a decoded
`eventID === "ORDER_COMPLETED"` — all other lifecycle events are ack'd `200` and
ignored, unchanged.

**Routing (new):** the payload's `webhookData.partnerOrderId` decides which
pipeline runs:
- Starts with `"fund_"` → **funding pipeline** (new): strip the prefix to get
  a `funding_requests.id`, credit the sender's balance. No Solana interaction at
  all — the real USDC already landed on-chain in Kobo's wallet via Transak's own
  settlement; this just updates Kobo's internal ledger to reflect whose portion
  of the pool it is.
- Anything else (or absent, falling back to matching `onramp_session_id` — tried
  against `funding_requests` first, then `transfers`, since a collision between
  the two tables' session ids is effectively impossible) → **transfer pipeline**
  (unchanged in mechanics, `settleTransfer()` now doing what used to be written
  inline in this file).

**Funding pipeline, in order:**
1. Look up the `funding_requests` row. `404` if no match.
2. `409` if `status !== "pending"` (already processed) — same idempotency
   guard-rail pattern `POST /webhooks/onramp`'s transfer path already used.
3. `422` if `amount_usdc` is unset.
4. **Claims the row first**, via a conditional update
   (`.eq("status", "pending")`) — this is deliberately different from the
   transfer path's idempotency approach (which relies on `solana_tx_signature`
   being a natural once-only marker). Crediting a balance has no equivalent
   natural idempotency key — doing it twice really does credit twice — so the
   row's own status transition is what a retried/duplicate webhook call gets
   blocked by. If the claim fails (0 rows matched — another call already
   claimed it), returns `409`.
5. Credits the sender's balance (`creditBalance`). If this fails after the claim
   already succeeded, the request is marked `failed` with the error as
   `failure_reason` rather than left stuck `confirmed` with nothing actually
   credited — same "visible and reported, never silently swallowed" principle
   the transfer pipeline's failure handling already followed.
6. Returns `200` with the updated `funding_requests` row.

**Transfer pipeline:** unchanged behavior, still drives
`pending → onramp_complete → sent → confirmed`, or `failed` with a
`failure_reason`, via `settleTransfer()`'s retried Solana sends (max 3 attempts,
exponential backoff) and bounded (45s) confirmation poll — the exact same code
now also used by `POST /transfers`' instant-send path. **This pipeline is
currently unreachable through any live code path** — `POST /transfers` no longer
ever creates a `transfers` row with a Transak session for this to later confirm
(see that section above). Left fully intact rather than deleted: it's still
correct, harmless, and would apply again if a `transfers` row from before this
sync were ever replayed, or if a future decision reintroduces some
Transak-backed transfer flow. Not a currently-exercised path, worth knowing that
if debugging.

## `GET /balances/:userId`

```json
{ "usdc_balance": 0, "updated_at": null }
```
Returns zeros if no row exists yet (never a 404). **Route itself is completely
unchanged this sync** — it was already generic (`select ... where user_id = :id`,
no role filtering ever existed in the query). What changed is what's actually in
the table: previously only ever written for a *recipient's* post-transfer credit,
so it always read `0`/`null` for a sender. Now `POST /funding`'s webhook-confirm
step (see above) also writes a sender's row, and `POST /transfers`' instant-send
path debits/credits/refunds it — so this now correctly returns real,
moving balances for senders too, not just recipients. **"Still open" #8 (below)
is resolved** by this — see that entry.

**Distinct from the backend wallet's real on-chain USDC balance.** `balances`
is Kobo's own ledger — who, among everyone with a `balances` row, owns what
share of the pool sitting in `backendWallet` (`lib/solana.ts`). A sender's ledger
balance can be `>` what's actually on-chain in the pool right now (e.g. if the
pool hasn't itself been topped up with enough real devnet USDC yet) — in that
case `POST /transfers`' instant-send still passes the *ledger* check (step 3
above) but the real Solana send then fails with `NonRetryableTransferError:
Insufficient backend wallet USDC balance...` (`sendUsdcTransfer`,
`lib/solana.ts`), landing as a `422` with `status: "failed"` — refunded per the
`POST /transfers` failure-handling above, so the sender's ledger is left
correct even though the *pool itself* was short. Verified live this sync: the
pool had ~21.6 real USDC on-chain; a real instant send well within that
succeeded end to end (real `solana_tx_signature`, `finalized` on-chain).

## `GET /rate`

Live fiat -> USDC market rate, proxied from Transak's public Get Price quote
(`docs.transak.com/api/public/get-price`) — no separate third-party rate API, since
Transak already prices this for real checkout sessions and only needs the plain
partner API key (already public — embedded in every widgetUrl), not the secret
partner access token `POST /transfers`/`POST /webhooks/onramp` use.

**Query param:** `fiatCurrency` — one of `EUR | GBP | USD` (defaults to `EUR` if
omitted). `cryptoCurrency` (`USDC`) and `network` (`solana`) are fixed server-side,
not exposed as params, since Kobo only ever quotes fiat -> USDC-on-Solana.

**Response — `200`:**
```json
{ "fiat_currency": "EUR", "crypto_currency": "USDC", "rate": 1.1673, "updated_at": "2026-08-26T12:31:57.234Z" }
```
`rate` is Transak's `marketConversionPrice` (the raw market rate) — not
`conversionPrice` (which bakes in fees for a specific quoted `fiatAmount`); a rate
ticker wants the former, not a transactional quote.

**Error responses:**
- `400` — `{ "error": "fiatCurrency must be one of: EUR, GBP, USD" }`
- `502` — `{ "error": "<Transak error message>" }` — Transak's quote API unreachable
  or errored.

**Reusability note (relevant to the recipient-balance EUR-equivalent feature scoped
in `KOBO_BUILD_PLAN.md`'s "Decided" section):** this is a general-purpose fiat<->USDC
rate source, not something built one-off for the header ticker. The recipient
balance display feature can call this same endpoint to convert a recipient's real
USDC balance into an EUR-equivalent, rather than needing its own rate source.

---

## Data model (Supabase / Postgres, via migrations in `backend/supabase/migrations/`)

```
users
  id              uuid PK
  name            text
  role            text  check in ('sender', 'recipient')
  country         text
  wallet_address  text  -- Solana base58 pubkey, e.g. via Keypair.publicKey.toBase58()
  created_at      timestamptz

transfers
  id                 uuid PK
  sender_id          uuid FK -> users.id
  recipient_id       uuid FK -> users.id
  amount_eur         numeric(18,2)
  amount_usdc        numeric(18,6) | null
  status             text  check in ('pending','onramp_complete','sent','confirmed','failed')
  onramp_reference   text | null
  solana_tx_signature text | null
  failure_reason     text | null       -- added Day 5-6
  retry_count        integer default 0 -- added Day 5-6
  onramp_session_id  text | null       -- added Day 7 (Transak integration)
  created_at         timestamptz

balances
  id            uuid PK
  user_id       uuid FK -> users.id, unique
  usdc_balance  numeric(18,6) default 0
  updated_at    timestamptz
  -- No schema change needed to generalize this beyond recipient-only — the FK
  -- and unique(user_id) already worked for any role. Only the application code
  -- previously only ever wrote a recipient's row; POST /funding's webhook-confirm
  -- and POST /transfers' instant-send now also read/write a sender's row here.

funding_requests   -- NEW this sync (20260826150000_add_funding_requests.sql)
  id                 uuid PK
  sender_id          uuid FK -> users.id
  amount_eur         numeric(18,2)
  amount_usdc        numeric(18,6) | null
  status             text  check in ('pending','confirmed','failed')
  onramp_session_id  text | null
  onramp_reference   text | null
  failure_reason     text | null
  created_at         timestamptz
  -- Deliberately its own table, not an overload of `transfers` (a funding
  -- request has no recipient_id and never triggers a Solana send from this
  -- backend — the real settlement is entirely Transak's, landing USDC directly
  -- in Kobo's pooled wallet; this table just tracks the session and, once
  -- POST /webhooks/onramp confirms it, credits `balances`).
```

**Status enums, confirmed exact:**
- `transfers.status`: `pending | onramp_complete | sent | confirmed | failed`
- `funding_requests.status`: `pending | confirmed | failed` (no `onramp_complete`/
  `sent` — there's no Solana send in this table's lifecycle at all, just a
  Transak session and a ledger credit on confirmation)

---

## Env vars

**Backend** (`backend/.env.example` — refreshed this sync, was stale):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=                   # optional, NEW this sync — direct postgres:// connection,
                                    # only needed to run scripts/run-migration.ts (the Supabase
                                    # CLI needs an authenticated login and/or local Docker,
                                    # neither reliably available in every environment)
BACKEND_WALLET_KEYPAIR_PATH=       # optional, defaults to backend/keys/backend-wallet.json
SOLANA_RPC_URL=                    # optional, defaults to public devnet
TRANSAK_API_KEY=
TRANSAK_API_SECRET=
TRANSAK_ENV=staging
TRANSAK_REFERRER_DOMAIN=           # http://localhost:3000 for dev — see Resolved #2
FRONTEND_ORIGIN=                   # optional, defaults to http://localhost:3000 — CORS origin
```

**Frontend** (`frontend/.env.example` — was silently gitignored and never actually
committed until Resolved #5; missing three vars added since, now current):
```
NEXT_PUBLIC_KOBO_API_URL=                          # unset => frontend runs entirely on its own mock layer
NEXT_PUBLIC_KOBO_SENDER_ID=                         # real users.id of the app's one demo sender
NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID=              # real users.id of the default/pre-selected recipient
NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_WALLET=          # that recipient's real wallet_address
```
All three `NEXT_PUBLIC_KOBO_*` id/wallet vars are ignored in mock mode and required
in real mode — see their own sections above/below for what each backs.

---

## Frontend's current implementation (as of this sync)

File refs are all under `frontend/`:

- `lib/kobo/api.ts`: `createTransfer()` posts `{ sender_id, recipient_id, amount_eur }`
  — matches the real backend. Gated by `isMockMode()`
  (`!process.env.NEXT_PUBLIC_KOBO_API_URL`); with that var unset (the current default),
  everything below is simulated client-side and no network call happens at all.
- With the var set, the response's `onramp` field is now parsed as exactly the real
  shape: `{ sessionId: string | null; widgetUrl: string }`, and the outer response's
  `id` field (not `transfer_id`) is what the frontend uses as the transfer id
  everywhere (Resolved #1) — `checkoutUrl`/`widgetConfig`/`transfer_id` are gone from
  the frontend entirely.
- `components/kobo/kobo-app.tsx` (`applySession`) now decides redirect-vs-embedded
  itself via `preferRedirectOnramp()` (`lib/kobo/onramp-transak.ts`): embeds
  `widgetUrl` in an iframe above a 768px viewport width, redirects
  (`window.location.href = widgetUrl`) below it. No client-side expiry check — the
  backend doesn't return one, so there's nothing to check against.
- `TransferStatus` type (`lib/kobo/types.ts`) is now
  `'pending' | 'onramp_complete' | 'sent' | 'confirmed' | 'failed'` (Resolved #7 —
  was "Still open" #5). `api.ts`'s `STATUS_LABEL` map for `"sent"` now correctly
  reads "Confirming on Solana" (Resolved #4 — was "Broadcasting on Base", an
  Ethereum L2, leftover copy from before the chain was decided), and `"failed"` reads
  "Transfer failed".
- **Completion signal is now the real one — postMessage is only a UI hint, never the
  status of record** (Resolved #6 — was "Still open" #1). `lib/kobo/onramp-transak.ts`
  + `components/kobo/onramp/embedded-widget-modal.tsx` still listen for
  `window.postMessage` events from the widget iframe (same `event_id` matching as
  before, still unverified against Transak's real docs for the redirect flow), but
  those events now only ever mean "the widget closed" or "the user finished
  checkout" — they no longer decide pending/confirmed/failed themselves. Once the
  widget signals it's done, `components/kobo/kobo-app.tsx` (`finishCheckout`) and
  `app/transfers/[id]/return/page.tsx` (the redirect-flow return handler) both call
  the new `pollTransferStatus()` (`lib/kobo/api.ts`), which repeatedly calls the real
  `GET /transfers/:id` and drives the UI off whatever `status` comes back, stopping
  once it's `confirmed` or `failed`. In mock mode (no `NEXT_PUBLIC_KOBO_API_URL`),
  `mockGetTransfer` simulates the same `pending → onramp_complete → sent →
  confirmed` progression over real elapsed time (400ms/stage) purely so the demo has
  something to poll — real mode ignores this entirely and only trusts the backend's
  response. On `status: "failed"`, the frontend shows `failure_reason` in
  `FailedDialog` (new optional `reason` prop) instead of a stuck spinner or a fake
  success.
- `components/kobo/add-recipient-dialog.tsx`: "Add new recipient" now calls the real
  `POST /users` (via `createUser()` in `lib/kobo/api.ts`, mock-mode-gated same as
  `createTransfer`) instead of just invoking a local callback. It sends
  `{ name, role: "recipient", country, wallet_address }`, mapped from the form's
  existing `name` and wallet/phone fields — `wallet_address` is the wallet field
  trimmed, and `country` is hardcoded to `"NG"` (see "Resolved this sync" below; no
  country input exists in this form, and none was added). Before submitting, the
  wallet field is checked client-side with `isPlausibleSolanaAddress()`
  (`lib/kobo/solana.ts`, a dependency-free base58-decode-to-32-bytes check mirroring
  the backend's `new PublicKey(...)`); a failing check shows through the dialog's
  existing inline field-error UI, not a toast. The wallet input's placeholder
  (`"0x… or +234…"`) is unchanged — still misleading now that the check requires a
  Solana address — see "Still open" #3, left open on purpose (copy changes were out
  of scope for this pass). On success, `onAdd()` now receives the real created row
  (real `uuid`, `CreateUserResponse` in `lib/kobo/types.ts`) and
  `kobo-app.tsx`'s `handleAddRecipient` builds the `Recipient` from that instead of
  fabricating an id — same `Recipient` shape as before. A `POST /users` failure
  (network error or an unexpected `4xx`/`5xx`) shows
  `toast.error("Couldn't add recipient — please try again.")`, matching the generic
  toast style already used for `POST /transfers` failures.
- Mock recipients (`lib/kobo/mock-data.ts`) — **`RECIPIENTS[0]` ("Adaeze Okonkwo",
  the default/pre-selected recipient) is the one exception, now real** (real `uuid`
  and real Solana `wallet_address`, via `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID`/
  `_WALLET` — see "Resolved this sync" #11 below); this was a real bug, not a mock
  gap, since it's the recipient any fresh page load sends to by default. The other
  three (`rcp_chidi`, `rcp_ngozi`, `rcp_emeka`) are still fake — Ethereum-style
  wallet strings like `0x1b8e…9F02` (pre-truncated for display, not full addresses)
  and non-`uuid` ids that wouldn't resolve against `users`. They're only reachable
  by explicitly selecting them via the picker, not on a fresh default send — lower
  priority, not fixed here. (Recipient wiring is otherwise per-recipient — ones
  added through the dialog are real; the three still-mock pre-seeded ones are
  untouched.)
- `CURRENT_USER` (`lib/kobo/mock-data.ts`) — the app's one demo sender, there being
  no auth/login yet (see `KOBO_BUILD_PLAN.md` ground rules) — now carries a real
  `users.id`. A real `role: "sender"` row (`{ name: "Tomiwa M.", country: "IE" }`,
  matching this constant's existing display values) was created once via the same
  request shape as `createUser()`, and its real `uuid` is read from a new
  `NEXT_PUBLIC_KOBO_SENDER_ID` env var (`.env.example`), falling back to the old
  fake `"usr_tomiwa"` string in mock mode where nothing validates it server-side.
  Only `CURRENT_USER.id` changed — `name`/`initials`/`iban` are unchanged display
  fixtures (`iban` has no backend column at all) and were left alone on purpose, no
  visual change. The only place `.id` was read, `kobo-app.tsx`'s
  `sender_id: CURRENT_USER.id` in `POST /transfers`, now sends the real uuid.
  Verified live: a real `POST /transfers` succeeds end to end using this real
  sender id against a real recipient id. No new UI — there's still no "who is
  signed in" step in the app; this is a single hardcoded demo identity, same as
  before, just backed by a real row now instead of a fake one.
- Sidebar shows a per-currency EUR/GBP/USD fiat balance from local mock data
  (`BALANCES` in `mock-data.ts`) — unrelated to `GET /balances/:userId` (see "Still
  open" #8).
- Frontend dev server: `next dev`, confirmed running on `http://localhost:3000`.

---

## Resolved this sync

1. **Onramp session shape — frontend decides redirect vs. embedded, backend keeps
   one shape.** Decided: the backend keeps returning exactly `{ sessionId, widgetUrl }`
   — no two-shape split. Transak's widget URL can be *either* opened in an iframe
   *or* used as a full-page redirect; that choice is entirely a frontend rendering
   decision, not something the backend needs to encode twice. Frontend now consumes
   `{ sessionId, widgetUrl }` directly and picks redirect-vs-embedded itself
   (viewport-width heuristic). **Fully closed out**: the outer response's `id` field
   (frontend previously read a nonexistent `transfer_id`) is also fixed now, so both
   halves of the shape mismatch are gone — `lib/kobo/api.ts`, `lib/kobo/types.ts`,
   `components/kobo/kobo-app.tsx` (`restructure-frontend-folder` @ `bef70f3` +
   this sync's changes).

2. **`TRANSAK_REFERRER_DOMAIN`.** Decided: `http://localhost:3000` for local dev
   (Next.js default `next dev` port, confirmed against the actual running dev
   server, not assumed). Update this to the real staging/Vercel domain once one
   exists — whoever sets that up should update `TRANSAK_REFERRER_DOMAIN` and this
   line together.

3. **`POST /users` — backend half done.** Decided: user registration is backend
   scope (writes to `users`, which backend owns the schema for). Isaac built
   `POST /users` — see the section above for the real shape. The frontend side
   (wiring "Add new recipient" up to it, and validating real Solana addresses
   client-side) is still open — see "Still open" #2 and #3.

4. **Frontend status label said "Broadcasting on Base."** Was leftover copy from
   before the chain was decided — Base is an Ethereum L2, the actual chain end to
   end is Solana devnet. Fixed to "Confirming on Solana" (`lib/kobo/api.ts`'s
   `STATUS_LABEL` map, plus the matching "USDC on Solana" copy in
   `transfer-summary-panel.tsx`).

5. **`frontend/.env.example` was silently gitignored.** The `.env*` pattern in
   `frontend/.gitignore` caught `.env.example` too, so it never actually made it
   into the repo despite the code depending on `NEXT_PUBLIC_KOBO_API_URL` and the
   README referencing it. Fixed: `.gitignore` now explicitly un-ignores it, and it's
   committed.

6. **Frontend's "transfer completed" signal is now the backend's real one.** Was
   "Still open" #1. The frontend no longer treats a `window.postMessage` event from
   the Transak widget as completion — it treats it only as "the widget closed / the
   user finished checkout." Once that fires, the frontend now calls the real
   `GET /transfers/:id` (`getTransfer` / `pollTransferStatus` in `lib/kobo/api.ts`)
   on a poll loop and drives every status label off the actual `status` field the
   backend returns, stopping at `confirmed` or `failed`. Wired into both
   `components/kobo/kobo-app.tsx` (`finishCheckout`, embedded/mock path) and
   `app/transfers/[id]/return/page.tsx` (the redirect-flow return page). The
   frontend's `event_id` matching for the postMessage payload itself is still
   unverified against Transak's real docs — that part is unchanged and low-stakes
   now, since it's UI-only and no longer decides money-moving state.

7. **No `TransferStatus.failed` on the frontend.** Was "Still open" #5. Added
   `'failed'` to `TransferStatus` (`lib/kobo/types.ts`), a "Transfer failed"
   `STATUS_LABEL` entry, and a failed-state UI: `FailedDialog` now takes an optional
   `reason` prop and shows the backend's `failure_reason` text in its details box
   (reassurance copy — "no funds were moved" — kept unconditionally alongside it).
   Wired from both the polling paths in Resolved #6 above.

8. **Frontend wired to `POST /users`.** Was "Still open" #2. `add-recipient-dialog.tsx`
   now calls the real endpoint through a new `createUser()` in `lib/kobo/api.ts`
   (mock-gated the same way `createTransfer` is), instead of only invoking a local
   callback. Client-side wallet validation was added (`lib/kobo/solana.ts`,
   `isPlausibleSolanaAddress()`) to match the backend's format check ahead of
   submitting, closing "Still open" #3's validation gap for this form specifically
   (the placeholder copy and the pre-existing mock recipients' Ethereum-style
   addresses are unchanged — see "Still open" #3 below, left open on purpose).
   `role` is sent as `"recipient"` (this dialog only ever creates recipients).
   **`country` decision:** the form has no country input and none was added (out of
   scope — no UI changes were wanted here); `country` is hardcoded to `"NG"` for
   every recipient created through this dialog. This is a deliberate product-scope
   call, not a placeholder guess: Kobo's Phase 1 is specifically the Ireland-to-Nigeria
   corridor, so every recipient added here is in Nigeria by scope. Revisit if/when
   Kobo supports more than one recipient country. On success the dialog now passes the
   real created row (real `uuid`) up to `kobo-app.tsx`, which uses it as the recipient
   going forward instead of a locally fabricated id.

9. **Sender identity wired to a real `users` row.** Was `KOBO_BUILD_PLAN.md`'s
   "Still mock" #1, same pattern as #8 above. `CURRENT_USER` (`lib/kobo/mock-data.ts`)
   is still a single hardcoded demo identity — there's no auth/login step, and none
   was added (out of scope; see `KOBO_BUILD_PLAN.md` ground rules) — but its `.id` is
   now a real `role: "sender"` `users.id`, created once via the same request shape
   as `createUser()` (`{ name: "Tomiwa M.", role: "sender", country: "IE",
   wallet_address: <real Solana pubkey> }`, matching the constant's existing display
   name) and read from a new `NEXT_PUBLIC_KOBO_SENDER_ID` env var, falling back to
   the old fake id in mock mode. `name`/`initials`/`iban` are unchanged (`iban` has
   no backend column at all) — no visual change, only the `.id` used in
   `kobo-app.tsx`'s `sender_id: CURRENT_USER.id` (the only place `.id` was read) is
   now real. Verified live: `POST /transfers` succeeds using this real sender id
   against a real recipient id. Balance display (sidebar) is still mock — separate,
   not touched by this — see "Still open" #8 below.

10. **Header rate ticker wired to a real live rate.** Investigated first, per
    instruction, before touching anything: `randomRate()` (`lib/kobo/mock-data.ts`)
    was confirmed fully mock — `BASE_USDC_RATE[currency] + Math.random() * 0.02` —
    driving the header's "1 EUR = X USDC" ticker and, via the same shared `rate`
    state in `kobo-app.tsx`, the transfer summary panel and success dialog too.
    Checked whether Transak (already integrated) exposes a rate before reaching for
    a separate rate API, per instruction — it does: Transak's public Get Price
    quote endpoint, no separate API needed. Added `getMarketRate()`
    (`backend/src/lib/transak.ts`) and a new `GET /rate` (`backend/src/routes/rate.ts`,
    see that section above) proxying it, and a matching `getRate()`
    (`frontend/lib/kobo/api.ts`, mock-gated the same way every other real call is —
    mock mode still calls `randomRate()`, unchanged). `kobo-app.tsx` reuses its
    existing 30s "Locks in Ns" countdown as the refresh cadence (already within the
    requested 30-60s range) instead of adding a new timer, calling the real
    `getRate()` at each reset instead of `Math.random()`, plus one fetch on mount so
    the ticker doesn't sit on its initial random seed for a full 30s. On a failed
    fetch (network error, Transak's quote API down), the last known-good rate is
    kept silently — no error UI added, since none exists today and the constraint
    was no visual changes; verified live by aborting the `/rate` request mid-session
    and confirming the ticker held its last value with no blank/broken layout. Zero
    visual/layout changes — verified live in the browser (same ticker position,
    same styling, values matched the real `GET /rate` response exactly, including
    after a currency switch, which now also triggers a real re-fetch for the new
    currency). See "Still open" #9 above for the one related gap this did **not**
    touch: `POST /transfers`' own `amount_usdc` still uses a separate hardcoded
    placeholder rate server-side.

11. **Default/pre-selected recipient wired to a real `users` row — real bug, not
    an edge case.** On every fresh page load (no prior "add recipient" action),
    `RECIPIENTS[0]` (`lib/kobo/mock-data.ts`, "Adaeze Okonkwo") was a fabricated
    id/wallet, same as the old sender/other-recipients pattern — meaning the very
    first send a real user would try, using only the app's default state, 400'd at
    `POST /transfers` (`recipient_id` not found). Same pattern as every other
    real-data fix today: created one real `role: "recipient"` row via `POST /users`
    (`{ name: "Adaeze Okonkwo", country: "NG", wallet_address: <real Solana pubkey>
    }`, matching the fixture's existing display values), and wired `RECIPIENTS[0]`'s
    `id`/`wallet` to it via two new env vars, `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID`
    / `_WALLET` (`.env.example`), falling back to the old fake id/wallet in mock
    mode — same pattern as `NEXT_PUBLIC_KOBO_SENDER_ID`. `name`/`initials`/`meta`/
    `lastSent` are unchanged display fixtures.
    **Flagged before changing, per instruction — not guessed at:** the old wallet
    display text (`"0x7a3f…C41d"`) is a manually-truncated fake Ethereum-style
    string with no real relationship to any Solana address (Solana pubkeys are
    base58, never `0x`-prefixed), so it genuinely could not be preserved verbatim
    for a real wallet. Decided: show the full real address, matching how every
    other real recipient (added via the dialog) already displays — no new
    formatting convention invented.
    **Bug found and fixed as a direct consequence:** `recipient-picker.tsx`'s
    collapsed-header wallet span (`<span className="hidden font-mono ... sm:inline">`)
    had no `truncate`/width constraint at all — every *other* wallet display in the
    app (`recipients-screen.tsx`, `success-dialog.tsx`) already had `truncate`.
    This was a latent, pre-existing gap for any real recipient (the full-length
    real addresses added via the dialog were already silently exposed to it), not
    something newly introduced here — just newly hit by making the *default*
    recipient real, so it's now the common case instead of a rare one. Fixed by
    adding `max-w-[140px] truncate` to that span.
    Also updated `TRANSFER_HISTORY[0].recipientId` (`lib/kobo/mock-data.ts`) to the
    same real id — it was hardcoded to the old fake `"rcp_adaeze"` string, and
    `components/kobo/recent-transfers.tsx` silently drops any history row whose
    `recipientId` doesn't resolve against the current `recipients` list
    (`if (!recipient) return null`) — leaving it unfixed would have made the
    "Adaeze Okonkwo · Sent €200 on 12 Aug" row silently vanish from Recent
    Transfers the moment the default recipient's id changed.
    Verified live: fresh browser context (no prior localStorage/session state),
    confirmed a real transfer using **only** default page-load state —
    `POST /transfers` → `201`, both `sender_id` and `recipient_id` real uuids.

12. **Real sender balance funding + instant send — SUPERSEDES the "sidebar stays
    on mock data" decision from earlier today.** Full detail is under the new
    `POST /funding` and rewritten `POST /transfers`/`POST /webhooks/onramp`
    sections above — this entry is the summary/index. New: `POST /funding`
    (real Transak session, lands USDC in Kobo's pooled `backendWallet`, credits
    the sender's real `balances` row on webhook confirmation — new
    `funding_requests` table). Changed: `POST /transfers` no longer creates a
    Transak session at all — it's balance-checked first
    (`debitBalanceIfSufficient`), `400`s with `code: "INSUFFICIENT_BALANCE"` if
    short, otherwise sends **instantly** by reusing the exact
    retry/idempotency/confirmation/failure-handling Solana logic
    `POST /webhooks/onramp` already had — extracted verbatim into
    `settleTransfer()` (`backend/src/lib/settlement.ts`), not forked, so both
    callers share one implementation. A failed instant send refunds the
    sender's ledger balance (not explicitly asked for, but a direct consequence
    of "failure must be visible and reported, never silently swallowed" — an
    un-refunded debit on a failed send is a silent loss, not just an unreported
    one). `GET /balances/:userId` needed zero code changes to start returning
    real sender data — it was already role-agnostic; only the write side was
    recipient-only before. **Resolves "Still open" #8 below** (sender balance
    now has a real backend concept) and **partially resolves #9** (the *new*
    `POST /funding`/instant-send code paths use the real rate; the *old*
    per-transfer placeholder-rate concern in #9 is moot now, since that code
    path itself is gone — see #9's own update below for what's still actually
    open there).
    **Environment note:** `SUPABASE_DB_URL` (new, `.env.example`) and
    `backend/scripts/run-migration.ts` (new) exist because this environment
    had no way to run `supabase db push` (no CLI login, no local Docker) —
    applies a single `.sql` file directly via a Postgres connection string,
    used once to apply `supabase/migrations/20260826150000_add_funding_requests.sql`.
    Verified live, in order: funded a real sender via a real Transak session
    (confirmed through `backend/scripts/selftest-webhook-e2e.ts` — its own
    isolated process avoids the Transak-access-token-invalidation collision a
    hand-rolled version hit in an earlier sync), confirmed the real balance
    increased (`0` → `116.428667`); sent instantly to a real recipient with
    sufficient funds — real `solana_tx_signature`, confirmed `finalized`
    on-chain, both balances moved by the exact expected amount; attempted a
    send exceeding balance — clean `400`, `code: "INSUFFICIENT_BALANCE"`,
    balance provably untouched. Also regression-checked existing validation
    (bad recipient, negative amount, bad sender on `POST /funding`) — all still
    behave correctly, none of it silently broken by the rewrite.
    **Not done, flagged above, real follow-up work:** the frontend has not
    been touched — `createTransfer()`'s response typing and
    `kobo-app.tsx`'s `applySession()` still assume the old
    always-returns-`onramp` contract, which is no longer true. See the
    "Known integration gap" note under `POST /transfers` above.

## Still open

These still need a decision — nothing below has been silently resolved or guessed at.

1. **RESOLVED — see "Resolved this sync" #6.** ~~Frontend's "transfer completed"
   signal is disconnected from the backend's real one.~~ The frontend now polls the
   real `GET /transfers/:id` for status and treats postMessage as nothing more than
   "the widget closed," exactly as this item asked. Left in place (not deleted) for
   history — the previous open question is quoted below.
   > The backend only ever advances a transfer (and only ever triggers the real
   > Solana send) off its own signed `ORDER_COMPLETED` webhook from Transak
   > (`POST /webhooks/onramp`, JWT-verified). The frontend's embedded-widget path
   > instead listens for `window.postMessage` events from the widget iframe
   > (`TRANSAK_ORDER_SUCCESSFUL` etc., `lib/kobo/onramp-transak.ts`) and treats
   > *that* as completion, independently faking the rest of the status sequence on
   > a client-side timer — it never asks the backend whether anything actually
   > happened, and never calls `GET /transfers/:id` (which exists and works for
   > this).

2. **RESOLVED — see "Resolved this sync" #8.** ~~Frontend isn't wired to
   `POST /users` yet.~~ "Add new recipient" now calls the real endpoint, validates
   the wallet client-side, handles its `400`s/network errors via the app's existing
   toast pattern, and uses the returned `id` as the real `recipient_id` going
   forward. Left in place (not deleted) for history — the previous open question is
   quoted below.
   > "Add new recipient" is still entirely client-side fabrication (a local
   > callback, no request sent anywhere), even though the endpoint now exists (see
   > Resolved #3). Needs frontend work: call it, handle its `400`s, and use the
   > returned `id` as the real `recipient_id`.

3. **Wallet address format mismatch — mostly addressed.** Backend requires Solana
   base58 pubkeys (`wallet_address`, validated via `new PublicKey(...)` on both
   `POST /users` and at send time). The "Add new recipient" form's own submission
   is validated client-side to match (see "Resolved this sync" #8). The form's
   wallet input **placeholder** copy was since corrected to `"e.g. 7xKX...gAsU"`
   (Solana-only, no more `"0x… or +234…"` — landed outside this doc's own
   "Resolved this sync" log, by a separate commit). `RECIPIENTS[0]` ("Adaeze
   Okonkwo", the default recipient) is now real too — see "Resolved this sync"
   #11. **Still open:** the other three pre-seeded **mock recipients**
   (`lib/kobo/mock-data.ts` — `rcp_chidi`/`Chidi Balogun`, `rcp_ngozi`/`Ngozi Eze`,
   `rcp_emeka`/`Emeka Nwachukwu`, wallets like `0x1b8e…9F02`) are still
   Ethereum-style, pre-truncated display strings with fake ids, never routed
   through `POST /users` — selecting any of them for a send still 400s at
   `POST /transfers`, same failure mode `RECIPIENTS[0]` had before this sync, just
   reachable only via an explicit picker selection now instead of the default
   state. Needs a decision on whether to fix all three the same way, or something
   else (they're seldom-selected demo flavor, not the default path).

4. **`onramp_reference` timing mismatch — still open, symptom worked around.**
   Frontend treats `onramp_reference` as available immediately after
   `POST /transfers` and displays it right away (in the passcode dialog, the
   "preparing checkout" step, etc). The real backend leaves it `null` until
   Transak's `ORDER_COMPLETED` webhook fires — which may be minutes after checkout
   starts. As of this sync the frontend falls back to the transfer's real `id`
   whenever `onramp_reference` is `null` (`const ref = res.onramp_reference ||
   res.id` in `kobo-app.tsx`), so the UI never shows a blank reference — but the
   underlying question (should the backend generate a reference immediately instead
   of waiting on the webhook? is `id` good enough to show users permanently?) is
   still undecided.

5. **RESOLVED — see "Resolved this sync" #7.** ~~No `TransferStatus.failed` on the
   frontend.~~ Added, with a full failed-state UI. Left in place (not deleted) for
   history — the previous open question is quoted below.
   > The backend has a real `failed` terminal status with a `failure_reason`. The
   > frontend's type and its `STATUS_LABEL` map don't account for it at all. If/when
   > polling is wired up (#1), a `status: "failed"` from the backend has nowhere
   > defined to go on the frontend today.

6. **No auth on any backend route.** Every endpoint is fully open right now —
   `sender_id` is just whatever the client sends. Not necessarily wrong for this
   stage, but worth a conscious decision on when auth gets added rather than
   building further on top of an implicit "trust the client" model.

7. **No CORS middleware on the backend.** Calling any of these endpoints from a
   browser at the frontend's origin will currently be blocked. Needs to be added
   (and now can target the frontend's real origin — confirmed as
   `http://localhost:3000` for dev, see Resolved #2).

8. **RESOLVED — see "Resolved this sync" #12.** ~~No fiat/EUR balance source
   exists on the backend.~~ Sender-side balance now has a real backend concept —
   `POST /funding` + the balance-checked instant-send path in `POST /transfers`.
   Left in place (not deleted) for history — the previous open question (and the
   investigation that superseded it earlier the same day) is quoted below.
   > **No fiat/EUR balance source exists on the backend — confirmed, sidebar
   > wiring attempted and deliberately not done.** The only balance endpoint
   > (`GET /balances/:userId`) is a recipient's post-transfer USDC balance, not a
   > sender's spendable EUR balance. The frontend's sidebar "EUR/GBP/USD balance"
   > is pure mock data with nothing to back it once real accounts exist. Not
   > clear whether fiat balance tracking is even in scope for the backend —
   > needs a decision on whether/where that gets built.
   >
   > **Investigated this sync, while attempting to wire the sidebar to
   > `GET /balances/:userId` using `CURRENT_USER.id`** (the real sender uuid from
   > the previous sync). Confirmed against `backend/src/routes/webhooks.ts`
   > (lines ~203-221) and the live `balances` table: a row is written only for
   > `transfer.recipient_id`, never `sender_id` — a sender never accumulates a
   > `balances` row under the current data model. [...] **Decision: sidebar left
   > on mock data for now**, pending a real product decision on what "sender
   > balance" should even mean here [...]
   The product decision landed later the same day —
   `KOBO_BUILD_PLAN.md`'s "Sender-side balance — SUPERSEDED" — and this sync
   built it. The sidebar display itself is still a separate, not-yet-done
   frontend task (see "Resolved this sync" #12's "Known integration gap" note).

9. **RESOLVED for `POST /transfers` and `POST /funding` — see "Resolved this
   sync" #10 and #12.** ~~`amount_usdc` computed with a placeholder rate (1.08),
   server-side.~~ Both the frontend (header ticker etc., #10) and now the backend
   (`POST /transfers`, `POST /funding`, both via `getMarketRate()`, #12) quote
   off the same real live rate — the old hardcoded `PLACEHOLDER_EUR_TO_USDC_RATE`
   constant in `transfers.ts` is deleted, not just unused. Left in place for
   history — the previous open question is quoted below.
   > **`amount_usdc` is computed with a placeholder rate (1.08), server-side**,
   > explicitly flagged in the code as temporary. The frontend independently
   > shows its own live-ish random-jittered rate client-side for the "you send"
   > quote. These two numbers will not match today. Whoever owns the real
   > quoted-rate source (Transak's actual quote? a rates API?) needs to be
   > decided — right now neither side has a real one.

10. **RESOLVED.** ~~`frontend/` isn't on `main` yet.~~ `restructure-frontend-folder`
    and `main` have been merged both directions — the monorepo layout (`backend/` +
    `frontend/` both under `main`) is complete. See the header above.

11. **Frontend not wired to real sender balance funding + instant send.** The
    backend half landed this sync (`POST /funding`, rewritten `POST /transfers`,
    extended `POST /webhooks/onramp` — see "Resolved this sync" #12) and was
    explicitly scoped as backend-only; the frontend was deliberately not
    touched. Concretely still needed:
    - An Add Funds flow calling `POST /funding`, rendering the returned
      `onramp.widgetUrl` the same way checkout already does today (the widget
      mechanics are identical — same `createWidgetSession` shape — so this
      should be able to reuse the existing embedded/redirect widget components
      as-is, just pointed at a different endpoint/session).
    - `lib/kobo/api.ts`'s `createTransfer()` and its `CreateTransferResponse`
      type need to drop the now-always-absent `onramp` field, and
      `components/kobo/kobo-app.tsx`'s `applySession()`/`startOnramp()` need to
      stop assuming `POST /transfers` always returns a widget session to open —
      it now sometimes settles instantly (`200`/`202`) and sometimes 400s with
      `code: "INSUFFICIENT_BALANCE"`, needing a real "prompt Add Funds" UI path
      that doesn't exist yet.
    - Sidebar balance display ("Still open" #8, resolved on the backend side)
      still needs its actual frontend wiring decided/built — this is the
      dependency that was missing when that item was investigated and
      deliberately left on mock data.
