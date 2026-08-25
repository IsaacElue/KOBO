-- Real Transak integration: correlate a transfer with the Transak widget
-- session/order created for it, so the webhook can be matched back to the
-- right row without trusting a client-supplied transfer_id.

alter table transfers
  add column if not exists onramp_session_id text;

create index if not exists transfers_onramp_session_id_idx
  on transfers (onramp_session_id);
