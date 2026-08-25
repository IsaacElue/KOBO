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

## `POST /transfers`

Creates a transfer row and a Transak widget session for it in one call.

**Request body** (backend/src/routes/transfers.ts):
```json
{
  "sender_id": "uuid",
  "recipient_id": "uuid",
  "amount_eur": 250
}
```
- All three fields required; `amount_eur` must be a JS `number` (not a numeric string).
- `sender_id` / `recipient_id` must be existing `uuid` rows in `users` — see Data
  model below. Only `recipient_id` is actually looked up server-side; an invalid
  `sender_id` will fail at the DB foreign-key constraint on insert.

**Success response — `201`:**
```json
{
  "id": "uuid",
  "sender_id": "uuid",
  "recipient_id": "uuid",
  "amount_eur": 250,
  "amount_usdc": 270,
  "status": "pending",
  "onramp_reference": null,
  "solana_tx_signature": null,
  "failure_reason": null,
  "retry_count": 0,
  "onramp_session_id": "string | null",
  "created_at": "2026-08-25T12:00:00.000Z",
  "onramp": {
    "sessionId": "string | null",
    "widgetUrl": "https://global-stg.transak.com/...(single-use, valid 5 min)"
  }
}
```
- The whole `transfers` row is spread into the response (real column names above),
  plus a nested `onramp` object with exactly two fields: `sessionId`, `widgetUrl`.
- `amount_usdc` is computed server-side using a **placeholder rate (1.08)** —
  explicitly marked in the code as temporary, to be replaced by a real quoted rate
  from the on-ramp integration.
- `onramp_reference` is **`null` at creation time.** It is only populated later, by
  the `/webhooks/onramp` handler, once Transak's `ORDER_COMPLETED` webhook fires
  (backend sets it to Transak's own webhook order id).

**Error responses:**
- `400` — `{ "error": "sender_id, recipient_id, and numeric amount_eur are required" }`
- `404` — `{ "error": "Recipient not found" }`
- `502` — `{ "error": "Failed to create Transak widget session: <message>" }` — the
  transfer row is deleted server-side before this is returned (no orphaned rows).
- `500` — `{ "error": "<supabase error message>" }`

## `GET /transfers/:id`

Poll this for live status. **Now called by the frontend** — see Resolved #6 below.

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
`404` → `{ "error": "Transfer not found" }`.

## `POST /webhooks/onramp`

Transak → backend only. Not called by the frontend. Verifies a JWT-signed payload
(signed with the partner access token), and only runs the transfer pipeline on a
decoded `eventID === "ORDER_COMPLETED"` — all other lifecycle events are ack'd `200`
and ignored. Drives `pending → onramp_complete → sent → confirmed`, or `failed` with
a `failure_reason`, via retried Solana sends (max 3 attempts, exponential backoff)
and a bounded (45s) confirmation poll. Full detail in `backend/src/routes/webhooks.ts`
— documented here for context since it's the actual source of truth for status
transitions the frontend needs to poll for.

## `GET /balances/:userId`

```json
{ "usdc_balance": 0, "updated_at": null }
```
Returns zeros if no row exists yet (never a 404). **This is a recipient's on-chain
USDC balance**, written only after a transfer confirms — not a sender's fiat balance.
See "Still open" #8 below.

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
```

**Status enum, confirmed exact:** `pending | onramp_complete | sent | confirmed | failed`

---

## Env vars

**Backend** (`backend/.env.example`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BACKEND_WALLET_KEYPAIR_PATH=       # optional, defaults to backend/keys/backend-wallet.json
SOLANA_RPC_URL=                    # optional, defaults to public devnet
TRANSAK_API_KEY=
TRANSAK_API_SECRET=
TRANSAK_ENV=staging
TRANSAK_REFERRER_DOMAIN=           # http://localhost:3000 for dev — see Resolved #2
```

**Frontend** (`frontend/.env.example` — was silently gitignored and never actually
committed until this sync, see Resolved #5):
```
NEXT_PUBLIC_KOBO_API_URL=          # unset => frontend runs entirely on its own mock layer
```

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
- `components/kobo/add-recipient-dialog.tsx`: "Add new recipient" is entirely
  client-side (`onAdd(input)` is a local callback) — no request is sent anywhere. The
  wallet input placeholder is `"0x… or +234…"` and the only validation is
  non-empty-string; a Solana address would currently be accepted or rejected on
  exactly the same basis as anything else typed in.
- Mock recipients (`lib/kobo/mock-data.ts`) use wallet strings like `0x7a3f…C41d`
  (Ethereum-style, and pre-truncated for display — not full addresses) and ids like
  `rcp_adaeze`. Mock sender is `{ id: "usr_tomiwa", ... }`. None of these ids are
  real-backend `uuid`s, so none of them would resolve against `users` even after
  `POST /users` is wired up — they're display fixtures, not seed data.
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

2. **Frontend isn't wired to `POST /users` yet.** "Add new recipient" is still
   entirely client-side fabrication (a local callback, no request sent anywhere),
   even though the endpoint now exists (see Resolved #3). Needs frontend work: call
   it, handle its `400`s, and use the returned `id` as the real `recipient_id`.

3. **Wallet address format mismatch.** Backend requires Solana base58 pubkeys
   (`wallet_address`, validated via `new PublicKey(...)` on both `POST /users` and
   at send time). Frontend's mock/demo wallet addresses (`0x7a3f…C41d` etc., also
   pre-truncated for display — not full addresses) and its "Add new recipient" form
   (placeholder `"0x… or +234…"`, validated only as non-empty) use Ethereum-style
   hex strings with no format validation. These will fail `POST /users`' `400`
   check. Directly relevant to #2 above — worth doing together.

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

8. **No fiat/EUR balance source exists on the backend.** The only balance endpoint
   (`GET /balances/:userId`) is a recipient's post-transfer USDC balance, not a
   sender's spendable EUR balance. The frontend's sidebar "EUR/GBP/USD balance" is
   pure mock data with nothing to back it once real accounts exist. Not clear
   whether fiat balance tracking is even in scope for the backend — needs a
   decision on whether/where that gets built.

9. **`amount_usdc` is computed with a placeholder rate (1.08), server-side**,
   explicitly flagged in the code as temporary. The frontend independently shows
   its own live-ish random-jittered rate client-side for the "you send" quote.
   These two numbers will not match today. Whoever owns the real quoted-rate
   source (Transak's actual quote? a rates API?) needs to be decided — right now
   neither side has a real one.

10. **RESOLVED.** ~~`frontend/` isn't on `main` yet.~~ `restructure-frontend-folder`
    and `main` have been merged both directions — the monorepo layout (`backend/` +
    `frontend/` both under `main`) is complete. See the header above.
