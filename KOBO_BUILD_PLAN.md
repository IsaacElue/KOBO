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
- `POST /users`, `POST /transfers`, `GET /transfers/:id`, `GET /balances/:userId`, `POST /webhooks/onramp` (Transak JWT-verified)
- Real Solana devnet settlement, real Transak staging sessions, retry/idempotency/failure handling
- CORS, UUID validation on transfer endpoints

**Frontend, real and tested:**
- Real onramp shape consumption, real `GET /transfers/:id` polling (not postMessage-trusting)
- `failed` status UI wired to real backend data
- "Add new recipient" now calls real `POST /users` — tested live via Playwright, confirmed in Supabase

**Still mock, in priority order:**
1. ~~Sender identity~~ — RESOLVED. CURRENT_USER now carries a real users.id (role:
   "sender"), wired via NEXT_PUBLIC_KOBO_SENDER_ID. See API_CONTRACT.md for detail.
2. Balance display — sidebar still reads local mock data. Investigated and
   deliberately NOT wired — see "Decided" below.
3. No auth anywhere — any client can call any endpoint as any user
4. ~~Wallet input placeholder copy~~ — RESOLVED, copy fixed to reflect Solana
   wallet-address-only input.

**Decided (2026-08-25):**
- Overview / Activity / Settings screens are intentionally stubbed for now. Send
  Money is the demo's focus; these stay as clean "not built yet" placeholders
  through Demo Day rather than half-built. Not a gap to fix this week.
- Recipients are Solana wallet address only — no phone-number-only recipients in
  Phase 1. Placeholder copy corrected. Phone-number-only recipients would require
  Kobo generating and holding a custodial wallet on someone's behalf — a real
  feature with real custody/regulatory implications, contradicting the product
  doc's non-custodial stance. Not being built now.
- Sender-side "balance" has no backend concept and isn't being invented under time
  pressure. GET /balances/:userId only ever gets a row written for a transfer's
  recipient_id — a sender holds nothing after sending in this model. Wiring the
  sidebar to the real sender's id would show a real, permanently-frozen €0.00,
  worse than the current mock. Sidebar stays on mock data for now.
- Recipient balance display, EUR-equivalent shown, is a real and properly scoped
  next feature — not the sidebar fix. A recipient does accumulate a real USDC
  balance post-transfer. Decision: display it converted to EUR-equivalent, friendly
  like MetaMask's fiat display, not hiding the underlying USDC entirely. Needs a
  new recipient-facing screen (doesn't exist yet) and reuse of the app's existing
  live exchange rate source. Scoped as its own separate task — currently on hold
  pending confirmation it's needed for the Demo Day script.

---

## 2. Immediate priority queue (today, in order)

1. **Wire the real sender** (backend already supports this — same pattern as recipient)
2. **Wire real balance display**
3. **Day 7 joint run-through** — first time this is genuinely possible end-to-end
4. Then Days 8–9 polish, Days 10–11 rehearsal + fallback video, per the original plan — unchanged

---

## 3. Backend / server / network / database roadmap

### 3a. Sender wiring (today)
Same shape as the recipient fix: a real `POST /users` call with `role: "sender"`, replacing `CURRENT_USER` mock data. Backend needs no new endpoint — `POST /users` already accepts `role: "sender"`.

### 3b. Balance wiring (today)
Frontend swaps mock sidebar balance for a real `GET /balances/:userId` call against the real signed-in user. Backend needs no changes — endpoint is built and tested.

### 3c. Basic auth (this week, scoped)
- Use Supabase Auth (already the stack's chosen auth layer) — email/password or magic link, whichever is faster to wire given the timeline.
- Every `POST`/sensitive `GET` endpoint checks for a valid session before acting. No session → 401.
- `users.id` becomes tied to the authenticated Supabase Auth user, not a client-supplied value.
- **Not in scope this week:** multi-factor auth, password reset flows, session refresh hardening, rate limiting. Flag these as known gaps, don't build them under demo pressure.

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
