# Kobo — Phase 1: Mock to Real Build Plan

*Scope: everything up to, but not including, off-ramp. Off-ramp remains Phase 2, gated on a licensed partner, per the original Technical Build Plan. This document does not change that.*

*Purpose: shared reference for both Person A (frontend) and Person B (backend) Claude Code sessions, going forward from Day 7 to Demo Day and slightly beyond.*

---

## 0. Ground rules (read before running any prompt from this doc)

- **No off-ramp work.** Not a database column, not a UI screen, not a mention in a prompt. Still Phase 2.
- **Auth in this document means "real enough for a small pilot," not production-grade.** Session-based auth via Supabase Auth (already in the stack), correctly enforced on real endpoints. Not: rate-limiting infrastructure, refresh-token rotation policies, SOC2-grade session management. That's a later, separate project.
- **KYC in this document is planning only.** Per the original plan, real identity verification is explicitly "beyond Phase 1" — after Demo Day, with real usage data. Nothing here should result in a KYC *feature* being built this week. It results in a written-down decision for later.
- **Design polish (Person A) must not break working functionality.** Anything wired to the real backend (recipient creation, transfers, balances once wired) keeps working exactly as-is while visual/animation layers are added on top.
- **Every session pulls latest main first.** No exceptions, given how fast both sides have been moving.

---

## 1. Where things actually stand (as of this doc)

**Backend, real and tested:**
- `POST /users`, `POST /transfers`, `GET /transfers/:id`, `GET /balances/:userId`, `POST /webhooks/onramp` (Transak JWT-verified), `GET /rate` (real Transak quote), `POST /funding` (NEW)
- Real Solana devnet settlement, real Transak staging sessions, retry/idempotency/failure handling — now shared via `settleTransfer()` between the webhook path and `POST /transfers`' new instant-send path, not forked
- Real sender balance funding + instant send: `POST /funding` tops up a sender's real balance via Transak (lands in Kobo's pooled wallet), `POST /transfers` is now balance-checked and sends instantly when funded (no more per-transfer Transak session) — see API_CONTRACT.md "Resolved this sync" #12 for full detail, verified live end to end (fund → real balance increase → instant send → real Solana tx → real balance debit/credit → insufficient-balance 400)
- CORS, UUID validation on transfer endpoints

**Frontend, real and tested:**
- Real onramp shape consumption, real `GET /transfers/:id` polling (not postMessage-trusting)
- `failed` status UI wired to real backend data
- "Add new recipient" now calls real `POST /users` — tested live via Playwright, confirmed in Supabase
- The default/pre-selected recipient ("Adaeze Okonkwo") is now a real `users` row too — a fresh page load can send a real transfer using only default state, no prior "add recipient" action needed
- Add Funds (sidebar button, previously inert) now calls real `POST /funding`, reuses the existing Transak widget components, and polls real `GET /funding/:id` — sidebar balance updates live off the real result
- Send no longer touches Transak at all: real balance-checked, instant `POST /transfers` behind a new in-app confirmation dialog (recipient/amount/fee/ETA), same passcode gate and success/failed polling as before — see API_CONTRACT.md "Resolved this sync" #14 for full detail, verified live end to end (fund → sidebar balance moves → instant send within balance, no Transak popup, real Solana tx → over-balance amount cleanly blocked, not a raw error)

**Still mock, in priority order:**
1. ~~Sender identity~~ — RESOLVED. CURRENT_USER now carries a real users.id (role:
   "sender"), wired via NEXT_PUBLIC_KOBO_SENDER_ID. See API_CONTRACT.md for detail.
2. ~~Balance display~~ — RESOLVED, both halves. Sidebar (and `SendAmountCard`'s
   balance line, and the amount-exceeds-balance check) now read the real
   `GET /balances/:userId` figure, converted to whichever currency is selected
   using the same live rate the header ticker already holds. The old static
   `BALANCES` fixture is deleted. See API_CONTRACT.md "Resolved this sync" #14.
3. No auth anywhere — any client can call any endpoint as any user
4. ~~Wallet input placeholder copy~~ — RESOLVED, copy fixed to reflect Solana
   wallet-address-only input.
5. ~~Header rate ticker ("1 EUR = X USDC")~~ — RESOLVED. Was fully mock
   (`Math.random()`-jittered client-side). Confirmed Transak already exposes a
   public rate quote (no separate rate API needed), added `GET /rate`
   (backend, proxying Transak's Get Price) and wired the frontend to it — same
   `rate` state also feeds the transfer summary panel and success dialog, so
   those are real now too. See API_CONTRACT.md "Resolved this sync" #10.
6. ~~Default/pre-selected recipient~~ — RESOLVED, and this one was a real bug, not
   a mock gap: any user's very first send, using only the app's default state,
   400'd at `POST /transfers` (fabricated recipient id). Now a real `users` row —
   same pattern as every other real-data fix, wired via
   `NEXT_PUBLIC_KOBO_DEFAULT_RECIPIENT_ID`/`_WALLET`. Fixed a related latent bug
   found in the process: `recipient-picker.tsx`'s compact header wallet display
   had no CSS truncation, unlike every other wallet display in the app — harmless
   with short fake addresses, but a real overflow risk once that slot could show a
   full-length real address (which it now does by default). The other three
   pre-seeded recipients (Chidi, Ngozi, Emeka) are still fake — see API_CONTRACT.md
   "Still open" #3 — but they're only reachable by explicitly picking them, not on
   a fresh default send, so lower priority. See API_CONTRACT.md "Resolved this
   sync" #11 for full detail, including the wallet-display-format decision.

**Decided (2026-08-25):**
- Overview / Activity / Settings screens are intentionally stubbed for now. Send
  Money is the demo's focus; these stay as clean "not built yet" placeholders
  through Demo Day rather than half-built. Not a gap to fix this week.
- Recipients are Solana wallet address only — no phone-number-only recipients in
  Phase 1. Placeholder copy corrected. Phone-number-only recipients would require
  Kobo generating and holding a custodial wallet on someone's behalf — a real
  feature with real custody/regulatory implications, contradicting the product
  doc's non-custodial stance. Not being built now.
- **Sender-side "balance" — SUPERSEDED (2026-08-25, later same day) — and now
  fully IMPLEMENTED (2026-08-26), backend and frontend both, verified live.**
  See API_CONTRACT.md "Resolved this sync" #12 (backend) and #14 (frontend) for
  what actually shipped against this plan. Earlier
  decision said the backend had no concept of a sender balance and nothing was
  being invented under time pressure — that stands as accurate for that point in
  time, but is now deliberately being built, not stumbled into. New architecture:
  **Add Funds** opens a real Transak session (same pattern as the existing
  per-transfer flow) that lands real USDC into Kobo's pooled backend wallet and
  credits a real balance row for the sender (generalizing `balances` beyond
  recipient-only). **Send becomes instant** once a sender has sufficient balance:
  an in-app confirmation (recipient, amount, fee, estimated arrival, confirm/
  cancel — no second Transak step), then an internal Solana transfer from Kobo's
  wallet to the recipient's wallet, reusing the exact retry/idempotency/
  confirmation/failure-handling logic already built and tested in Days 5-6 — none
  of that gets weakened or removed. If a sender's balance is insufficient, they're
  prompted to Add Funds first — no parallel/legacy per-send Transak path is being
  kept alongside this.
- **Custody note, stated plainly, not glossed over.** This introduces a
  pooled-custody ledger model — Kobo's backend wallet holds real funds on behalf
  of users between top-up and send, standard for neobank-style products (Revolut,
  Wise) but a step beyond the pure pass-through framing in the product doc's
  Section 5. Worth keeping in mind for any future compliance conversation, same
  category as the phone-number-wallet custody question flagged earlier.
- **Email confirmation / proof-of-payment receipt** — good idea, explicitly out
  of scope for this task. Requires a new email-sending integration, not something
  today's pieces cover. Scoped as the next feature after this one lands.
- Recipient balance display, EUR-equivalent shown, is a real and properly scoped
  next feature — not the sidebar fix. A recipient does accumulate a real USDC
  balance post-transfer. Decision: display it converted to EUR-equivalent, friendly
  like MetaMask's fiat display, not hiding the underlying USDC entirely. Needs a
  new recipient-facing screen (doesn't exist yet) and reuse of the app's existing
  live exchange rate source — this dependency is no longer aspirational: `GET /rate`
  (real, Transak-backed, see "Still mock" #5 above) exists now and is exactly the
  reusable source this feature needs, not a new one. Scoped as its own separate
  task — currently on hold pending confirmation it's needed for the Demo Day
  script.

---

## 2. Immediate priority queue (today, in order)

1. ~~Wire the real sender~~ — done.
2. ~~Wire real balance display~~ — done, both backend (real sender balances via
   `POST /funding`) and frontend (sidebar + `SendAmountCard` wired to it).
3. **Day 7 joint run-through** — first time this is genuinely possible end-to-end
4. Then Days 8–9 polish, Days 10–11 rehearsal + fallback video, per the original plan — unchanged

---

## 3. Backend / server / network / database roadmap

### 3a. Sender wiring (today)
Same shape as the recipient fix: a real `POST /users` call with `role: "sender"`, replacing `CURRENT_USER` mock data. Backend needs no new endpoint — `POST /users` already accepts `role: "sender"`.

### 3b. Balance wiring (today)
Frontend swaps mock sidebar balance for a real `GET /balances/:userId` call against the real signed-in user. Backend needs no changes — endpoint is built and tested.

### 3c. Real auth — now being built, not deferred (superseded 2026-08-26)

Earlier scope said auth was minimal/deferred. Decision: build it for real now, Revolut-style, free-tier only (no paid API/service spend).

- **Signup**: real email + password via Supabase Auth (already the stack's chosen auth layer, free at this scale). Creates a real `auth.users` row; `users` table gets a foreign key to it, replacing the single hardcoded `NEXT_PUBLIC_KOBO_SENDER_ID` demo-sender scheme entirely.
- **PIN**: set once right after signup. The PIN is NOT the account credential — it's a fast-unlock layer on top of an already-real, already-authenticated Supabase session (same pattern as Revolut/banking apps: full login once, PIN/biometric to reopen quickly after). Stored server-side, hashed, verified via a real endpoint.
- **Persistence**: a valid session persists locally (same device/browser) so returning users see the PIN screen, not full email/password, matching the "first time = full signup, after that = just PIN" flow described.
- **Mobile-ready**: this pattern (real session + local fast-unlock) carries forward cleanly to a future native mobile app without rearchitecting.
- Sequenced: backend auth foundation first (everything else depends on it), then frontend PIN UI, then Settings (needs real accounts to manage), then Overview (independent), then Activity (market data, last — most exploratory).

### New pages (2026-08-26)
- **Overview**: clean, mostly-static product page — offerings, solutions, vision. No backend dependency.
- **Settings**: profile, email, password change, wallet, logout, account details, support. Depends on real auth existing.
- **Activity**: a gamified crypto/stablecoin performance view — real market data (free-tier APIs only: CoinGecko public API, Jupiter's Solana price feed — no paid keys), plus the user's real transfer history (already exists as data). Kept simple, not overwhelming — charts/prices/news alongside real transfers, not a full trading dashboard.
- **Recipients**: already good, no changes needed right now.

### 3d. Database
- Revisit the earlier-flagged `wallet_address` uniqueness gap (multiple `users` rows sharing one wallet, discovered during the balances health check) — decide now whether to add a uniqueness constraint, since auth work will touch this table anyway.
- No new tables needed for anything in this document short of what auth requires (Supabase Auth manages its own user table; your `users` table needs a foreign key link to it).

### 3e. Server / network
- Confirm environment variables are fully documented for a fresh deploy (not just fresh local clone) — this matters once you're past local dev for rehearsal days.
- CORS origin should move from a hardcoded localhost default to something that can also accept a real deployed frontend URL once one exists (Vercel, etc.) — keep both allowed during the transition, not a hard swap.

---

## 4. KYC — planning only, not building

Per the original Technical Build Plan, this is explicitly **beyond Phase 1**. Do not build a KYC feature this week. What's worth deciding *on paper* now, so it's not a blank page later:

- **Likely path:** Transak (your on-ramp provider) already performs KYC on the sender side as part of their own compliance — worth explicitly confirming what tier of KYC their staging/production flow requires, since you may already be partially covered without building anything yourselves.
- **Recipient-side KYC** is the harder open question — no provider is doing this for you today, since off-ramp (where it'd typically be required) is Phase 2.
- **Decision to make later, not now:** whether recipient KYC becomes a Phase 2 requirement tied to the eventual off-ramp partner, or something Kobo needs independently sooner. Revisit after the closed pilot, with real usage data — exactly as the original plan already says.

---

## 5. Frontend design roadmap (Person A)

Scope: visual and motion polish layered on top of the now-real functionality, not a rebuild.

- Framer Motion (or similar) for transitions/micro-interactions on: transfer status changes (`pending → onramp_complete → sent → confirmed`), recipient add success, balance updates.
- Loading states for every real network call now in place (`POST /users`, `POST /transfers`, `GET /transfers/:id` polling, `GET /balances/:userId`) — this is literally Days 8–9 in the original plan, now unblocked.
- Design system consistency check — confirm nothing added during the mock-to-real wiring (disabled button states, inline error text) drifted from the existing visual language.
- **Explicitly not in scope for this pass:** new screens, new flows, restructuring existing components — this is a polish pass on real, working functionality, not a redesign.

---

## 6. What "done" looks like before Demo Day (unchanged from original plan)

- Day 7: joint run-through, real sender + real recipient + real transfer + real balance, fix what breaks
- Days 8–9: loading/error states, visual polish
- Days 10–11: twice-daily rehearsal, pre-staged fallback (recorded video + pre-confirmed on-chain tx)
- Days 12–13: bug fixes only, no new features
- Day 14: Demo Day

---

## 7. After Demo Day (not this week — reference only)

Real closed pilot, repeat-usage/hold-time tracking, KYC decision revisited with real data, off-ramp partner conversations continuing in parallel, auth hardened toward production. Content/community/GTM strategy belongs here — after real usage signal exists, not before.
