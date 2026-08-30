-- Follow-up to 20260830180000_add_funding_rail.sql: that migration defaulted
-- every existing row's `rail` to 'moonpay'. Rows created before the MoonPay
-- switch (26d1cc8, "feat: MoonPay on-ramp provider for POST /funding")
-- actually went through Transak — identifiable because only Transak sessions
-- ever populate `onramp_session_id` (MoonPay has no separate session id, see
-- lib/moonpay.ts's `CreateOnrampSessionResult` — `sessionId` is always null).
-- Correct those specific historical rows. New rows created from this sync
-- onward already get the right rail at insert time (routes/funding.ts).

update funding_requests
set rail = 'transak'
where onramp_session_id is not null
  and rail = 'moonpay';
