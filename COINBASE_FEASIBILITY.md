> **ARCHIVED.** The founder reprioritized the funding roadmap: MoonPay repair + E2E
> proof leads now, then SEPA, then Conversion Engine, then Stripe POC — Coinbase is
> shelved. The research below is unchanged and not invalidated; it's just not being
> acted on. Do not implement Coinbase, do not wire it into any active flow. See
> KOBO_BUILD_PLAN.md section 8 for the current roadmap.

# Coinbase Onramp — Feasibility Report (Phase 2A: Research Only)

Prepared for the founder. No code, DB, config, or `.env` changes made in this phase.
Working tree confirmed clean before this research began.

**Context read first:** API_CONTRACT.md "Resolved this sync" #20, KOBO_BUILD_PLAN.md
section 8, `backend/src/lib/onramp.ts`, `backend/src/routes/funding.ts`,
`backend/src/routes/webhooks.ts` (all current as of commit `5d47bde`).

**A note on sourcing.** Coinbase's own developer docs are internally inconsistent in
places — different pages describe what look like two API generations (an older
"Buy Config" + hosted-widget flow, and a newer `v2` "Create an onramp session"
endpoint) with overlapping but not identical field names and payment-method enums.
Every ambiguity found is flagged explicitly below, not silently resolved, per your
instruction — and each comes with the concrete sandbox/API call that would settle it.

---

## 1. Is Coinbase Onramp available in Ireland?

**Yes, at the country level.** Coinbase's FAQ states: *"Coinbase Onramp is available
in all countries which Coinbase operates except Japan."*
([Onramp FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq)) Coinbase
itself (the underlying account/exchange) is licensed in Ireland — Coinbase holds a
Central Bank of Ireland VASP registration and bases its EU MiCA license there, giving
it passporting rights across the EEA. Ireland is not called out anywhere as an
exception. **Not independently confirmed against a live `GET /v1/buy/config` response**
listing `"id": "IE"` explicitly — the docs themselves say this is the authoritative
source (*"Clients can call this API periodically and cache the response"*), and I
could not call it without an API key in a research-only phase.
**Falsifying test:** call `GET /v1/buy/config` with a real CDP key and check for an
`IE` entry in `countries[]`.

## 2. Is EUR supported?

**Yes**, per aggregated third-party documentation citing Coinbase's own currency list
(USD, EUR, GBP, CAD, AUD, JPY, CHF, SGD). I could not pull the *primary* Coinbase page
listing this table directly (the Countries & Currencies page returned only a partial
excerpt with USD as the sole worked example) — **flagging this as needs-direct-confirmation**,
not fully primary-sourced. **Falsifying test:** call `GET /v1/buy/config` and check
`paymentCurrency` options for country `IE`, or create a sandbox session with
`paymentCurrency: "EUR"` and confirm it's accepted rather than rejected.

## 3. Payment methods an Irish resident can actually use

This is where the real, load-bearing finding is. The **authoritative API reference**
for `GET /v1/buy/config` ([Get buy config](https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/get-buy-config))
defines `PaymentMethodType` as exactly:

> `UNSPECIFIED, CARD, ACH_BANK_ACCOUNT, APPLE_PAY, FIAT_WALLET, CRYPTO_ACCOUNT, GUEST_CHECKOUT_CARD, PAYPAL, RTP, GUEST_CHECKOUT_APPLE_PAY`

**There is no SEPA, iDEAL, SOFORT, or any EU bank-transfer value in this enum at all.**
`ACH_BANK_ACCOUNT` and `RTP` (Real-Time Payments) are both US-domestic bank rails.
One aggregated web search initially returned a claim that Coinbase Onramp supports
"SEPA, iDEAL, SOFORT" — **I checked this against Coinbase's own docs and could not
substantiate it; the only SEPA references in `docs.cdp.coinbase.com` are for
**Coinbase Prime** (institutional withdrawal instructions), not the consumer Onramp
product. Treating the SEPA/iDEAL/SOFORT claim as refuted** unless the founder has a
different source.

Practical answer for Ireland: **`CARD` is the only bank-rail-independent option that
plausibly applies.** `FIAT_WALLET`/`CRYPTO_ACCOUNT` only work if the user already
holds a Coinbase balance. Separately, Coinbase.com itself (the retail app, not the
Onramp API) does let Irish users link a bank account via SEPA to fund their Coinbase
balance — but that's a different product surface than what `POST /onramp/sessions`
exposes as `paymentMethod`. **This gap — Coinbase-the-app has SEPA, Coinbase Onramp
the API product apparently doesn't — is exactly the kind of thing that needs a live
Config call against `IE` to settle**, not assumed either way.
**Falsifying test:** `GET /v1/buy/config`, inspect `countries[].payment_methods` for
the `IE` entry.

## 4. Is USDC a supported payout asset?

**Yes, confirmed via primary source.** The Layer 2 Networks page states the asset
availability table includes USDC on *"Ethereum / Base / Polygon / Solana / Optimism /
Avalanche C-Chain."* ([Layer 2 Networks](https://docs.cdp.coinbase.com/onramp/additional-resources/layer-2-networks))

## 5. Is Solana a supported network?

**Yes, confirmed via primary source**, and the exact API string is `"solana"`
(lowercase). Same page: *"To enable `USDC` on the Solana network, you must pass in a
Solana formatted destination address."* This maps directly onto `destinationNetwork`
in the session-creation request body.

## 6. Is a Coinbase account required, or is guest checkout available for Ireland?

**Confirmed: a Coinbase account is required for Ireland. Guest checkout has never
applied outside the US, and even the US path is being phased out.**

Three independent, consistent primary sources:
- Coinbase-hosted Onramp overview: *"Any US resident can onramp up to $500/week"*
  via guest checkout — scoped explicitly to US residents.
  ([Coinbase-hosted Onramp overview](https://docs.cdp.coinbase.com/onramp/coinbase-hosted-onramp/overview))
- Same page, deprecation notice: *"**Will be deprecated on June 30, 2026:** Guest
  Checkout (debit card, Apple Pay) via the Coinbase-hosted widget is being
  discontinued. Use the Headless Onramp API instead."* **Today's date is 2026-08-30 —
  this deprecation date has already passed.** The hosted-widget guest checkout is
  likely gone entirely as of this research.
- Headless Onramp overview: *"The Headless Onramp API is currently available for US
  users with valid US phone numbers."* ([Headless Onramp overview](https://docs.cdp.coinbase.com/onramp/headless-onramp/overview))
  — its own Limits Upgrade page confirms the KYC mechanism is *SSN last 4 + date of
  birth*, a US-only identity scheme, structurally incompatible with an Irish user.

**One real contradiction found, flagged rather than resolved:** the Onramp FAQ page
says, in answer to "Is a Coinbase account required?": *"No. In the US, UK, and Canada,
non-Coinbase account holders can also onramp without a Coinbase account using Guest
checkout."* This directly conflicts with the Overview and Headless pages, which both
describe guest checkout as US-only. **This does not change the answer for Ireland**
either way — Ireland is not named in any of the three pages as a guest-checkout
country — but it means Coinbase's own docs disagree with each other on UK/Canada, and
that inconsistency is worth knowing about if Coinbase's country list ever changes.
**Falsifying test:** attempt to create a guest-checkout session with `country: "IE"`
in sandbox and see whether it's accepted or rejected — sandbox only exercises the
guest flow (see §8), so this is actually testable without a real Coinbase account.

## 7. UX cost of requiring a Coinbase account — honest before/after

**Before (today, MoonPay):**
1. User taps "Add funds" in Kobo.
2. Kobo backend creates a MoonPay session, hands back a widget URL.
3. User is redirected to MoonPay's widget, enters card details, completes purchase.
4. Redirected back to Kobo. Balance updates via webhook.

No account creation inside the funding flow — MoonPay's own KYC is handled within its
widget, but the user never has to pre-exist as a MoonPay customer.

**After, if Coinbase requires a full account (which is what Ireland requires — see §6):**
1. User taps "Add funds" in Kobo.
2. Kobo backend creates a Coinbase Onramp session, hands back `onrampUrl`.
3. User is redirected to `pay.coinbase.com`. **If they don't already have a Coinbase
   account:** sign-up flow (email, password, phone verification) → identity
   verification (legal name, DOB, address, government ID document — passport,
   driver's license, or national ID card — plus in some cases a proof-of-address
   document dated within 3 months) → Coinbase's own review, *"within 24 hours"*
   per their docs, though third-party reports (not Coinbase's own claim, flagged as
   lower-confidence) describe real-world verification sometimes taking longer.
4. Only after that full account exists and is verified can the actual EUR→USDC
   purchase proceed.
5. Redirected back to Kobo.

**The honest cost:** for any Irish user without a pre-existing Coinbase account, the
funding flow stops being "enter card details, done" and becomes "create and verify a
full separate financial account with a third party, then come back." A same-day
purchase is not guaranteed if verification takes longer than instantaneous. This is a
materially different — and materially heavier — first-funding experience than
MoonPay's today, and it directly cuts against the product constraint that the sender
should "ideally not realise a crypto provider is involved." I'm surfacing this, not
vetoing it — the founder decides whether it's acceptable, per §B below.

## 8. Sandbox — what exists, what's simulated, and a critical limitation

Sandbox exists at `pay-sandbox.coinbase.com`, session-token-driven, same query-param
shape as production. Test card/phone details are placeholders (any 6-digit code
verifies). For the newer order-creation API, prefixing `partnerUserRef` with
`sandbox-` makes a transaction always succeed without charging a real card.
([Sandbox Testing](https://docs.cdp.coinbase.com/onramp/additional-resources/sandbox-testing))

**The critical limitation, stated twice, verbatim, across independent search results:**
*"Sandbox testing is currently only available for Guest checkout flow. Switch to
production to test out the authenticated Coinbase user flows."*

**This directly undermines the ability to test Kobo's actual Ireland flow before
production.** Since Ireland has no guest-checkout path (§6), the flow Irish users will
actually experience — full account creation + KYC + purchase — **cannot be exercised
in sandbox at all.** The sandbox can prove the session→webhook→settlement *plumbing*
works (using a guest-checkout session, US-shaped), but it cannot prove the real Irish
user journey works until production, with a real account, real KYC, and likely real
money. This is the single biggest testing/operational risk in this whole
recommendation and deserves explicit founder attention.

Webhooks specifically: *"Coinbase webhook servers cannot reach localhost, so to
enable webhooks you need a publicly accessible URL"* — a tunnel (ngrok or similar) or
a real staging deploy is required even for the guest-checkout sandbox loop.

## 9. Production application process

Found: *"When you're ready to go live, you apply for access and get production
access immediately after your app is approved"* (repeated near-verbatim across two
separate doc pages, once specifically re: the Headless API). Domain allowlisting is
real and per-project — add every domain the app runs on (dev, staging, production);
`localhost` explicitly should not be used for production.
([Domain Allowlisting](https://docs.cdp.coinbase.com/wallets/security-and-policies/domain-allowlisting))

**Not found, despite searching directly:** a stated typical approval timeline, or a
formal numbered "staging implementation first" checklist/gate as its own named
requirement. The docs' own framing ("immediately after your app is approved") implies
approval is the actual gate, but doesn't say what's evaluated or how long it takes.
**This is a real gap in what I could verify — worth confirming directly with Coinbase
or via the founder's own application-form conversation, since it materially affects
timeline planning**, not something I'll estimate without a source.

## 10. Session tokens

Two things that may be the same mechanism described at two doc-generations, or may be
genuinely different — flagging rather than merging them:
- Older "Coinbase-hosted Onramp" page: *"You must create a new session token from
  your backend for each user session. Tokens are single-use and expire after 5
  minutes."*
- Newer `v2` "Create an onramp session" API reference: response includes
  `session.onrampUrl` (embedding a `sessionToken` query param), and states *"The
  returned URL is single-use only. Once a user visits the URL, no one else can
  access it."* — no explicit expiry duration restated here.

**Mapping onto Kobo's existing pattern:** this is exactly the shape
`lib/onramp.ts`'s `OnrampSessionResult { widgetUrl, sessionId }` already expects — a
Coinbase adapter would return `{ widgetUrl: session.onrampUrl, sessionId: <whatever
Coinbase's session id equivalent is, or null if none> }`, correlated to a
`funding_requests` row exactly like MoonPay/Transak are today. **Open question:**
whether Coinbase's session object carries a stable id worth storing in
`onramp_session_id`, or whether (like MoonPay) correlation should rely entirely on a
partner-supplied reference field instead. **Falsifying test:** create a real sandbox
session and inspect the full raw response body.

## 11. Webhooks / status, and the `expectedRail` mapping

**Event types**, confirmed via primary docs
([Onramp & Offramp Webhooks](https://docs.cdp.coinbase.com/webhooks/onramp)):
`onramp.transaction.created`, `onramp.transaction.updated`,
`onramp.transaction.success`, `onramp.transaction.failed` (plus `offramp.*`
equivalents, irrelevant here — off-ramp is deferred).

**Idempotency field — genuinely ambiguous, flagged rather than picked:** the payload
uses `transactionId` for guest-checkout-flow transactions and `orderId` for
Headless-Onramp-API orders. **Which one Kobo would actually see depends on which
Coinbase integration surface Phase 2 ends up using** — not resolved by this research,
resolved by which integration path is chosen (see §D).

**Signature verification:** header `X-Hook0-Signature` (Coinbase's webhook
infrastructure is built on the open-source Hook0 webhook platform — corroborated
independently), HMAC-SHA256, two format versions (`v0`: timestamp + raw body; `v1`:
timestamp + specified headers + raw body), format
`t=<ts>,v0=<sig>,h=<header-names>,v1=<sig>`. Verification must run against raw
pre-JSON-parse bytes — *"parsing the JSON first will break verification"* — the exact
same constraint Kobo's `index.ts` already handles for MoonPay via `req.rawBody`.

**Mapping onto `handleFundingWebhook`'s `expectedRail` pattern (already built,
Phase 1):** this is directly compatible. A new `POST /webhooks/coinbase` route would
verify the `X-Hook0-Signature` header, extract `transactionId`/`orderId` as the
`reference`, and call the existing exported
`handleFundingWebhook(fundingRequestId, { reference, expectedRail: "coinbase" }, db)`
— **zero changes needed to `handleFundingWebhook` itself.** This is exactly the seam
Phase 1 was built for.

**Status-polling alternative to webhooks:** not found in any fetched page. If none
exists, Kobo's `GET /funding/:id` polling pattern (frontend polls Kobo's own backend,
which trusts only the webhook as the source of truth) stays unchanged — appropriate,
since that's already how MoonPay/Transak work today.

## 12. Gotchas

- **Sandbox cannot test the Irish flow at all** (§8) — the single biggest one.
- **No SEPA/EU bank-transfer payment method in the Onramp API's own enum** (§3) —
  card only, as far as the documented enum shows.
- **Guest checkout for Ireland has never existed and isn't coming via this doc trail**
  — full account + KYC is the floor, not a fallback.
  US SSN-based KYC scheme (Limits Upgrade) doesn't apply to Ireland; Irish account
  verification instead goes through Coinbase's standard EU/Ireland-regulated KYC
  (government ID + possibly proof of address), a heavier, separate process not
  documented on the Onramp-specific pages at all — it's Coinbase's standard consumer
  account verification.
- **Amount limits found are all US/guest-checkout-specific** ($500/week, 15
  lifetime transactions, up to $2,500/week after verification) — **none of these
  apply to an authenticated non-US account**, which follows Coinbase's normal
  consumer buy/sell limits instead (not documented on the Onramp pages; would need
  checking against standard Coinbase account limits for Ireland).
- **API version ambiguity**: the docs describe what look like two generations of the
  same product (older "Buy Config" hosted-widget flow vs newer `v2` unified
  session-creation-with-quote endpoint) with different payment-method enum shapes.
  Any real integration needs to confirm, in a real sandbox session, which generation
  is actually current and which one the CDP dashboard issues keys for.
- **No documented production-approval timeline** (§9) — a real planning gap.

---

## Verification pass (2A-VERIF) — three targeted gaps closed

Time-boxed follow-up. No code/config/DB touched. Verdict **does not flip** — Option 2
stands, reinforced.

**Q1 — Headless guest checkout outside the US (the potentially verdict-flipping one).**
**Answered from primary source, no.** Headless Onramp overview, verbatim:
*"The Headless Onramp API is currently available for US users with valid US phone
numbers."* ([Headless Onramp overview](https://docs.cdp.coinbase.com/onramp/headless-onramp/overview))
The same page's error catalogue includes a `"user is located in a region that is not
supported"` case — geographic gating is a real, implemented API behavior, not just
prose. A direct search for EU/Ireland expansion language (roadmap, "coming soon")
returned nothing. **No EU/Ireland guest checkout exists via Headless. Option 2 stands
— no verdict flip.**

**Q2 — Live Config API call for `country=IE`.**
**Cannot be answered without X.** No CDP credentials exist for this research pass —
none were sought (out of scope for this pass, and account creation isn't something I
do on the founder's behalf regardless). **This is precisely step 0 of Phase 2B
staging**, not a gap in this research: create a Coinbase Developer Platform account,
a project, and a sandbox-scoped API key (Onramp/Offramp read scope) — per earlier
research this tier is self-serve, no approval. Until that call is actually made,
**"EUR supported" and "card-only for Ireland" are UNVERIFIED / inferred** — from a
third-party-aggregated currency list and from the documented `PaymentMethodType` enum,
respectively — **not confirmed-by-live-API.** Labels corrected in the verdict table
below.

**Q3 — Sandbox precision: plumbing vs. human journey.**
Exact citation: *"Sandbox testing is currently only available for Guest checkout
flow. Switch to production to test out the authenticated Coinbase user flows."*
([Sandbox Testing](https://docs.cdp.coinbase.com/onramp/additional-resources/sandbox-testing))
Breaking this down precisely:
- **Session creation, redirect URL, webhook signature verification, and the
  `handleFundingWebhook` credit path: testable in sandbox, answered from primary
  source.** The sandbox issues real session tokens against real query params
  (`pay-sandbox.coinbase.com`), and order-creation supports a `sandbox-` prefix on
  `partnerUserRef` specifically to let *"you test your integration without any real
  transfer of funds."*
- **Whether a completed sandbox transaction actually fires a real
  `onramp.transaction.*` webhook to a configured endpoint: cannot be answered without
  X.** No page states this explicitly either way. Suggestive-but-not-conclusive: the
  sandbox docs specifically warn *"Coinbase webhook servers cannot reach localhost, so
  to enable webhooks you need a publicly accessible URL"* in the sandbox-testing
  context — a warning that would be pointless to include there if sandbox never
  delivered webhooks at all. Treating this as likely-yes but **unconfirmed** until a
  real sandbox transaction is run against a real public endpoint (Phase 2B step 1,
  right after the Config call above).
- **The human KYC + authenticated-purchase experience Irish users would actually
  hit: not testable in sandbox, confirmed.** That's exactly what *"Switch to
  production to test out the authenticated Coinbase user flows"* means.

**What this means for the Coinbase production application:** we can honestly state
the on-ramp *plumbing* (session, webhook, settlement) was tested end-to-end in
sandbox. We cannot honestly claim the real Irish account+KYC+purchase journey was
tested before asking for production access — because Coinbase's own sandbox doesn't
allow that. State it exactly that way on the application, not glossed over.

---

## A. Verdict table

| # | Dimension | Supported? | Evidence (quote + URL) | Notes |
|---|---|---|---|---|
| 1 | Ireland availability | **Yes** (country-level) | *"available in all countries which Coinbase operates except Japan"* — [FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq) | Not confirmed against a live Config call listing `IE` |
| 2 | EUR support | **Likely yes — UNVERIFIED (inferred)** | Third-party-aggregated currency list (USD/EUR/GBP/CAD/AUD/JPY/CHF/SGD); not independently primary-sourced | **Not confirmed-by-live-API** — needs the `IE` Config call, Q2, step 0 of 2B |
| 3 | Irish payment methods | **Card only — UNVERIFIED (inferred from enum)** | `PaymentMethodType` enum has no SEPA/bank-transfer value — [Get buy config](https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/get-buy-config) | **Not confirmed-by-live-API for `IE` specifically** — enum is global, not country-filtered; SEPA/iDEAL/SOFORT claim found elsewhere could not be substantiated |
| 4 | USDC payout asset | **Yes** | *"USDC... Ethereum / Base / Polygon / Solana / Optimism / Avalanche C-Chain"* — [Layer 2 Networks](https://docs.cdp.coinbase.com/onramp/additional-resources/layer-2-networks) | |
| 5 | Solana network | **Yes** | *"To enable USDC on the Solana network, you must pass in a Solana formatted destination address"* — same page | API string: `"solana"` |
| 6 | Guest checkout for Ireland (hosted **and** Headless) | **No — account required, answered from primary source** | *"Any US resident can onramp..."*; *"The Headless Onramp API is currently available for US users with valid US phone numbers"* — [Overview](https://docs.cdp.coinbase.com/onramp/coinbase-hosted-onramp/overview), [Headless Overview](https://docs.cdp.coinbase.com/onramp/headless-onramp/overview) | 2A-VERIF Q1 closed this specifically for Headless (the deprecation replacement) — no EU/Ireland path, no roadmap language found. FAQ page contradicts re: UK/Canada, doesn't change the Ireland answer |
| 7 | Account UX cost | N/A (surfaced, not scored) | See §7 | Founder decision |
| 8 | Sandbox covers real Irish flow | **No — confirmed.** Plumbing (session/webhook/credit): **yes, testable.** Real webhook firing on a sandbox transaction: **UNVERIFIED**, likely-yes but unconfirmed | *"Sandbox testing is currently only available for Guest checkout flow. Switch to production to test out the authenticated Coinbase user flows"* | 2A-VERIF Q3 — see breakdown above. Biggest operational risk found |
| 9 | Production timeline documented | **No** | Not found despite direct search | Confirm with Coinbase directly |
| 10 | Session tokens single-use | **Yes** | *"The returned URL is single-use only"* — [Create an onramp session](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/onramp/create-an-onramp-session) | 5-min expiry stated on an older doc page only |
| 11 | Webhook/rail-mismatch compatible with Kobo | **Yes, directly** | `expectedRail: "coinbase"` slots into existing `handleFundingWebhook` with zero changes to that function | Idempotency field (`transactionId` vs `orderId`) depends on chosen integration path |
| 12 | Gotchas | — | See §12 | |

## B. Recommendation

Of the three options in your framework:

**Option 2 — viable, but only with a Coinbase-account journey; recommend as a
secondary rail while SEPA leads primary.**
*(2A-VERIF: reaffirmed, not flipped — Headless guest checkout confirmed US-only from
primary source, closing the one gap that could have moved this to Option 1.)*

Reasoning: technically, Coinbase Onramp is a clean fit for Kobo's actual settlement
shape — EUR in, USDC on Solana out, straight into the pooled wallet, and it plugs
into the Phase 1 abstraction (`lib/onramp.ts`, `handleFundingWebhook`) almost without
friction. But the two things that matter most for *this specific corridor* both cut
against it as the lead rail: (a) there is no guest-checkout path for Ireland at all,
so every first-time sender hits a full Coinbase account + KYC detour before their
first EUR ever converts — directly in tension with "ideally without realising a
crypto provider is involved"; and (b) the sandbox cannot even test that real Irish
flow, so confidence before production launch is inherently limited. Neither of these
is a reason to abandon Coinbase — they're reasons not to bet the *primary* corridor on
it while SEPA (a fundamentally lower-friction bank-rail path for an Irish sender who
already has an Irish bank account) is available as the lead.

**What would move this to Option 1:** primary-sourced confirmation that Coinbase
Onramp exposes a genuine EU/SEPA payment method in its API (not just on Coinbase.com
directly) — that alone would remove most of the account-creation friction concern
for users who already bank in the EU, since account+KYC could plausibly be skipped in
favor of a bank-guest-style flow if Coinbase ever ships one for the EU the way it has
(had) for the US.

## C. Proposed staging implementation plan (not built — plan only)

**Files to create** (mirroring `lib/moonpay.ts`'s shape exactly, per the existing
Phase 1 pattern — none of this is written yet):
- `backend/src/lib/coinbase.ts` — `createOnrampSession()` (POST session, real network
  call, unlike MoonPay's local URL-signing), `verifyWebhook()` (X-Hook0-Signature
  HMAC check).
- `backend/src/routes/webhooks.ts` — add `POST /webhooks/coinbase`, calling the
  already-exported `handleFundingWebhook(id, { reference, expectedRail: "coinbase" })`
  — no changes to that function needed.
- `backend/src/lib/onramp.ts` — add a `"coinbase"` branch to `createOnrampSession()`'s
  dispatch (mirrors the existing `moonpay`/`transak` branches); move `"coinbase"` from
  `FUNDING_RAILS`-only into `IMPLEMENTED_RAILS`.
- `backend/.env.example` / `.env` — `COINBASE_CDP_API_KEY`,
  `COINBASE_WEBHOOK_SECRET`, `COINBASE_ONRAMP_ENV` (sandbox/production).
- Test files, matching Phase 1's own coverage pattern: a `coinbase-selection` unit
  test (mocked, like `onramp-selection.test.ts`) and a rail-mismatch case added to
  `funding-webhook.test.ts` (already parameterized for this — just add a `"coinbase"`
  seed row).

**End-to-end sandbox test we'd actually run:** create a sandbox session via
`pay-sandbox.coinbase.com` through Kobo's real `POST /funding` (rail: "coinbase"),
complete the guest-checkout-shaped sandbox flow (this is the *only* flow sandbox
supports — see §8), confirm the webhook lands on `POST /webhooks/coinbase`, confirm
`handleFundingWebhook` credits the sender's balance exactly once. **This proves the
plumbing, explicitly not the real Irish account+KYC journey** — that gap gets stated
in the PR/report, not hidden.

**What we'd show Coinbase when applying for production:** the working staging
integration above (a real session → real webhook → real balance credit loop, even if
exercised via the guest-checkout sandbox shape), Kobo's domain(s) for allowlisting,
and — per the founder's own application-form conversation with Coinbase — whatever
else that process specifically asks for, which this research couldn't fully enumerate
(§9).

## D. Decisions only the founder can make

1. Given no guest checkout exists for Ireland, is a mandatory Coinbase-account+KYC
   detour on a sender's *first* top-up acceptable for Kobo's UX bar, or does that
   alone rule Coinbase out as anything but a secondary/fallback rail?
2. Should Phase 2 target the Headless Onramp API (full frontend ownership, no
   redirect) or the hosted-widget flow (`pay.coinbase.com`, redirect-based, closer to
   today's MoonPay pattern) — given only the guest-checkout shape is testable in
   sandbox either way, and Ireland can't use guest checkout in production regardless?
3. Given the sandbox cannot exercise the real (account-required) Irish flow at all,
   is the founder comfortable validating that specific path only in production, with
   a real Coinbase account and real (small) money, before broader rollout?
4. *(2A-VERIF update: the Headless-guest-checkout route to Option 1 is now closed —
   confirmed US-only from primary source. The remaining route to Option 1 is EU/SEPA
   payment-method support inside the Onramp API itself.)* Is standing up a real CDP
   sandbox account now (step 0 of Phase 2B — self-serve, no approval needed) to run
   the live `IE` Config call worth doing before deciding primary-vs-secondary, given
   it's the one remaining finding that could flip the recommendation?
5. Should the Coinbase production application be initiated now (in parallel with
   further discovery), given "immediately after your app is approved" implies
   approval, not application, is the real gate — or held until SEPA (Phase 3) is
   further along, so the founder isn't running two unproven rails in parallel?

---

*No code, config, or database changes were made in this phase. Coinbase/SEPA/Stripe
remain unimplemented — `IMPLEMENTED_RAILS` in `backend/src/lib/onramp.ts` still
contains only `moonpay` and `transak`.*
