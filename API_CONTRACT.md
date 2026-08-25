# Kobo API Contract

Shared source of truth between `backend/` (Person B / Isaac — Express + Supabase +
Solana devnet + Transak) and `frontend/` (Person A / Shina — Next.js). Describes what
is **actually implemented** on each side as of this sync, not what was planned.

Update this file in place when either side's contract changes — don't append a new
dated section, overwrite the stale one.

**Backend read at:** `main` @ `7ff963f` ("backend: Day 0-7 build, Supabase schema,
transfer pipeline, Solana devnet integration, Transak on-ramp")
**Frontend read at:** uncommitted work on `restructure-frontend-folder`, not yet on
`main` (see note in Open Questions — `frontend/` isn't merged into `main` yet at all)

---

## Base URL & health

- Backend: Express app, `app.listen(process.env.PORT || 4000)`.
- `GET /health` → `{ "status": "ok" }`. No auth.
- **No CORS middleware is set up in `backend/src/index.ts`** and **no auth/session
  middleware exists on any route** — every endpoint below is currently open and will
  hit CORS errors if called from the frontend's origin in the browser. See Open
  Questions.

---

## `POST /users`

Creates a user (sender or recipient). Resolves mismatch #5 below — this now exists.

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
same open-endpoint caveat as everything else (see mismatch #10).

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

Poll this for live status. **Not currently called by the frontend anywhere** — see
Open Questions.

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
See Open Questions.

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
TRANSAK_REFERRER_DOMAIN=           # defaults to placeholder "kobo.app" — see Open Questions
```

**Frontend** (`frontend/.env.example`):
```
NEXT_PUBLIC_KOBO_API_URL=          # unset => frontend runs entirely on its own mock layer
```

---

## Frontend's current implementation (as of this sync)

The frontend (`frontend/lib/kobo/*`) was built against an assumed contract before this
backend existed, and has **not yet been updated to match it.** For accuracy, here's
what it actually does today:

- `createTransfer()` posts `{ sender_id, recipient_id, amount_eur }` — request shape
  matches the real backend.
- It expects the response to be:
  ```ts
  { transfer_id: string; status: TransferStatus; onramp_reference: string } & {
    onramp: {
      transferId: string;
      provider: 'transak';
      checkoutUrl?: string;        // redirect path
      widgetConfig?: Record<string, unknown>;  // embedded path, reads .embedUrl
      expiresAt?: string;
    }
  }
  ```
- `TransferStatus` type on the frontend is `'pending' | 'onramp_complete' | 'sent' | 'confirmed'`
  — **no `'failed'` value.**
- After the on-ramp step "succeeds" (currently driven by a client-side postMessage
  event from the embedded widget iframe, not by polling the backend), the frontend
  fakes `pending → onramp_complete → sent → confirmed` on a local 900ms-per-step
  timer. It never calls `GET /transfers/:id`.
- Mock recipients use wallet strings like `0x7a3f…C41d` and ids like `rcp_adaeze`.
- Mock sender is `{ id: "usr_tomiwa", ... }`.
- "Add new recipient" is entirely client-side — no request is sent anywhere.
- Sidebar shows a per-currency EUR/GBP/USD fiat balance from local mock data.

---

## Known mismatches / open questions

These need a decision from you (Shina) and/or Isaac — nothing below has been
silently resolved or guessed at.

1. **`onramp` response shape is fundamentally different, not just renamed.**
   Frontend expects the backend to choose between two mutually-exclusive session
   shapes (`checkoutUrl` for a redirect flow vs. `widgetConfig.embedUrl` for an
   embedded iframe flow) — i.e. the *backend* decides redirect-vs-embedded.
   The real backend always returns exactly one thing: `{ sessionId, widgetUrl }`.
   There's no backend-side concept of two modes — Transak's widget URL can be
   *either* opened in an iframe *or* used as a full-page redirect; that choice is
   entirely a **frontend** decision, not something the backend encodes. Someone
   needs to decide: does the frontend rewrite its on-ramp step to consume
   `{ sessionId, widgetUrl }` directly and pick redirect-vs-embedded itself, or
   does the backend get asked to add the two-shape split the frontend already
   built against? I'd lean toward the former (matches how Transak's API actually
   works) but I'm flagging it rather than just rewriting the frontend to match.

2. **`onramp_reference` timing mismatch.** Frontend treats `onramp_reference` as
   available immediately after `POST /transfers` and displays it right away (in the
   passcode dialog, the "preparing checkout" step, etc). The real backend leaves it
   `null` until Transak's `ORDER_COMPLETED` webhook fires — which may be minutes
   after checkout starts. The frontend needs a different value to show immediately
   (the transfer `id`? a separately-generated reference?) — needs a decision.

3. **Frontend never polls `GET /transfers/:id`.** It fakes the whole
   `pending → onramp_complete → sent → confirmed` sequence client-side with a fixed
   timer, disconnected from what the backend is actually doing. Since only the
   backend (via Transak's *signed* webhook) can truthfully confirm anything, this
   needs to change to real polling — otherwise the frontend can show "confirmed"
   before, or without, the backend ever agreeing. This is a frontend change, not a
   mismatch to resolve on the backend side, but flagging it since it's a real gap
   between what the UI claims and what's actually true.

4. **No `TransferStatus.failed` on the frontend.** The backend has a real `failed`
   terminal status with a `failure_reason`. The frontend's type and its
   `STATUS_LABEL` map don't account for it at all. If/when polling is wired up, a
   `status: "failed"` from the backend has nowhere defined to go on the frontend
   today.

5. **RESOLVED (2026-08-25, backend side).** `POST /users` now exists — see the
   section above. It covers user registration (`name`, `role`, `country`,
   `wallet_address`), validates `role` and the wallet address format, and returns
   the created row. No `GET /users`/lookup endpoint was built (not needed yet).
   ~~No user registration/lookup endpoint exists on either side.~~ The backend half
   of this is done; the frontend's "Add new recipient" flow is still entirely local
   fabrication with no server round-trip — wiring it to call `POST /users` (and
   validating real Solana addresses client-side, see mismatch #6) is still open on
   the frontend side.

6. **Wallet address format mismatch.** Backend requires Solana base58 pubkeys
   (`wallet_address`, validated implicitly by `new PublicKey(...)` failing on send).
   Frontend's mock/demo wallet addresses (`0x7a3f…C41d` etc.) and its "Add new
   recipient" form use Ethereum-style `0x…` hex strings with no format validation.
   These will fail on the real backend. Frontend needs real Solana-address
   validation before this is wired up for real.

7. **No fiat/EUR balance source exists on the backend.** The only balance endpoint
   (`GET /balances/:userId`) is a recipient's post-transfer USDC balance, not a
   sender's spendable EUR balance. The frontend's sidebar "EUR/GBP/USD balance" is
   pure mock data with nothing to back it once real accounts exist. Not clear
   whether fiat balance tracking is even in scope for the backend — needs a
   decision on whether/where that gets built.

8. **`TRANSAK_REFERRER_DOMAIN` — Isaac is explicitly asking for this.** The code
   comment in `backend/src/lib/transak.ts` and `.env.example` both say this is a
   placeholder (`"kobo.app"`) pending confirmation of "the real domain the widget
   will be embedded on" from Person A. This needs an actual answer — what domain
   will the frontend actually be served from / embed Transak in.

9. **No CORS middleware on the backend.** Calling any of these endpoints from a
   browser at the frontend's origin will currently be blocked. Needs to be added
   (and probably needs to know the frontend's real origin(s) to allow).

10. **No auth on any backend route.** Every endpoint is fully open right now —
    `sender_id` is just whatever the client sends. Not necessarily wrong for this
    stage, but worth a conscious decision on when auth gets added rather than
    building further on top of an implicit "trust the client" model.

11. **`amount_usdc` is computed with a placeholder rate (1.08), server-side**,
    explicitly flagged in the code as temporary. The frontend independently shows
    its own live-ish random-jittered rate client-side for the "you send" quote.
    These two numbers will not match today. Whoever owns the real quoted-rate
    source (Transak's actual quote? a rates API?) needs to be decided — right now
    neither side has a real one.

12. **`frontend/` isn't on `main` at all yet.** This whole comparison is between
    `main`'s `backend/` and the frontend's in-progress work on a separate branch
    (uncommitted, per Shina's instruction not to commit it yet). Once frontend work
    is ready to merge, the monorepo layout (`backend/` + `frontend/` both under
    `main`) still needs to actually happen.
