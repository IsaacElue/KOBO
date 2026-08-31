# Kobo API Contract

Shared source of truth between `backend/` (Person B / Isaac — Express + Supabase +
Solana devnet + on-ramp) and `frontend/` (Person A / Shina — Next.js). Describes what
is **actually implemented** on each side as of this sync, not what was planned.

Update this file in place when either side's contract changes — don't append a new
dated section, overwrite the stale one.

**Latest addition (roadmap reprioritized — MoonPay repair is now Phase 2):** the
founder reordered the funding roadmap: MoonPay (fix + end-to-end proof) → SEPA →
Conversion Engine → Stripe POC → funding UX → hardening → observability →
production readiness. **Coinbase is archived** — Phase 2A's research stands
(see COINBASE_FEASIBILITY.md, now banner-marked archived) but nothing is being
built against it; its reserved `FundingRail` value and DB slot stay, unused.
MoonPay's `verify_widget_signature 400` failure — previously attributed to an
IP-lock and treated as an external/unsolvable account issue — is now **under
active investigation with evidence**, not assumed. Findings land in this file
once Step 2 of that investigation completes; see KOBO_BUILD_PLAN.md section 8
for the current roadmap status.

**Prior addition (Funding Rail Abstraction — Phase 1):** `POST /funding` now
accepts an explicit `rail` field (`"moonpay"` | `"transak"`, others reserved —
see below) instead of being governed solely by the server-wide
`ONRAMP_PROVIDER` env var; the response and `GET /funding/:id` now also
return `rail`. `funding_requests` gained a `rail` column and three new
`status` values (`awaiting_reconciliation`, `manual_review`,
`payout_pending`) reserved for SEPA/Stripe, not produced by any code path yet.
`creditBalance()` (`lib/balances.ts`) is now atomic — a Postgres
`credit_balance()` function (`INSERT ... ON CONFLICT DO UPDATE`), replacing
the old read-then-upsert that could lose a concurrent credit; verified live
under real concurrency. `getMarketRate()` moved its import boundary from
`lib/transak.ts` to a new `lib/rates.ts` (routes now depend on that, not on
Transak directly) — **preserves exact current pricing behavior**, doesn't
remove the underlying Transak-credential requirement (see "Resolved this
sync" #20 for what that does and doesn't fix). Webhook handlers now reject a
rail mismatch (a Transak webhook can't settle a MoonPay-created request, or
vice versa) — new `409`. Coinbase/SEPA/Stripe are **not implemented** — the
`FundingRail` type and DB constraints know their names, nothing else does;
requesting one of those rails is a clean `501`, not a silent fallback. New
backend test suite (`backend/src/test/`, vitest — was previously zero
automated backend tests). Full detail in "Resolved this sync" #20.

**Prior addition (recipient wallet-by-email, via Crossmint):** `POST /users`
(role: `"recipient"`) now accepts `email` as an alternative to `wallet_address`.
When `email` is sent instead, the backend get-or-creates a Crossmint MPC Solana
wallet for that email (`backend/src/lib/crossmint.ts`, `resolveRecipientWallet`)
and stores the resulting address exactly like a pasted one — same row shape,
same downstream behavior, `POST /transfers`/`settleTransfer` unchanged. Pasting
a real address still works unchanged; email is additive, not a replacement.
**Not non-custodial** — see the new custody note in the `POST /users` section
below before describing this anywhere user-facing. New env var:
`CROSSMINT_API_KEY`. Full detail in "Resolved this sync" #19.

**Prior addition (on-ramp provider → MoonPay):** `POST /funding` now builds a
**MoonPay** widget URL instead of Transak — the response shape is unchanged
(`onramp: { sessionId, widgetUrl }`) but `widgetUrl` is now a
`https://buy.moonpay.com?…` URL and `sessionId` / `onramp_session_id` is always
`null` (MoonPay has no server-side session id; correlation is the funding
request's own id, passed as `externalTransactionId`). New webhook route
**`POST /webhooks/moonpay`**. Transak's code path is intact and re-selectable
via `ONRAMP_PROVIDER=transak`. **Frontend impact:** the widget origin is now
`buy.moonpay.com`, and MoonPay's redirect params (`transactionId`,
`transactionStatus`) and postMessage events differ from Transak's — the
redirect/embedded handoff in `onramp-transak.ts` needs a MoonPay equivalent.
Full detail in the `POST /funding` and `POST /webhooks/moonpay` sections.

**Backend read at:** `main` @ `07aa827` ("docs: add POST /users to API_CONTRACT,
resolves mismatch #5").
**Frontend read at:** `restructure-frontend-folder` @ `bef70f3` — `main` and
`restructure-frontend-folder` are now fully merged (both directions), so this is a
single monorepo branch, not a pending PR.

**Latest addition (Activity page):** `GET /market/overview` (CoinGecko proxy,
cached, keyless — no API key) and `GET /transfers` (list own history, session-
gated). Full detail in their own subsections and "Resolved this sync" #18.
The Activity page also calls Jupiter's `price/v3` directly from the client
(keyless, not proxied). **All four new pages (Overview, Settings, Activity,
plus the existing Recipients) are now built** — the app has no "not built yet"
stub screens left.

**Prior addition (Settings):** three session-gated endpoints — `GET /auth/me`,
`PATCH /auth/profile`, `POST /auth/password` — plus the real Settings page.
Full detail in the `/auth/*` subsection and "Resolved this sync" #17.

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
- **Real auth now exists — see "Resolved this sync" #15.** `POST /transfers`,
  `GET /transfers/:id`, `POST /funding`, `GET /funding/:id`, and
  `GET /balances/:userId` all now require a valid Supabase Auth session
  (`Authorization: Bearer <access_token>`) and enforce that the caller can only
  act on/view their own resources — no session is a `401`, someone else's
  resource is a `403`. `POST /users` (recipient creation) and `GET /rate`
  remain open — recipients are payees, not logged-in accounts, and the rate
  ticker is public data. See the new `POST /auth/*` section below for how a
  session is obtained. **Frontend is not updated yet** — see "Still open" #12.
- CORS middleware is configured (`app.use(cors({ origin: frontendOrigin }))`,
  `backend/src/index.ts`) — noted stale here as still-missing in earlier syncs;
  it exists now. See "Still open" #7, corrected below.

---

## `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/pin`, `POST /auth/pin/verify`

**Frontend now wired to all six of these — see "Resolved this sync" #16.**
**Three more `/auth/*` endpoints added this sync for Settings — `GET /auth/me`,
`PATCH /auth/profile`, `POST /auth/password` — documented in their own section
just below `POST /auth/pin/verify`. See "Resolved this sync" #17.**

Real auth, per `KOBO_BUILD_PLAN.md`'s "3c. Real auth" — Supabase Auth for the
real account (email+password), a separate server-verified PIN as a
Revolut-style fast-unlock layer on top of an already-real session. No custom
token scheme anywhere: sessions are exactly what `supabase.auth` issues, and
protected routes verify them via `supabase.auth.getUser(token)`
(`backend/src/lib/auth.ts`), not a locally-decoded/re-signed JWT.

### `POST /auth/signup`

Creates a **real sender** account — the Supabase Auth user (`auth.users`) and
the linked `users` profile row, together. Replaces
`NEXT_PUBLIC_KOBO_SENDER_ID`'s hardcoded-demo-sender scheme entirely (see
"Still open" #12 — frontend hasn't cut over to this yet).

**Request body:**
```json
{ "email": "string", "password": "string (min 8 chars)", "name": "string", "country": "string", "wallet_address": "string" }
```
`wallet_address` validated the same way `POST /users` always has (`new
PublicKey(...)`, format only). `role` is not a field here — signup only ever
creates `"sender"` rows; `POST /users` is recipient-only now (see below).

**Success response — `201`:**
```json
{
  "user": { "id": "uuid", "name": "string", "role": "sender", "country": "string", "wallet_address": "string", "created_at": "2026-08-26T12:00:00.000Z" },
  "session": { "access_token": "string", "refresh_token": "string", "expires_at": 1787775543 }
}
```
`email_confirm: true` is passed to `supabase.auth.admin.createUser` — skips
email verification, since no email-sending integration exists yet (see
`KOBO_BUILD_PLAN.md`). The returned `session` comes from a real
`supabase.auth.signInWithPassword` call immediately after creation, not a
placeholder — use `access_token` as the `Authorization: Bearer` value on
every protected endpoint below.

**Error responses:**
- `400` — `{ "error": "email is required" }` / `"password is required and must be at least 8 characters"` / `"name is required"` / `"country is required"` / `"wallet_address is required and must be a valid Solana address"`
- `400` — `{ "error": "<Supabase Auth error, e.g. \"A user with this email address has already been registered\">" }`
- `500` — `{ "error": "<message>" }` — if the `users` insert fails after the auth account was created, the auth account is deleted again (no orphaned login with no profile); if session creation itself fails after both rows exist, the accounts are left in place (signup did succeed) and the client should retry via `POST /auth/login`.

### `POST /auth/login`

Returning-user login — a thin proxy over `supabase.auth.signInWithPassword`.

**Request body:** `{ "email": "string", "password": "string" }`

**Success response — `200`:**
```json
{ "user": { "id": "uuid", "name": "string", "role": "sender", "country": "string", "wallet_address": "string", "auth_user_id": "uuid" }, "session": { "access_token": "string", "refresh_token": "string", "expires_at": 1787775543 } }
```
`user` is `null` if no `users` row is linked to this auth account yet (shouldn't
happen for anything created via `/signup`, but not assumed).

**Error responses:**
- `400` — `{ "error": "email and password are required" }`
- `401` — `{ "error": "Invalid email or password" }` — deliberately identical
  whether the email doesn't exist or the password is wrong; never reveals
  which.

### `POST /auth/refresh`

Exchanges a refresh token for a fresh session — how a returning visit stays signed in past the access token's ~1h expiry. Thin proxy over `supabase.auth.refreshSession`.

**Request body:** `{ "refresh_token": "string" }`
**Success — `200`:** `{ "session": { "access_token", "refresh_token", "expires_at" } }`
**Error — `401`:** `{ "error": "Invalid or expired refresh token" }` (refresh token itself is dead — session is over, frontend falls back to full login).

### `POST /auth/logout` — requires a valid session

Revokes the session server-side (`supabase.auth.admin.signOut(token, "global")`) — not just a client-side "forget it," the refresh token itself stops working, verified live.

**Success — `200`:** `{ "success": true }`

### `POST /auth/pin` — requires a valid session

Sets (or replaces) the caller's PIN. **Not the account credential** — see the
build-plan rationale above. One PIN per user; calling this again overwrites
the previous one (normal authenticated PIN management, not the
password-reset flow this sync explicitly doesn't build — see "Still open"
#13).

**Header:** `Authorization: Bearer <access_token>`
**Request body:** `{ "pin": "4-6 digits" }`

**Success response — `200`:** `{ "success": true }`

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }` — no session, or an expired/garbage token.
- `400` — `{ "error": "pin must be 4-6 digits" }`
- `403` — `{ "error": "No account linked to this session" }` — a valid Supabase session with no matching `users` row (shouldn't happen post-signup).
- `500` — `{ "error": "<message>" }`

Stored as a `bcrypt` hash (`users.pin_hash`, cost factor 10) — never
plaintext, never reversible.

### `POST /auth/pin/verify` — requires a valid session

**Header:** `Authorization: Bearer <access_token>`
**Request body:** `{ "pin": "string" }`

**Response — always `200`:** `{ "success": true }` or `{ "success": false }`.
`success: false` for a wrong PIN and for "no PIN set yet" are
**indistinguishable** — by design, per the task that created this: never leak
via status code, message, or timing which case it was. (`bcrypt.compare` is
itself constant-time relative to the hash; the "no PIN set" branch skips
comparison entirely and returns the same shape.)

**Error responses:**
- `401` — same two session errors as `POST /auth/pin`.
- `400` — `{ "error": "pin is required" }`
- `500` — `{ "error": "<message>" }`

**Verified live, this sync:** real signup (real `auth.users` row + linked
`users` row + real session), PIN set, PIN verify with the correct PIN
(`success: true`) and an incorrect PIN (`success: false`), `GET
/balances/:userId` with no `Authorization` header (`401`), with a valid
session for a different user's id (`403`), and with a valid session for the
caller's own id (`200`); `POST /transfers` with no header (`401`) and with a
valid session but a `sender_id` belonging to someone else (`403` — see the
`POST /transfers` section below). `POST /users` confirmed to still create
recipients (`role: "recipient"`) and now reject `role: "sender"` with a
pointer to this endpoint. All test accounts/rows created during verification
were deleted afterward (`auth.users` deletion cascades to the linked `users`
row via `on delete cascade`, confirmed working as part of that cleanup).

---

## `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/password` — **NEW this sync (Settings)**

Added for the Settings page (`KOBO_BUILD_PLAN.md`'s "New pages" → Settings).
All three `requireAuth` and act on the caller's own account only — resolved
from the verified session, never from a client-supplied id, same ownership
pattern as `POST /auth/pin`. **Frontend is wired to all three** — see
"Resolved this sync" #17.

### `GET /auth/me` — requires a valid session

The signed-in sender's own full profile. This is the **only** endpoint that
returns a sender their own `email` (it lives on the Supabase Auth account,
not the `users` row) and `created_at` (member-since) — `POST /auth/login`'s
`user` is `resolveKoboUser`'s narrower column set, and `requireAuth` only
attaches the raw Supabase Auth user. The Settings page needs both, so this
exists. Investigated first, per instruction: no prior endpoint covered this.

**Header:** `Authorization: Bearer <access_token>`

**Success — `200`:**
```json
{
  "user": {
    "id": "uuid",
    "name": "string",
    "role": "sender",
    "country": "string",
    "wallet_address": "string",
    "email": "string | null",
    "created_at": "2026-08-26T23:31:55.506Z"
  }
}
```

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }`
- `403` — `{ "error": "No account linked to this session" }` — valid Supabase session, no matching `users` row (shouldn't happen post-signup).
- `500` — `{ "error": "<message>" }`

### `PATCH /auth/profile` — requires a valid session

Updates the caller's own `name` and/or `country`. `email` is deliberately
**not** editable here (needs a confirmation-email round trip Kobo has no
mailer for yet — see `KOBO_BUILD_PLAN.md`; deferred, not built);
`wallet_address` and `role` aren't editable either (a sender's
`wallet_address` is a never-read placeholder — see `GET /auth/me`'s note and
`POST /transfers` — and `role` isn't a user-facing concept).

**Header:** `Authorization: Bearer <access_token>`
**Request body:** `{ "name"?: "string", "country"?: "string" }` — at least one required; each, if present, must be a non-empty string (trimmed server-side).

**Success — `200`:** `{ "user": { ...same shape as GET /auth/me } }` (the updated profile).

**Error responses:**
- `401` — the two session errors.
- `400` — `{ "error": "name must be a non-empty string" }` / `"country must be a non-empty string" }` / `"provide at least one of: name, country" }`
- `403` — `{ "error": "No account linked to this session" }`
- `500` — `{ "error": "<message>" }`

### `POST /auth/password` — requires a valid session

Changes the caller's account password via Supabase Auth's own
`admin.updateUserById` — no custom credential scheme, same principle as the
rest of `/auth/*`. Requires the **current password** as a re-entry check
first (standard security practice; `admin.updateUserById` doesn't itself ask
for it): the check is a fresh `supabase.auth.signInWithPassword`, not a
locally stored hash. On success the **current session is revoked
server-side** (`admin.signOut(token, "global")`, best-effort — the password
already changed, so a revoke failure doesn't fail the request), so a
password change always means "log back in with the new one." The frontend
then routes the user to the login screen.

**Header:** `Authorization: Bearer <access_token>`
**Request body:** `{ "current_password": "string", "new_password": "string (min 8 chars, ≠ current)" }`

**Success — `200`:** `{ "success": true }`

**Error responses:**
- `401` — the two session errors.
- `400` — `{ "error": "current_password is required" }` / `"new_password is required and must be at least 8 characters" }` / `"new_password must be different from your current password" }` / `"This account has no email address to re-verify against" }`
- `400` — `{ "error": "Current password is incorrect" }` — the re-entry check failed.
- `500` — `{ "error": "<message>" }` — the Supabase password update itself errored.

**Verified live, this sync (real accounts, deleted afterward — cascade
confirmed):** `GET /auth/me` returns the real email + `created_at` a signup
response never carried; `PATCH /auth/profile` updates `name` (persisted,
re-read via `GET /auth/me`), rejects a blank name / empty body; `POST
/auth/password` rejects a wrong current password (`400 "Current password is
incorrect"`) and a too-short new one, accepts a valid change (`200`), after
which the old access token `401`s, a login with the **old** password `401`s
("Invalid email or password"), and a login with the **new** password
`200`s. Logout-from-Settings reuses the existing `POST /auth/logout` (session
dead afterward, `401`).

---

## `POST /users` — **recipient-only, now accepts email as an alternative to wallet_address — see "Resolved this sync" #19**

Creates a **recipient**. Real sender creation moved to `POST /auth/signup`
above — this endpoint no longer accepts `role: "sender"` at all, since it has
no way to create the Supabase Auth account a real sender now requires. See
"Resolved this sync" #3 for this endpoint's original (sender-or-recipient)
history.

**Request body** (backend/src/routes/users.ts):
```json
{
  "name": "string",
  "role": "recipient",
  "country": "string",
  "wallet_address": "string",
  "email": "string"
}
```
- `name`, `role`, `country` required, as before.
- **New this sync:** `wallet_address` is no longer required on its own —
  exactly one of `wallet_address` or `email` must be provided.
  - `wallet_address` present → unchanged behavior, checked with
    `new PublicKey(...)` (base58 charset + correct 32-byte length), used
    as-is.
  - `wallet_address` absent, `email` present → checked against a basic
    `name@domain.tld` regex, then resolved to a real Solana address via
    `resolveRecipientWallet(email)` (`backend/src/lib/crossmint.ts`), which
    get-or-creates a Crossmint MPC wallet keyed off that email
    (idempotent — the same email always resolves to the same address, see
    that file's doc comment). The resolved address is stored in
    `wallet_address` exactly as if it had been pasted directly — nothing
    downstream (`POST /transfers`, `settleTransfer`) knows or cares which
    path produced it.
  - Neither present → `400`.
  - **Custody note, stated plainly because it's easy to overclaim:** a
    wallet provisioned this way is **not non-custodial in practice**.
    Crossmint holds the signing key on the server side until/unless the
    recipient's own device generates a signer, which requires the recipient
    to actually open a Crossmint-authenticated surface — nothing in Kobo
    does that today (recipients have no login). The real, accurate claim is
    narrower: the recipient no longer needs to already own a wallet to be
    added.
- `role` must be exactly `"recipient"` — `"sender"` is now a `400` with a
  pointer to `POST /auth/signup` (see below), not a working path.

**Success response — `201`:** the created row (explicit column list now, not
`select()`-all — doesn't leak the `auth_user_id`/`pin_hash` columns added this
sync, both always `null` for a recipient anyway):
```json
{
  "id": "uuid",
  "name": "string",
  "role": "recipient",
  "country": "string",
  "wallet_address": "string",
  "created_at": "2026-08-25T12:00:00.000Z"
}
```
Identical shape regardless of whether `wallet_address` was pasted or resolved
from `email` — the response never echoes back which path was used.

**Error responses:**
- `400` — `{ "error": "name is required" }`
- `400` — `{ "error": "sender accounts are created via POST /auth/signup, not this endpoint" }` — new this sync, only for `role: "sender"` specifically.
- `400` — `{ "error": "role must be one of: recipient" }` — any other invalid `role` value.
- `400` — `{ "error": "country is required" }`
- `400` — `{ "error": "wallet_address does not look like a valid Solana address" }` — only when `wallet_address` was provided.
- `400` — `{ "error": "email does not look like a valid email address" }` — only when `email` was provided instead.
- `400` — `{ "error": "wallet_address or email is required" }` — new this sync, neither provided.
- `502` — `{ "error": "Failed to provision a wallet for this email: <detail>" }` — new this sync, the Crossmint call failed (network, bad `CROSSMINT_API_KEY`, unexpected response shape). No `users` row is created on this path.
- `500` — `{ "error": "<supabase error message>" }`

No `GET /users` / listing / lookup endpoint exists — out of scope for now. Still
no auth on this one, deliberately — recipients are payees, not logged-in
accounts, and have no session to require.

---

## `POST /funding` — **requires a valid session as of this sync**

**Header:** `Authorization: Bearer <access_token>` (`POST /auth/signup` or
`POST /auth/login`). `sender_id` in the body must equal the authenticated
caller's own `users.id` — no session is `401`, a `sender_id` belonging to
someone else is `403`. See "Resolved this sync" #15.

Tops up the **sender's own** real balance — not a send to anyone. Builds an
on-ramp widget URL (**MoonPay** by default — see `backend/src/lib/onramp.ts`),
destination wallet **Kobo's own pooled backend wallet** (`backendWallet.publicKey`,
`backend/src/lib/solana.ts`), not a recipient's. Real USDC that lands there via
this flow is credited to the sender's row in `balances` once the provider's
completion webhook confirms it — `POST /webhooks/moonpay` for MoonPay,
`POST /webhooks/onramp` for Transak. See those sections below.

**Provider swap:** `ONRAMP_PROVIDER` env (`moonpay` default | `transak`) is
still the **default** when no explicit `rail` is sent — behavior unchanged for
every existing caller. Only the session-build and webhook-verify differ
between providers; the request/response contract here is identical either way.
Transak's path is kept fully intact for a fast swap-back.

**Request body** (`backend/src/routes/funding.ts`):
```json
{ "sender_id": "uuid", "amount_eur": 100, "rail": "moonpay" }
```
- `sender_id`, `amount_eur` required as before; `amount_eur` must be a JS
  `number` and `> 0`.
- `sender_id` **must equal the authenticated caller's own `users.id`**.
- **New this sync — `rail`, optional.** One of `"moonpay"` | `"transak"` |
  `"coinbase"` | `"sepa"` | `"stripe"` (case-insensitive, whitespace-trimmed).
  Omitted → falls back to the `ONRAMP_PROVIDER` env default, exactly the
  pre-Phase-1 behavior. Only `moonpay`/`transak` are actually implemented —
  the other three are real, reserved type/schema values (the abstraction is
  built for all three rail *kinds* — hosted-session, reconciled, treasury —
  per the founder's Phase 1 brief) with no working code behind them yet;
  requesting one is a `501`, never a silent fallback to a different rail. The
  frontend does not send `rail` yet (no UI change this phase) — this field
  exists so the backend no longer *requires* a single global provider once
  more rails exist, per that same brief. **No provider names are meant to
  reach end users** — a future funding-method picker ("Card" / "Bank
  transfer") maps to a `rail` value internally, not shown as-is.

**Success response — `201`:**
```json
{
  "id": "uuid",
  "sender_id": "uuid",
  "amount_eur": 100,
  "amount_usdc": 116.428667,
  "status": "pending",
  "rail": "moonpay",
  "onramp_session_id": "string | null",
  "onramp_reference": null,
  "failure_reason": null,
  "created_at": "2026-08-26T12:00:00.000Z",
  "onramp": { "sessionId": "string | null", "widgetUrl": "https://buy.moonpay.com?apiKey=…&signature=… (MoonPay, HMAC-signed, directly loadable)" }
}
```
The whole `funding_requests` row (new table — see Data model below; `rail` new
this sync), plus the same `onramp: { sessionId, widgetUrl }` shape `POST
/transfers` used to return. `rail` in the response always reflects the rail
that was actually used to build `onramp` — never re-derived from
`ONRAMP_PROVIDER` after the fact, so the two can never disagree (a real bug in
an early draft of this sync: the row briefly defaulted to the literal string
`"moonpay"` independent of `ONRAMP_PROVIDER`, rather than sharing one resolved
value with the session-creation call — fixed before this reached main).

**MoonPay specifics:** `widgetUrl` is a signed `https://buy.moonpay.com?…` URL —
no expiry (it's a signed param bundle, not a one-time session), origin
`buy.moonpay.com`. `sessionId` and the stored `onramp_session_id` are **always
`null`** (MoonPay has no session id — correlation is `externalTransactionId`,
set to the `funding_requests.id`). The URL carries `allowedIpAddress` = the
caller's IP (`req.ip` via `trust proxy`; `MOONPAY_ALLOWED_IP_OVERRIDE` for local
dev) — this MoonPay account enforces IP-bound signed URLs, so a widget opened
from a different IP than the one that called `POST /funding` is rejected by
MoonPay. `amount_usdc` here is the pre-purchase estimate; the amount actually
**credited** on confirmation is MoonPay's real `quoteCurrencyAmount` from the
webhook, which can differ slightly.

`amount_usdc` is computed with the **real live market rate**
(`getMarketRate("EUR")`, **now `backend/src/lib/rates.ts`** — the same
function `GET /rate` uses; moved from a direct `lib/transak.ts` import this
sync, see "Resolved this sync" #20), not a placeholder — this is a fresh code
path with no old convention to preserve, and the figure directly determines
how much gets credited to the sender's balance once confirmed, so accuracy
matters here more than it did for the old display-only `POST /transfers`
estimate (see "Still open" #9, still unresolved for the parts of the system it
was already scoped to).

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }`
- `400` — `{ "error": "sender_id and numeric amount_eur are required" }`
- `400` — `{ "error": "amount_eur must be positive" }`
- `400` — `{ "error": "sender_id must be a valid UUID" }`
- `400` — `{ "error": "rail must be one of: moonpay, transak, coinbase, sepa, stripe" }` — new this sync, unknown `rail` string.
- `400` — `{ "error": "rail must be a string" }` — new this sync, `rail` sent as a non-string.
- `403` — `{ "error": "No sender account linked to this session" }` — a valid session with no linked `users` row.
- `403` — `{ "error": "sender_id does not match the authenticated user" }`
- `501` — `{ "error": "Funding rail 'sepa' is recognized but not implemented yet" }` — new this sync, a recognized-but-not-yet-implemented rail (`coinbase`/`sepa`/`stripe`) was explicitly requested, or is the current `ONRAMP_PROVIDER` default (it isn't — default is `moonpay` — but this checks the *resolved* rail either way). Checked before any rate quote or `funding_requests` insert — no wasted row.
- `502` — `{ "error": "Failed to fetch conversion rate: <message>" }`
- `502` — `{ "error": "Failed to create on-ramp widget session: <message>" }` — the
  `funding_requests` row is deleted server-side before this is returned (no
  orphaned rows), same pattern `POST /transfers` used to follow. One MoonPay-
  specific `<message>` to know: if the caller's IP resolves to loopback/private
  (local dev without `MOONPAY_ALLOWED_IP_OVERRIDE`, or a misconfigured
  `trust proxy`), the message names the missing IP override rather than calling
  MoonPay with an IP it will reject.
- `500` — `{ "error": "<supabase error message>" }`

## `GET /funding/:id` — **requires a valid session as of this sync**

**Header:** `Authorization: Bearer <access_token>`. The funding request's own
`sender_id` must equal the authenticated caller's `users.id` — no session is
`401`, someone else's funding request is `403`. See "Resolved this sync" #15.

Same shape/pattern as `GET /transfers/:id` — poll this for live status after
`POST /funding`, the way the frontend already polls `GET /transfers/:id` after
`POST /transfers`. Didn't exist until now; added specifically so the frontend has
something concrete to poll after Add Funds instead of guessing when the balance
changed.

**Response — `200`:**
```json
{
  "id": "uuid",
  "sender_id": "uuid",
  "amount_eur": 100,
  "amount_usdc": 116.428667,
  "status": "pending",
  "onramp_session_id": "string | null",
  "onramp_reference": "string | null",
  "failure_reason": "string | null",
  "created_at": "2026-08-26T12:00:00.000Z",
  "balance": 104.783346
}
```
The whole `funding_requests` row, same fields `POST /funding`'s response has
(minus the one-time `onramp` session object — that's not re-returned on every
poll, same as `GET /transfers/:id` never re-returns anything onramp-session-only
either), **plus `balance`: the sender's current real balance** (`getBalance()`,
`backend/src/lib/balances.ts`) on every response, regardless of `status`. This
is deliberately not just "the funding row's own `amount_usdc`" — it's the
sender's actual live balance, so the frontend gets the *resulting* number
directly once `status` flips to `"confirmed"`, without a second round-trip to
`GET /balances/:userId`. Verified live: polled a real funding request through
its full `pending -> confirmed` lifecycle (confirmed via
`selftest-webhook-e2e.ts`, same as `POST /webhooks/onramp` above) — `balance`
tracked the sender's exact real balance at each poll, and increased by exactly
the funding request's own `amount_usdc` once confirmed (verified against a
sender who already had a prior balance from earlier in this sync — the number
returned was the correct running total, not just this one request's amount).

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }`
- `400` — `{ "error": "id must be a valid UUID" }`
- `404` — `{ "error": "Funding request not found" }`
- `403` — `{ "error": "This funding request does not belong to the authenticated user" }`
- `500` — `{ "error": "<message>" }`

## `POST /transfers` — **behavior changed this sync, no longer creates a Transak session; now also requires a valid session**

**Breaking change from the shape documented in every prior sync of this file:**
this endpoint no longer ever returns an `onramp` object, and no longer ever
returns `201`. It's now balance-checked and, when funded, **instant** — see
`KOBO_BUILD_PLAN.md` "Sender-side balance — SUPERSEDED" for the product decision
behind this. **No parallel/legacy per-transfer Transak-session path was kept** —
if you want to add funds, that's `POST /funding` now, a separate step before
sending, not something `POST /transfers` falls back to.

**Header (new this sync):** `Authorization: Bearer <access_token>`. `sender_id`
in the body must equal the authenticated caller's own `users.id`.

**Request body unchanged** (`backend/src/routes/transfers.ts`):
```json
{ "sender_id": "uuid", "recipient_id": "uuid", "amount_eur": 250 }
```
Same three required fields as before. New: `amount_eur` must also be `> 0` (not
previously enforced — added because this number now directly drives a real ledger
debit, where it wasn't before).

**New flow, in order:**
1. Validate inputs. Resolve the caller's own `users` row from the verified
   session and require `sender_id === that row's id` (`403` otherwise) —
   **replaces** the old plain "does this `sender_id` exist" lookup entirely;
   existence is now implied by "is this the caller's own account." Look up
   the recipient (existence + `wallet_address`) — unchanged from before.
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
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }` — new this sync.
- `403` — `{ "error": "No sender account linked to this session" }` / `"sender_id does not match the authenticated user" }` — new this sync; see step 1.
- `500` — `{ "error": "<message>" }` — unexpected Supabase/infra error.

**On the `422` case, confirmed empirically this sync (not just from the code):**
`NonRetryableTransferError` (`backend/src/lib/solana.ts`) — and therefore this
`422` — fires for at least three independent, unrelated reasons, not only
"backend wallet low on funds": an invalid/malformed recipient wallet address,
an invalid or zero `amount_usdc`, and (the one actually seen in practice)
insufficient real on-chain USDC in `backendWallet`. All three, and any other
unclassified Solana send error, land on the same `422` — it's a general
"non-retryable settlement failure" bucket, not a dedicated balance-only status.
This is a genuinely different failure from the `400 INSUFFICIENT_BALANCE` case
above: that one is the sender's own ledger balance, checked before anything
touches Solana, nothing ever debited; `422` happens *after* the ledger debit
(then refunded per step 6), when the real on-chain attempt itself is rejected.

**RESOLVED — frontend now wired to this contract, see "Resolved this sync" #14.**
`createTransfer()` (`lib/kobo/api.ts`) now returns the `TransferRecord` directly
(no more `onramp`), and `kobo-app.tsx` no longer expects a widget session for a
send at all — see that entry for the full detail.

## `GET /transfers/:id` — **requires a valid session as of this sync**

**Header:** `Authorization: Bearer <access_token>`. The transfer's own
`sender_id` must equal the authenticated caller's `users.id` — no session is
`401`, someone else's transfer is `403`. Response shape otherwise unchanged;
`sender_id` is fetched internally to check ownership but stripped back out
before responding, same fields as always. See "Resolved this sync" #15.

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
`401` → the two session errors (missing/invalid header, invalid/expired session).
`400` → `{ "error": "id must be a valid UUID" }` if `:id` isn't a well-formed UUID.
`404` → `{ "error": "Transfer not found" }` if it's a well-formed UUID with no matching row.
`403` → `{ "error": "This transfer does not belong to the authenticated user" }`.
For a transfer created via the new instant-send path, `onramp_session_id` and
`onramp_reference` are always `null` — nothing about that transfer ever touched
Transak.

## `GET /transfers` — **NEW this sync (Activity page)**

The signed-in sender's own transfer history, newest first — for the Activity
page's "Transfer history" list and its sending stats. Own resource only: rows
are filtered by `sender_id = <caller's users.id from the verified session>`,
never a client-supplied id — same ownership model as `GET /transfers/:id`.

**Header:** `Authorization: Bearer <access_token>`

**Response — `200`:**
```json
{
  "transfers": [
    {
      "id": "uuid",
      "recipient_id": "uuid",
      "recipient_name": "string | null",
      "amount_eur": 0.05,
      "amount_usdc": 0.058,
      "status": "confirmed",
      "solana_tx_signature": "string | null",
      "failure_reason": "string | null",
      "created_at": "2026-08-27T14:58:17.118Z"
    }
  ]
}
```
Existing `transfers` columns plus `recipient_name` — **joined from `users.name`
(`users!transfers_recipient_id_fkey`), not a new column on `transfers`.** No
schema change. Ordered `created_at` desc, capped at 50 rows. `status` is the
raw enum (`pending | onramp_complete | sent | confirmed | failed`); the
frontend maps it (`confirmed → "Delivered"`, `failed → "Failed"`, everything
else → "In progress").

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }`
- `403` — `{ "error": "No sender account linked to this session" }`
- `500` — `{ "error": "<supabase error message>" }`

**Verified live, this sync:** a real account with two real €0.05 sends returns
both rows with `recipient_name: "Adaeze Okonkwo"` and `status: "confirmed"`; a
fresh account returns `{ "transfers": [] }`; no header → `401`.

## `POST /webhooks/moonpay` — MoonPay on-ramp completion (current provider)

MoonPay → backend only. Not called by the frontend. **Only used for funding** —
transfers are instant (no on-ramp), so every valid webhook here routes to the
funding pipeline; no `partnerOrderId`-prefix disambiguation like the Transak
route needs.

**Verification:** the `Moonpay-Signature-V2` header (`t=<unix-seconds>,s=<hex>`)
is an HMAC-SHA256 of `"<t>.<raw-body>"` keyed with `MOONPAY_WEBHOOK_KEY`
(`wk_…`). The raw pre-JSON-parse body is required — `index.ts` captures it as
`req.rawBody` via `express.json({ verify })`. A missing/malformed/stale
(>5 min skew) / non-matching signature is `401 { "error": "Invalid webhook
signature" }` and the body is not processed.

**Payload:** `{ type, data, externalCustomerId }` where `data` is the MoonPay
buy-transaction object. Relevant fields: `data.id` (MoonPay's txn id, stored as
`onramp_reference`), `data.status` (`waitingPayment | pending |
waitingAuthorization | completed | failed`), `data.externalTransactionId` (the
`funding_requests.id` we set), `data.quoteCurrencyAmount` (USDC actually
delivered), `data.cryptoTransactionId` (Solana tx signature), `data.failureReason`.

**Behaviour by event:**
- `type === "transaction_updated"` **and** `data.status === "completed"` → the
  ORDER_COMPLETED equivalent: run the **funding pipeline** (same
  `handleFundingWebhook` the Transak route uses) — match
  `data.externalTransactionId` to a `funding_requests` row, claim it
  (`pending → confirmed`, conditional update for idempotency), credit the
  sender's balance with `data.quoteCurrencyAmount` (falling back to the row's
  `amount_usdc` estimate if absent). `200` with the updated row; `409` on a
  replayed/duplicate webhook (row already `confirmed`); `404` no match; `400`
  no usable `externalTransactionId`.
- `type === "transaction_failed"` or `data.status === "failed"` → mark the
  matching `pending` funding request `failed` with `data.failureReason`. `200`.
- Any other type/status (`transaction_created`, still `pending`, etc.) → `200`
  ack, nothing credited.

**Data model note:** MoonPay never sets `onramp_session_id` (stays `null`); it
sets `onramp_reference` to `data.id` on confirmation, same column the Transak
path uses.

## `POST /webhooks/onramp` — extended this sync to also handle funding

**Inactive while `ONRAMP_PROVIDER=moonpay` (the default)** — MoonPay fires
`POST /webhooks/moonpay` instead. This route stays mounted and correct for a
swap back to `ONRAMP_PROVIDER=transak`.

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

## `GET /balances/:userId` — **requires a valid session as of this sync**

**Header:** `Authorization: Bearer <access_token>`. `:userId` must equal the
authenticated caller's own `users.id` — no session is `401`, anyone else's
`:userId` is `403`. This is a real behavior change from every prior sync (see
below); auth work landed here in "Resolved this sync" #15.

```json
{ "usdc_balance": 0, "updated_at": null }
```
Returns zeros if no row exists yet (never a 404). **The underlying query is
unchanged** (`select ... where user_id = :id`, no role filtering in it) — what's
new is the ownership check wrapped around it. Previously (as of the sync that
added `POST /funding`) this was correctly noted as "completely unchanged... no
role filtering ever existed" — true at the time, no longer true now that a
session check gates it. **Consequence worth flagging:** since recipients never
authenticate (no `auth_user_id`, no session — see `POST /users` above), a
recipient's own balance is no longer reachable through this route by anyone,
including the recipient. Fine today (nothing currently calls this for a
recipient — the "Recipient balance display" feature in
`KOBO_BUILD_PLAN.md` is explicitly on hold), but worth revisiting *when* that
feature gets built: it'll need its own access model, not just "reuse this
endpoint," since a recipient has no session to present here.

Historical context — what changed in the sync `POST /funding` was added in:
previously only ever written for a *recipient's* post-transfer credit, so it
always read `0`/`null` for a sender. `POST /funding`'s webhook-confirm step
also writes a sender's row now, and `POST /transfers`' instant-send path
debits/credits/refunds it — so this correctly returns real, moving balances
for senders too, not just recipients. **"Still open" #8 (below) is resolved**
by that — see that entry.

**Error responses:**
- `401` — `{ "error": "Missing or invalid Authorization header" }` / `"Invalid or expired session" }`
- `403` — `{ "error": "This balance does not belong to the authenticated user" }`
- `500` — `{ "error": "<supabase error message>" }`

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

## `GET /market/overview` — **NEW this sync (Activity page)**

Crypto market data for the Activity page's market card — SOL & USDC price
(EUR), 24h & 7d change, and a 7-day price sparkline. Public (no auth), like
`GET /rate` — market data isn't user-specific.

Proxies CoinGecko's free **keyless** public API
(`/coins/markets?ids=solana,usd-coin&vs_currency=eur&price_change_percentage=24h,7d&sparkline=true`)
through an **in-memory TTL cache** (`backend/src/lib/market.ts`, 90s TTL,
concurrent misses de-duped into one upstream call). This is the same
"one cached upstream fetch serves every client" idea as the Transak
access-token cache. **Checked, per instruction — no CoinGecko Demo API key
needed and none configured:** the keyless tier is tight (~5-8 req/min before a
punitive 429), but the 90s backend cache pins usage to <1 upstream call/min
regardless of how many clients hit this endpoint. Verified: 5 rapid calls all
return the identical `updated_at` (one upstream fetch).

**Response — `200`:**
```json
{
  "sol":  { "price_eur": 92.07, "change_24h": 12.40, "change_7d": 23.40, "sparkline_7d": [86.49, 86.51, "... 168 hourly points ..."] },
  "usdc": { "price_eur": 0.8587, "change_24h": 0.01, "change_7d": 0.0, "sparkline_7d": ["... 168 points, ~1.0 ..."] },
  "updated_at": "2026-08-27T16:03:00.000Z",
  "stale": false
}
```
`sparkline_7d` is CoinGecko's free 7-day sparkline — **USD-denominated
regardless of `vs_currency` (CoinGecko quirk); treat it as trend shape, not
axis values.** The frontend renders it as a tiny inline `<svg>` polyline, no
charting library.

**Graceful degradation (per instruction — never a broken layout):**
- Upstream fails (429 / down) **but** a cached payload < 30 min old exists →
  `200` with that payload and `"stale": true`. The frontend shows a "Prices
  may be delayed" hint and keeps rendering.
- Upstream fails and no usable cache → `503 { "error": "market data unavailable" }`.
  The frontend shows a clean "Market data is unavailable right now" state.
- Frontend's `getMarketOverview()` also returns `null` on any network error,
  so a dead backend still degrades cleanly.

**Not proxied — Jupiter.** The Activity page's small live SOL ticker calls
Jupiter's `price/v3` (`https://lite-api.jup.ag/price/v3?ids=<SOL mint>`)
**directly from the client** — keyless, no signup, and its lite tier is
generous (~60 req/min, forgiving 429). No backend proxy: the proxy exists for
CoinGecko because *its* keyless limit is far tighter. Jupiter returns
`usdPrice` + `priceChange24h`; the frontend polls it every 45s per viewer and
falls back to "SOL price unavailable" on any failure.

**Verified live, this sync:** real `GET /market/overview` → `200` with SOL
~€92, real 24h/7d change, 168-point sparkline; cache confirmed (rapid calls,
one upstream hit); Jupiter direct call → `200` (SOL ~$107). Both rendered on
the Activity page.

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
  auth_user_id    uuid | null, unique, FK -> auth.users.id, on delete cascade  -- NEW this sync
  pin_hash        text | null                                                 -- NEW this sync
  -- auth_user_id is nullable, not NOT NULL/role-conditioned: only real sender
  -- signups (POST /auth/signup) populate it. Recipients (role = 'recipient')
  -- are payees, not logged-in accounts, and never get one — a NOT NULL check
  -- for role = 'sender' was considered and rejected in the migration, since
  -- it would fail outright against the existing pre-auth demo sender row.
  -- pin_hash is a bcrypt hash (cost 10), set via POST /auth/pin — never
  -- selected by any route with an implicit select() (checked this sync: only
  -- POST /users' insert used one, on this exact table, now given an explicit
  -- column list instead so it can never accidentally return this column).

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

13. **`GET /funding/:id` added — closes the one piece "Still open" #11 flagged
    as concretely missing before frontend work could start.** Same
    shape/pattern as `GET /transfers/:id` (full detail in that section above),
    plus the sender's current real `balance` on every response so the frontend
    doesn't need a second call to `GET /balances/:userId` just to see the
    credited amount once `status` flips to `"confirmed"`. Verified live: polled
    a real funding request through its full `pending -> confirmed` lifecycle,
    `balance` tracked the sender's exact real running total at each poll.

14. **Frontend wired to real funding + instant send — the backend half from
    #12/#13 now has a working UI.** Read `API_CONTRACT.md` in full first, per
    instruction — no shape guessed at.
    **Add Funds** (`components/kobo/app-sidebar.tsx`'s existing but previously
    inert button, now wired): new `add-funds-dialog.tsx` (amount entry, matching
    `add-recipient-dialog.tsx`'s dialog-chrome convention + `SendAmountCard`'s
    preset-button styling — no new visual pattern) calls `POST /funding`, then
    reuses the *exact* existing Transak widget-loading components
    (`RedirectHandoff`/`EmbeddedWidgetModal`, same viewport-based
    `preferRedirectOnramp()` decision) that the old per-transfer flow used —
    not a second widget mechanism. Once the widget signals "checkout ended,"
    polls the new `GET /funding/:id` — same `pollTransferStatus`-shaped pattern,
    literally named `pollFundingStatus()` — and on confirmation, updates the
    sidebar balance straight from that response's `balance` field and toasts
    the result (matching the app's existing toast conventions, no new success
    dialog invented for this).
    **Send is rewired to no longer expect a Transak session at all.**
    `TransferSummaryPanel`'s "Confirm & Continue" now does a fresh
    `GET /balances/:userId` check before proceeding — insufficient balance
    toasts and opens Add Funds instead of the passcode gate. (In practice the
    *existing* `SendAmountCard` over-balance warning + disabled button, now fed
    the real balance, already blocks this for any amount a user could type in —
    the fresh check is the defensive fallback for the narrower case of the
    balance changing after that check but before the click resolves; both are
    real, both were verified.) The passcode dialog is unchanged and still gates
    entry; the 4th digit now opens a **new** in-app confirmation dialog
    (`send-confirmation-dialog.tsx` — recipient, amount, fee, estimated
    arrival, confirm/cancel; same Dialog/Avatar/Row conventions
    `success-dialog.tsx` already used) instead of launching Transak checkout.
    Confirm calls `POST /transfers` (now instant) and polls `GET /transfers/:id`
    exactly as before (`pollTransferStatus`, unchanged) — same success/failed
    dialogs, unchanged. A `400 INSUFFICIENT_BALANCE` from the send itself
    (`code`/`requiredUsdc` on a typed `ApiError`) gets the same toast +
    Add-Funds-prompt treatment as the pre-check.
    **Sidebar balance** now reads real `GET /balances/:userId` (via a mount
    effect + post-action refreshes, same silent-retry-on-failure pattern
    `refreshRate()` already established), converted from USDC into whichever
    currency is selected using the *same* live `rate` state the header ticker
    already holds — no second rate mechanism, per instruction.
    `SendAmountCard`'s "Balance available" line and the amount-exceeds-balance
    disabled check were switched to the same real converted figure too (not
    explicitly named in the instructions, but the same number as the sidebar —
    leaving them on the old static fixture while the sidebar went real would
    have shown two different, contradictory balances on one screen).
    `lib/kobo/mock-data.ts`'s `BALANCES` (the static per-currency fixture all
    three of those used to read) is deleted, not just unused.
    **Mock mode kept fully working, not just real mode:** `lib/kobo/api.ts` grew
    a real-shaped mock ledger (`mockBalanceUsdc`, seeded generously so a mock
    demo can send immediately without needing to fund first) that `POST /funding`
    credits and `POST /transfers` debits/insufficiency-checks against, plus
    `mockCreateFunding`/`mockGetFundingRequest`/`pollFundingStatus` mirroring the
    real endpoints' shapes and the existing `mockGetTransfer` staged-polling
    convention.
    **Test suite:** `onramp-embedded.test.tsx` and `onramp-session.test.tsx`
    (session-creation-failure + redirect-handoff coverage) were repointed at
    Add Funds — the only place a Transak widget still opens from the frontend
    now; `transfer-flow.test.tsx`/`passcode-dialog.test.tsx`/
    `accessibility.test.tsx` updated for the new passcode -> confirm-dialog ->
    instant-send sequence; `currency-switching.test.tsx`'s balance assertions
    redesigned to check cross-component consistency instead of an exact
    precomputed figure, since the real (now random-rate-driven even in mock
    mode) balance can't be known ahead of time the way the old static fixture
    could.
    **Verified live, in your exact order:** funded a real sender's balance via
    a real Transak session (confirmed through `selftest-webhook-e2e.ts`, its
    isolated process avoiding the token-invalidation collision noted in an
    earlier sync) — sidebar balance moved from a real figure to a real higher
    figure by exactly the funded amount, live in the browser, no page reload.
    Sent an amount within that balance: no Transak popup at any point
    (confirmed programmatically, not just visually), the new confirmation
    dialog shown with correct recipient/amount/fee, `POST /transfers` returned
    `200` with a real `solana_tx_signature` **synchronously** (confirmed
    `finalized` on-chain independently), success dialog shown, balance
    decremented by exactly the sent amount. Attempted a send exceeding balance:
    "Confirm & Continue" correctly disabled with the existing
    "more than your available balance" warning — a clear, pre-existing UI
    state, not a raw error or crash.

15. **Real auth, backend-only this sync — Supabase Auth signup/login + a
    server-verified PIN fast-unlock layer, per `KOBO_BUILD_PLAN.md`'s "3c. Real
    auth."** Four new endpoints (`POST /auth/signup`, `POST /auth/login`,
    `POST /auth/pin`, `POST /auth/pin/verify` — full detail in their own
    section above) plus a session check (`requireAuth`,
    `backend/src/lib/auth.ts` — verifies via `supabase.auth.getUser(token)`,
    not a custom JWT scheme) added to every sender-facing endpoint:
    `POST /transfers`, `GET /transfers/:id`, `POST /funding`,
    `GET /funding/:id`, `GET /balances/:userId`. Each of those also now
    resolves the caller's own `users` row from the session and checks it
    against the resource being acted on/read (`sender_id`, `:userId`, or the
    fetched row's own `sender_id`) — `403` on a mismatch — not just "is there
    *a* valid session," which would have made the session check
    security-theater while `sender_id` stayed fully client-trusted. This
    identity-matching wasn't spelled out in the task by name but follows
    directly from "check for a valid session before acting": a session check
    that doesn't confirm *whose* session it is isn't a real access control.
    `users` gets two new nullable columns (`auth_user_id`, `pin_hash` — see
    Data model above) via a new migration, applied via the existing
    `scripts/run-migration.ts` direct-Postgres path (same as every migration
    this project has run — Supabase CLI still isn't authenticated in this
    environment). `POST /users` is now recipient-only — `role: "sender"` is a
    `400` pointing at `POST /auth/signup` instead, since this route has no way
    to create the Supabase Auth account a real sender now needs; its insert
    also switched from an implicit `select()`-all to an explicit column list,
    so it can never accidentally return the new `pin_hash`/`auth_user_id`
    columns even as `null`. `bcryptjs` (pure JS, no native build step) added
    as a dependency for PIN hashing (cost factor 10) — plaintext PINs are
    never stored or logged. **Checked, not assumed, before building anything:**
    whether the "Email" auth provider was even enabled on this Supabase
    project — it already was (confirmed by actually creating a throwaway user
    and signing in with a password, both succeeding, before writing a line of
    the signup endpoint), so no dashboard configuration change was needed.
    **Explicitly not built this sync, flagged as known gaps, not oversights —
    see "Still open" #13 for detail:** password reset, multi-factor auth, rate
    limiting on `/auth/*`, session refresh hardening.
    **Verified live, in your exact order:** real signup via Supabase Auth (a
    real `auth.users` row plus a linked `users` row, confirmed via a real
    access token being usable afterward, not just a `201`); set a PIN;
    verified the correct PIN (`success: true`); verified an incorrect PIN
    (`success: false`); confirmed an unauthenticated request to a protected
    endpoint (`GET /balances/:userId`) now `401`s instead of succeeding, where
    it previously would have; confirmed a valid session for the *wrong* user
    gets `403`, not the other user's data. All endpoints re-typechecked
    (`tsc --noEmit`) clean after the change. Test accounts and rows created
    during verification were deleted afterward — including confirming
    `auth.users` deletion actually cascades to the linked `users` row via the
    new FK's `on delete cascade`, live, not just by reading the migration.

16. **Frontend real-auth UI — Revolut-style signup + PIN fast-unlock, closing
    out "Still open" #12.** Two new backend endpoints (`POST /auth/refresh`,
    `POST /auth/logout` — proxies over Supabase's own refresh grant and
    admin sign-out, no custom token scheme) plus five new frontend pieces:
    `lib/kobo/auth.ts` (session storage — one `localStorage` key holding the
    real Supabase-issued tokens as-is, transparent refresh with in-flight
    de-duping, pub-sub for session-changed), `auth-gate.tsx`
    (loading/signup/login/pin-setup/pin-unlock/unlocked state machine, in
    front of `KoboApp`), `signup-dialog.tsx`, `login-dialog.tsx`,
    `pin-setup-dialog.tsx`/`pin-unlock-dialog.tsx` (same numeric-keypad visual
    language as the existing `PasscodeDialog`, not a new one). A sender's
    `wallet_address` (required by signup, never actually read by any send —
    confirmed in code, only a recipient's is) is generated client-side
    (`generatePlaceholderWalletAddress`, `lib/kobo/solana.ts`) rather than
    asked of the user — real friction for zero function otherwise. `KoboApp`
    now takes an optional `authUser`/`onLogout`; mock mode is untouched
    (`AuthGate` renders `KoboApp` directly, no gate, matching the existing
    test suite which renders it bare). `NEXT_PUBLIC_KOBO_SENDER_ID` is fully
    deleted (code and `.env.example`) — confirmed zero remaining functional
    reads, only historical doc mentions.
    **Verified live** (Playwright, persistent profile so `localStorage`
    survives real page reloads): real signup -> PIN set -> reload -> PIN
    screen (not full login) -> wrong PIN rejected generically -> correct PIN
    unlocks -> a real `POST /transfers` with the real session succeeded
    (`200`, real `solana_tx_signature`, sender pre-credited via
    `creditBalance` for the test since a fresh signup has `0` balance) ->
    logout -> `POST /auth/logout` `200` and the old access token immediately
    stopped working -> reload -> full login required again, not PIN. Test
    account and its transfer/balance rows deleted afterward.

17. **Settings page — real profile management, backend + frontend.** Per
    `KOBO_BUILD_PLAN.md`'s "New pages" → Settings. **Investigated first, per
    instruction:** no existing endpoint returned a sender their own `email`
    or `created_at` (`POST /auth/login`'s `user` omits both; `requireAuth`
    only attaches the raw Supabase Auth user), so `GET /auth/me` was needed
    and added — not assumed. Three new `/auth/*` endpoints (own section
    above): `GET /auth/me` (full profile incl. email + member-since),
    `PATCH /auth/profile` (name/country, own row only, same
    `resolveKoboUser` → `.eq("id", …)` ownership pattern as `POST /auth/pin`),
    `POST /auth/password` (Supabase `admin.updateUserById`, current-password
    re-entry check via a fresh `signInWithPassword`, current session revoked
    on success). Frontend: new `components/kobo/settings-screen.tsx` (wired
    into `kobo-app.tsx` at `SETTINGS_INDEX`, replacing the "isn't built yet"
    stub — matching how `RecipientsScreen` is wired), `getProfile()`/
    `updateProfile()`/`changePassword()` in `lib/kobo/api.ts` (mock-gated
    exactly like every other real call — mock mode has a real-shaped
    `mockProfile`/`mockPassword` so a mock demo of Settings behaves like the
    real thing), `updateStoredUser()` in `lib/kobo/auth.ts` + an `AuthGate`
    tweak so a profile edit refreshes the header name without a reload.
    **Logout reuses the existing flow, not a duplicate:** the header's
    inline "Log out?" `AlertDialog` was extracted to a shared
    `components/kobo/logout-confirm-dialog.tsx` used by both the header and
    Settings; both call `AuthGate`'s same `onLogout` (→ `POST /auth/logout`).
    **Deliberate scope calls, flagged:** (a) **email change deferred** — it
    needs a real confirmation email (free-tier send limits; the build plan
    already scopes an email-sending integration as a separate later task);
    Settings shows the email read-only with a "contact support" line, clearly
    not silently unchangeable. (b) **Wallet copy** — the Settings "Linked
    address" section labels the sender `wallet_address` accurately as an
    address that "isn't used to hold or move your money" (Kobo sends from its
    pooled wallet), kept "in case direct wallet payouts are added later" —
    plain language chosen to avoid implying custodial significance it doesn't
    have; flagged for copy review.
    **Verified live** (backend via real accounts against the running API,
    deleted afterward — `auth.users`→`users` cascade re-confirmed; frontend
    via `tsc --noEmit` clean + the full vitest suite, incl. a new
    `settings-screen.test.tsx` and an updated `nav-and-tabs.test.tsx`; no
    browser extension available this session for a Playwright pass): updated
    a name (persisted, re-read via `GET /auth/me`); changed a password and
    confirmed the old token + old-password login both `401` and the
    new-password login `200`s; viewed wallet + account details (real email,
    country, June-2026-style member-since); logout-from-Settings ends the
    session (`401` after).

18. **Activity page — real market data + real transfer history.** Per
    `KOBO_BUILD_PLAN.md`'s "New pages" → Activity. Backend: `GET
    /market/overview` (CoinGecko `/coins/markets` proxied through a 90s
    in-memory cache — `backend/src/lib/market.ts`; **keyless, no Demo API key,
    checked per instruction:** the backend cache alone pins usage to <1
    upstream call/min, well under the ~5-8/min keyless ceiling) and `GET
    /transfers` (list own history, session-gated, `recipient_name` joined from
    `users` — no new columns). Frontend: `components/kobo/activity-screen.tsx`
    wired at `ACTIVITY_INDEX`, replacing the last "isn't built yet" stub.
    Sections: a live SOL ticker (`lib/kobo/jupiter.ts` — Jupiter `price/v3`
    **direct client call, keyless, no proxy**), a market card
    (`GET /market/overview` — SOL/USDC EUR price, 24h & 7d change, inline-SVG
    7-day sparkline, no charting library), an understated "Your sending" stat
    strip (transfers completed / total sent / people reached — derived from
    real history; **no points/badges/leaderboards**, per the anti-gambling
    constraint), and the real transfer history list (reuses the
    `RecentTransfers` visual style). **Every data source degrades cleanly:**
    market `null`/`503` → "Market data is unavailable" card; `stale: true` →
    "Prices may be delayed" hint over last-good data; Jupiter fail → "SOL price
    unavailable"; history fail → inline "Couldn't load your transfers · Try
    again". No news section — no genuinely free keyless source found, so none
    added.
    **Verified live** (real signup + real PIN + a disclosed `creditBalance`
    testing shortcut standing in for a Transak top-up + **two real €0.05
    on-chain sends**, then Playwright with that real session): `GET
    /market/overview` `200` with SOL ~€92 / real 24h+7d change / 168-point
    sparkline, cache confirmed (rapid calls → one upstream hit); Jupiter direct
    call `200` (SOL ~$107); `GET /transfers` `200` returning both real sends
    with `recipient_name: "Adaeze Okonkwo"`, `status: "confirmed"` — rendered
    correctly as "Delivered" rows, stats showing "2 / €0.10 / 1 person". `tsc`
    + `eslint` clean; `nav-and-tabs.test.tsx` updated ("every nav item opens a
    real screen") + a new Activity test. Test account deleted afterward.
19. **Recipient wallet-by-email via Crossmint — backend + frontend.** Solves
    the real adoption barrier flagged in `KOBO_BUILD_PLAN.md`: `POST /users`
    used to hard-require a recipient to already own a Solana address. Backend:
    `backend/src/lib/crossmint.ts` (`resolveRecipientWallet(email)`,
    explicit GET-then-POST against Crossmint's Wallets API,
    `POST/GET https://staging.crossmint.com/api/2025-06-09/wallets`,
    `chainType: "solana"`, `type: "mpc"`, `owner: "email:<email>"` —
    idempotent on that owner locator per Crossmint's docs and their own
    `regulated-payouts-quickstart` reference repo). `routes/users.ts` now
    accepts `email` as an alternative to `wallet_address` for `role:
    "recipient"` — see the section above for the full request/error shape.
    Frontend: `add-recipient-dialog.tsx` makes email the primary field, with
    a "paste a Solana address instead" toggle for recipients who already
    have a wallet — both paths call the same `createUser()`
    (`lib/kobo/api.ts`), which now sends whichever of `email`/`wallet_address`
    the form collected. `CreateUserRequest.wallet_address` is now optional.
    Deliberately untouched: `settleTransfer()`, `POST /transfers`, `POST
    /funding`, the pooled backend wallet, everything MoonPay — this only
    changes how a recipient's `wallet_address` gets set.
    **Custody, stated plainly:** this is Crossmint-custodial in practice, not
    non-custodial — see the note in `POST /users` above. Don't call it
    non-custodial in anything user-facing.
    {{CROSSMINT_VERIFICATION_PLACEHOLDER}}
20. **Funding Rail Abstraction — Phase 1, backend only.** Per the founder's
    explicit brief: build the abstraction around the real differences between
    rail *kinds* (hosted-session / reconciled / treasury), add explicit rail
    identity, make `creditBalance()` atomic, fix the hidden Transak pricing
    coupling, establish backend test coverage (previously zero) — without
    implementing Coinbase/SEPA/Stripe and without touching `solana.ts`,
    `settlement.ts`, `transfers.ts`, `routes/transfers.ts`, `moonpay.ts`, or
    `transak.ts`.

    **Note on how this landed:** most of this phase's code (`lib/rates.ts`,
    `lib/funding-repo.ts`, the migration, the atomic-credit function, the
    rail type/routing changes, the vitest setup) was already present,
    uncommitted, in the working tree when this sync began — done by a
    separate session/tool working the same repo (a `.spettro/` directory,
    unrelated to Kobo's own code, was the only trace of what did it). It was
    inspected, not assumed correct: the migration had never actually been
    applied to the real DB (`credit_balance` didn't exist yet — applied via
    `scripts/run-migration.ts` and verified live under real `Promise.all`
    concurrency); a real bug was found and fixed (`routes/funding.ts` was
    defaulting a request's `rail` to the hardcoded string `"moonpay"`
    independent of `ONRAMP_PROVIDER`, so with `ONRAMP_PROVIDER=transak` the
    row would misrecord its own rail); the founder-mandated "provider/rail
    mismatch" protection didn't exist in `handleFundingWebhook` at all and was
    added; a stale bad import path in a test helper was fixed; a real
    `credit_balance` RPC test-suite mismatch (`p_amount`/`p_user_id` argument
    order) was resolved by applying the migration rather than editing tests to
    match a broken function; and a `501`-vs-`502` gap (an unimplemented rail
    was falling through to a generic provider-failure response, writing then
    immediately failing a `funding_requests` row) was closed with an
    early rail-implementability check. Full test suite (38 tests, `tsc`
    clean) written/completed and run for real — see below.

    **Backend, what actually changed:**
    - `backend/src/lib/onramp.ts` — `FundingRail` (5-value type: `moonpay` |
      `transak` | `coinbase` | `sepa` | `stripe`) and `FUNDING_RAILS`
      alongside the existing `OnrampProvider`/`ONRAMP_PROVIDER`.
      `createOnrampSession()` gained an optional `rail` param (defaults to
      `ONRAMP_PROVIDER`, exact pre-Phase-1 behavior when omitted) and throws a
      clear message for a recognized-but-unimplemented rail. New
      `IMPLEMENTED_RAILS`/`isImplementedRail()` — the real/reserved split
      (only `moonpay`/`transak` work; the other three are known to the type
      system and the DB constraint, nothing else).
    - `backend/src/lib/funding-repo.ts` (new) — `FundingRequestDb` interface
      + the real Supabase-backed implementation (`fundingDb`), covering
      `insert`/`getById`/`updateSession`/`claim`/`markFailed`. Existing
      PostgREST calls relocated here unchanged in behavior; the point is
      making the lifecycle (claim-once semantics) injectable for tests.
    - `backend/src/lib/rates.ts` (new) — `getMarketRate()`, the new
      provider-neutral rate-source boundary. Delegates to
      `lib/transak.ts`'s `getMarketRate` (**unchanged, not touched** — same
      Transak public quote call as before, so pricing behavior is identical).
      `routes/funding.ts` and `routes/rate.ts` now import from here, not from
      `lib/transak.ts` directly.
      **What this does and does not fix:** it decouples the *import
      boundary* (a future non-Transak rate source can be swapped in behind
      this one function with no caller changes) and it's already true that
      `getMarketRate` never read `ONRAMP_PROVIDER` — rate retrieval has never
      actually depended on which provider is *selected*. What it does **not**
      do: `lib/rates.ts` still transitively imports `lib/transak.ts`, whose
      module-level guard requires **both** `TRANSAK_API_KEY` and
      `TRANSAK_API_SECRET` to be set, even though price-quoting only ever
      uses the key. Removing that would mean splitting `lib/transak.ts`,
      which the founder's explicit preserve-list puts out of scope this
      phase — flagging this honestly rather than pretending the credential
      coupling is gone. Tested in `rate-source.test.ts`.
    - `backend/src/lib/balances.ts` — `creditBalance()` is now one atomic
      Supabase RPC call (`credit_balance`, see migration below) instead of a
      read-then-upsert. `debitBalanceIfSufficient()` is **unchanged** (already
      race-safe via its conditional `UPDATE ... WHERE usdc_balance >= amount`
      — its doc comment's "not solved here" note about a concurrent credit
      racing it is now moot, since the credit side is atomic too).
    - `backend/src/routes/funding.ts` — accepts optional `rail` in the
      request body (`parseRail()`, exported for direct testing); rejects an
      unknown value with `400`, a recognized-but-unimplemented one with `501`
      (checked before any rate quote or DB write); resolves the effective
      rail **once** and reuses it for both the `funding_requests` insert and
      the `createOnrampSession` call (the bug fix above). Response and `GET
      /funding/:id` now include `rail`.
    - `backend/src/routes/webhooks.ts` — `handleFundingWebhook` is now
      exported, takes an injectable `db: FundingRequestDb` (defaults to the
      real one — tests pass `FakeFundingDb`), and requires `opts.expectedRail`
      to match the funding request's own `rail` or rejects with `409` before
      ever claiming/crediting. Both webhook routes pass their own literal
      rail (`"transak"`, `"moonpay"`).
    - `backend/supabase/migrations/20260830180000_add_funding_rail.sql` — adds
      `funding_requests.rail` (text, `check` against the 5 known values,
      default `'moonpay'`), expands the `status` check constraint to add
      `awaiting_reconciliation` / `manual_review` / `payout_pending` (reserved
      for SEPA/Stripe, not produced by any code path yet — hosted-session
      rails still only ever use `pending`/`confirmed`/`failed`), and creates
      the `credit_balance(p_user_id, p_amount)` Postgres function (`security
      definer`, `set search_path = public`, single `INSERT ... ON CONFLICT
      (user_id) DO UPDATE SET usdc_balance = balances.usdc_balance +
      p_amount`).
    - `backend/supabase/migrations/20260830180100_backfill_funding_rail_from_session.sql`
      (new, added during this review) — the first migration's `default
      'moonpay'` backfill was wrong for the 11 real historical rows that
      actually went through Transak before the MoonPay switch (identifiable
      because only Transak ever populated `onramp_session_id` — MoonPay's is
      always `null`). This corrects those specific rows. Verified against the
      real table: 47 `moonpay` / 11 `transak` post-correction, zero rows where
      session-presence disagrees with `rail`.

    **Backend test suite (new — `backend/package.json` gained `vitest`,
    `supertest`, `cross-env`; `npm test` / `npm run test:db`):**
    `backend/src/test/` — `parse-rail.test.ts` (6, fast, no DB — valid/invalid
    rail parsing), `onramp-selection.test.ts` (4, fast, mocked provider
    modules — MoonPay/Transak routing compatibility + the unimplemented-rail
    throw), `funding-repo.test.ts` (8, fast, in-memory `FakeFundingDb` —
    claim-once semantics, the new status vocabulary), `funding-webhook.test.ts`
    (8, fast, `FakeFundingDb` + mocked `creditBalance` — settlement, duplicate
    settlement, concurrent double-delivery, both directions of provider/rail
    mismatch, credited-amount preference), `rate-source.test.ts` (3, one real
    network call — provider-independence + the import-boundary regression
    guard), `balances-live.test.ts` (4, opt-in `RUN_DB_TESTS=1`, real Supabase
    — atomic credit under real `Promise.all` concurrency, debit-never-overdraws),
    `funding-route.test.ts` (5, opt-in `RUN_DB_TESTS=1` + `DEV_SKIP_AUTH=true`,
    real Express app + real Supabase + real MoonPay URL-building, self-cleaning
    — valid rail selection, invalid rail, the new 501 path with zero rows
    written, rail-matches-session regression guard, and an explicitly
    **documented, not fixed** creation-time duplicate: submitting the same
    intent twice today still creates two independent `pending` rows — no
    idempotency key on `POST /funding` itself exists, out of this phase's
    explicit scope, flagged rather than silently left).
    **Verified live:** `tsc --noEmit` clean; default suite 29/29 passed, 9
    skipped (the opt-in live ones); `RUN_DB_TESTS=1` suite **38/38 passed**,
    real concurrency proven against real Postgres, real HTTP requests against
    a real Express app + real Supabase + a real MoonPay widget URL, all test
    rows cleaned up (`funding_requests` count unchanged before/after: 58).
    No `eslint`/lint tooling exists for `backend/` at all (frontend-only) —
    nothing to run there.

    **Remaining risks, not fixed this phase (by design or explicitly out of
    scope):**
    - No idempotency key on `POST /funding` creation — double-submission
      creates duplicate `pending` rows (harmless today: nothing charges until
      a webhook confirms one of them, and the DB-level webhook claim already
      prevents a double-credit even from a duplicate row — flagged for a
      future decision, not silently patched over).
    - `lib/rates.ts` still requires `TRANSAK_API_SECRET` to be set even for a
      MoonPay-only deployment (see the `lib/rates.ts` note above) — the import
      *boundary* moved, the credential *coupling* didn't, because removing it
      means touching `transak.ts`, explicitly out of scope this phase.
    - `funding_requests.rail`'s `check` constraint currently only recognizes
      the 5 known names; the DB has no concept of rail *kind*
      (hosted-session/reconciled/treasury) — that distinction lives only in
      `lib/onramp.ts`'s (TypeScript-only) `IMPLEMENTED_RAILS` list. Fine while
      only hosted-session rails exist; Phase 3 (SEPA) will need to decide
      whether `RAIL_KIND` becomes a real column or stays code-only.
    - The Kraken-style rail-selection UX (item 1 of the founder's brief —
      "Card" / "Bank transfer" instead of provider names) has **zero frontend
      work done** — `rail` is accepted by the API but nothing sends it yet.
      Deliberately deferred per item 13 ("no frontend redesign this phase").

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

6. **RESOLVED — see "Resolved this sync" #15.** ~~No auth on any backend
   route.~~ Real Supabase Auth sessions now gate every sender-facing endpoint,
   and `sender_id`/`:userId` are checked against the caller's own linked
   account, not trusted from the client. Left in place (not deleted) for
   history — the previous open question is quoted below.
   > Every endpoint is fully open right now — `sender_id` is just whatever the
   > client sends. Not necessarily wrong for this stage, but worth a conscious
   > decision on when auth gets added rather than building further on top of
   > an implicit "trust the client" model.

7. **RESOLVED, stale item — corrected while touching this doc for #15, not
   this sync's own work.** ~~No CORS middleware on the backend.~~ It exists
   (`app.use(cors({ origin: frontendOrigin }))`, `backend/src/index.ts`) —
   this item was never marked resolved when that landed, in an earlier sync
   this doc didn't catch up to. Left in place (not deleted) for history — the
   previous open question is quoted below.
   > Calling any of these endpoints from a browser at the frontend's origin
   > will currently be blocked. Needs to be added (and now can target the
   > frontend's real origin — confirmed as `http://localhost:3000` for dev,
   > see Resolved #2).

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

11. **RESOLVED — see "Resolved this sync" #14.** ~~Frontend not wired to real
    sender balance funding + instant send.~~ Add Funds, the rewired instant-send
    flow (new in-app confirmation dialog, no more Transak checkout for a send),
    and the real sidebar balance are all built and verified live. Left in place
    (not deleted) for history — the previous open question is quoted below.
    > The backend half landed this sync (`POST /funding`, rewritten
    > `POST /transfers`, extended `POST /webhooks/onramp` — see "Resolved this
    > sync" #12) and was explicitly scoped as backend-only; the frontend was
    > deliberately not touched. Concretely still needed: an Add Funds flow
    > calling `POST /funding` [...]; `createTransfer()` needs to drop the
    > now-always-absent `onramp` field, and `kobo-app.tsx` needs to stop
    > assuming `POST /transfers` always returns a widget session to open [...];
    > sidebar balance display ("Still open" #8, resolved on the backend side)
    > still needs its actual frontend wiring decided/built [...].

12. **RESOLVED — see "Resolved this sync" #16.** ~~Frontend not updated for
    real auth yet.~~ Signup/login/PIN UI built, `NEXT_PUBLIC_KOBO_SENDER_ID`
    deleted, every protected call now sends a real `Authorization` header.
    Left in place for history — the previous open question is quoted below.
    > The frontend still uses the hardcoded `NEXT_PUBLIC_KOBO_SENDER_ID`
    > demo-sender scheme and sends no `Authorization` header on any request.
    > Every real-mode call to `POST /transfers`, `GET /transfers/:id`,
    > `POST /funding`, `GET /funding/:id`, or `GET /balances/:userId` will
    > now `401` until the frontend does real signup/login, stores the
    > returned tokens, and sends `Authorization: Bearer <access_token>`.
    > Mock mode is entirely unaffected (it never calls the real backend).

13. **PIN reset has no separate flow — deliberately, not an oversight.**
    `POST /auth/pin` always overwrites any existing PIN for the caller; there's
    no dedicated "forgot your PIN" path. This is fine *because* it requires a
    full valid Supabase session to call at all — by the time someone can hit
    it, they're already past real email+password auth, so re-setting the PIN
    is just normal authenticated account management, not a security-sensitive
    recovery flow. What's explicitly **not built** (per this sync's scope):
    password reset (forgot-password email flow), multi-factor auth, rate
    limiting on any `/auth/*` endpoint, and session refresh hardening (the
    frontend gets a `refresh_token` back from signup/login but nothing here
    enforces rotation/reuse-detection on it). Flagged as known gaps, not
    silently absent — revisit before this handles real user funds beyond a
    demo/pilot.
