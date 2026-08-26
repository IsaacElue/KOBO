-- Real sender balance funding: a Transak session that tops up the sender's
-- own balance (lands real USDC in Kobo's pooled backend wallet) instead of
-- sending to a recipient. Mirrors `transfers`' shape for what funding needs;
-- deliberately its own table rather than overloading `transfers` (a funding
-- request has no recipient_id and never triggers a Solana send itself).
--
-- `balances` already has no recipient-only constraint — its `user_id` FK and
-- `unique(user_id)` already work for a sender row exactly as they do for a
-- recipient row. No migration needed there; only the application code
-- previously only ever wrote a recipient's row.

create table if not exists funding_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users (id),
  amount_eur numeric(18, 2) not null,
  amount_usdc numeric(18, 6),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  onramp_session_id text,
  onramp_reference text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists funding_requests_sender_id_idx on funding_requests (sender_id);
create index if not exists funding_requests_onramp_session_id_idx on funding_requests (onramp_session_id);
