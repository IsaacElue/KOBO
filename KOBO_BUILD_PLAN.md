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

**On-ramp provider — MoonPay (Ramp Network pending confirmation).** As of this
sync `POST /funding` builds a **MoonPay** widget URL, not Transak. Backend keys
in place, sandbox verified end to end: signed `https://buy.moonpay.com?…` URL
renders from an Ireland IP, `POST /webhooks/moonpay` verifies MoonPay's
`Moonpay-Signature-V2` and credits the real delivered USDC amount, idempotent /
replay-safe. Transak's code path is **kept intact and re-selectable** via
`ONRAMP_PROVIDER=transak` — the swap is one env var, no code change, in case
Ramp Network comes back with Ireland/SEPA + access confirmed before Demo Day.
`POST /funding` request/response contract is unchanged (`onramp: { sessionId,
widgetUrl }`) — see API_CONTRACT.md "Latest addition (on-ramp provider →
MoonPay)". **Frontend (Shina):** widget origin is now `buy.moonpay.com` and
MoonPay's redirect/postMessage signals differ from Transak's — the
`onramp-transak.ts` handoff needs a MoonPay equivalent.

_Confirmed against MoonPay's live sandbox API/docs:_ `usdc_sol` is the exact
Solana-USDC code (mint `EPjF…Dt1v`) but has **no sandbox support** — local
testing uses `pyusd_sol` as a stand-in, one env flip (`MOONPAY_CRYPTO_CURRENCY_CODE`)
to go live. EUR + SEPA is a valid quote combination and Ireland is
`isBuyAllowed`. _Still to eyeball manually_ (blocked on MoonPay account sign-in,
which needs a real email OTP): SEPA vs card actually shown in the widget's
payment-method screen, and whether a sandbox card purchase auto-completes vs
needs a dashboard release — the webhook handler keys on `status === "completed"`
either way.

**Backend, real and tested:**
- `POST /users`, `POST /transfers`, `GET /transfers/:id`, `GET /balances/:userId`, `POST /webhooks/moonpay` (MoonPay, HMAC-verified) / `POST /webhooks/onramp` (Transak JWT, inactive), `GET /rate` (real Transak quote — provider-independent price feed), `POST /funding`
- Auth: `POST /auth/signup|login|refresh|logout|pin|pin/verify`, plus `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/password` (Settings; API_CONTRACT.md "Resolved this sync" #17)
- Activity: `GET /market/overview` (CoinGecko proxy, cached, keyless — no API key), `GET /transfers` (list own history, session-gated) — NEW; see API_CONTRACT.md "Resolved this sync" #18
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
- ~~Overview / Activity / Settings screens are intentionally stubbed for now.~~
  **Superseded 2026-08-27:** Settings, Overview and Activity are all built now
  (see "New pages" below) — **the app has no "not built yet" stub screens
  left.** Send Money remains the demo's focus.
- ~~Recipients are Solana wallet address only — no phone-number-only recipients in
  Phase 1. Placeholder copy corrected. Phone-number-only recipients would require
  Kobo generating and holding a custodial wallet on someone's behalf — a real
  feature with real custody/regulatory implications, contradicting the product
  doc's non-custodial stance. Not being built now.~~
  **Superseded (2026-08-30):** email-based recipient onboarding is now built —
  `POST /users` accepts `email` as an alternative to `wallet_address`, resolved
  via Crossmint's Wallets API to a real Solana address (`backend/src/lib/
  crossmint.ts`). Pasting an address directly still works unchanged; this is
  additive. **The custody concern this bullet originally raised is real and not
  resolved, just no longer a blocker for shipping the feature — it's disclosed
  instead:** a wallet provisioned this way is Crossmint-custodial in practice
  (Crossmint holds the signing key server-side) until/unless the recipient's own
  device generates a signer, which requires a Crossmint-authenticated surface
  Kobo doesn't have today (recipients still have no login). So this is narrower
  than "non-custodial wallets for recipients" — it's "a recipient no longer needs
  to already own a wallet to be added," which is the actual adoption barrier this
  was solving. Don't describe it as non-custodial anywhere user-facing. See
  API_CONTRACT.md "Resolved this sync" #19 for the full implementation and test
  results.
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
- **DONE (backend + frontend), 2026-08-26:** signup, login, PIN set/verify, session refresh/logout all built and verified live end-to-end (real signup -> PIN -> reload -> PIN unlock -> real transfer -> logout -> reload -> full login). `NEXT_PUBLIC_KOBO_SENDER_ID` fully removed. See API_CONTRACT.md's `POST /auth/*` section.
- Sequenced: ~~backend auth foundation first~~, ~~then frontend PIN UI~~, ~~then Settings~~, ~~then Overview~~, ~~then Activity~~ — **all four pages done.**

### New pages (2026-08-26)
- **Overview**: clean, mostly-static product page — offerings, solutions, vision. No backend dependency.
  **DONE (frontend only, no backend), 2026-08-27.** `components/kobo/overview-screen.tsx` wired at `OVERVIEW_INDEX`, replacing the "isn't built yet" stub. Sections: hero, "What Kobo does" (send / hold / saved recipients), "How it works" (3 steps + the real 0.53% fee note), "Why USDC and Solana" (plain-language, no jargon), "What's coming next" (Phase 2 — cash-out to naira, more corridors, recipient app — badged "not available yet", never implied as live), vision, and a muted footnote that transfers currently settle on Solana's **test** network. Same shell / palette / card chrome / small-caps eyebrows as the rest of the app; the hero CTA jumps to the Send screen. No new deps, no API calls. Note: `max-w-3xl`/`4xl` utilities aren't generated in this Tailwind v4 setup (only `sm`–`2xl`) — used `max-w-[48rem]` for the content column.
- **Settings**: profile, email, password change, wallet, logout, account details, support. Depends on real auth existing.
  **DONE (backend + frontend), 2026-08-27.** `GET /auth/me` + `PATCH /auth/profile` + `POST /auth/password` (new), `components/kobo/settings-screen.tsx` wired at `SETTINGS_INDEX`. Editable: name, country, password (current-password re-entry check; session revoked on change → user re-logs in). Read-only: email, member-since, linked wallet address. **Email change deferred** — needs a confirmation-email integration (free-tier send limits), same reason the receipt/email work is out of scope; shown read-only with a "contact support" line, not silently unchangeable. **Wallet** labelled as an address that "isn't used to hold or move your money" (Kobo sends from its pooled wallet), kept in case direct payouts are added later — plain accurate copy, flagged for review. Logout reuses the header's flow via a shared `logout-confirm-dialog.tsx`. See API_CONTRACT.md "Resolved this sync" #17.
- **Activity**: a gamified crypto/stablecoin performance view — real market data (free-tier APIs only: CoinGecko public API, Jupiter's Solana price feed — no paid keys), plus the user's real transfer history (already exists as data). Kept simple, not overwhelming — charts/prices/news alongside real transfers, not a full trading dashboard.
  **DONE (backend + frontend), 2026-08-27.** Backend: `GET /market/overview` (CoinGecko `/coins/markets` proxied via a 90s in-memory cache — `backend/src/lib/market.ts`; **keyless, no Demo API key** — the backend cache pins usage to <1 CoinGecko call/min, well under the keyless limit; checked, not assumed) and `GET /transfers` (list own history, session-gated, `recipient_name` joined from `users` — no new columns). Frontend: `components/kobo/activity-screen.tsx` at `ACTIVITY_INDEX` — a live SOL ticker (Jupiter `price/v3` **direct client call, keyless, no proxy**), a market card (SOL/USDC EUR price + 24h/7d change + inline-SVG 7-day sparkline, no charting lib), an understated 3-tile "Your sending" stat strip (**no points/badges/leaderboards** — anti-gambling constraint), and the real transfer history list. Every data source degrades to a clean fallback (unavailable card / "prices may be delayed" / "SOL price unavailable" / retry). **No news section** — no genuinely free keyless source found. Verified live with real signup + two real €0.05 on-chain sends. See API_CONTRACT.md "Resolved this sync" #18.
- **Recipients**: already good, no changes needed right now.

**All four pages (Overview, Recipients, Activity, Settings) are complete as of 2026-08-27.** The `ComingSoonPanel` stub is now unreachable from the nav.

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

---

## 8. Funding Rail Roadmap — a separate initiative from the Demo Day plan above

Everything above (sections 0–7) is the original mock-to-real / Demo Day plan.
This section tracks a **distinct, founder-directed initiative**: making
sender-side funding reliable and provider-independent. MoonPay's widget
signature/IP-verification failure (`verify_widget_signature 400`) is the
immediate trigger — **under active investigation as of Phase 2, not accepted
as an unsolvable external issue.** Whether it's a code bug, an env/config
mismatch, or genuinely account/dashboard-side is being verified with evidence,
not assumed — see the Phase 2 entry below and API_CONTRACT.md for the findings
once they land.

**Roadmap order, as of this sync (superseded the earlier Coinbase-first
sequencing — see the Phase 2A note below):** MoonPay (fix + E2E proof) → SEPA
→ Conversion Engine → Stripe POC → funding UX → money-safety hardening →
observability → production readiness. **Coinbase is ARCHIVED** — technically
viable per Phase 2A's research (see below), but not being built. Its reserved
`FundingRail` type value and DB `check` constraint slot are deliberately kept
(costs nothing, no reason to rip out working groundwork) — just nothing is
wired to it. Do not implement it, do not route any live flow through it, until
explicitly re-prioritized.

**Founder decisions, stated once here so they aren't re-litigated:**
- Provider names (MoonPay, Transak, Coinbase, ...) are never a user-facing
  concept — the eventual UI offers funding *methods* ("Card", "Bank
  transfer"), which map to a `rail` internally.
- The three real rail *kinds* — hosted-session (Coinbase/MoonPay/Transak),
  reconciled (SEPA), treasury (Stripe) — are genuinely different lifecycles
  and must not be forced into one fake common interface just because two of
  them happen to produce a widget URL today.
- Coinbase is the primary production candidate; SEPA is a controlled
  fallback; Stripe Treasury is explicitly experimental/test-mode until
  provider approval and fraud/chargeback design exist.
- USDC on Solana remains the canonical asset, EUR the canonical fiat — a
  funding provider making USD or another chain easier is not a reason to
  drift the product off either.

**Phase 0 (architecture audit) — done.** Full read of the funding lifecycle,
provider abstraction, webhook handling, money-safety posture, and a fit
assessment of Coinbase/SEPA/Stripe against the existing `lib/onramp.ts`
abstraction (verdict: Coinbase fits directly, SEPA and Stripe don't — see the
audit transcript for the reasoning, not reproduced here).

**Phase 1 (funding rail abstraction) — done.** Explicit `rail` identity on
`funding_requests`, expanded status vocabulary for non-instant rails, atomic
`creditBalance()`, the Transak pricing import-boundary fix, and the first
backend automated test suite (previously zero). Coinbase/SEPA/Stripe are
**not implemented** — only their names and reserved schema/type slots exist.
Full technical detail, exactly what changed and why, and the honest list of
what's still a gap: **API_CONTRACT.md, "Resolved this sync" #20.** Don't
duplicate that detail here — this section is the product-level pointer, that
one is the engineering record.

**Phase 2A (Coinbase Onramp feasibility) — COMPLETE / PASS WITH RISK.
ARCHIVED as of this sync, findings kept as-is, not invalidated.** Research
only, no code/DB touched. Verdict stands: Coinbase is technically a clean fit
for Kobo's settlement shape but not viable as the *primary* Irish funding rail
as documented — no guest checkout for Ireland (hosted widget or its
Headless-API replacement, confirmed US-only), sandbox can't exercise the real
account+KYC Irish journey. **The founder has since reprioritized** — MoonPay
repair now leads, Coinbase is shelved, not because the research changed but
because the roadmap did. Full detail: **COINBASE_FEASIBILITY.md** (repo root,
now carries an ARCHIVED banner pointing here).

**Phase 2 (MoonPay repair + end-to-end funding proof) — IN PROGRESS.** New
top priority. Goal: root-cause the `verify_widget_signature 400` failure with
evidence (not assumption), fix the smallest thing that's actually broken, then
prove the complete funding loop — session → widget → purchase → webhook →
balance credit, exactly once — end to end, covering the failure-mode matrix
(duplicate/out-of-order/delayed webhooks, expired sessions, cancel/fail
outcomes). Investigation findings, fix, and E2E results: **API_CONTRACT.md**
once each step lands; this entry gets a one-line status update, not a
restatement.

**Phases 3–8 (SEPA, Conversion Engine, Stripe POC, funding UX, money-safety
hardening, observability, production readiness)** — not started, in that
order. Each gets its own entry here once it lands.
