-- Kobo core schema: users, transfers, balances
-- Day 1-2 scope per Technical Build Plan. No cash-out/off-ramp tables yet.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('sender', 'recipient')),
  country text not null,
  wallet_address text not null,
  created_at timestamptz not null default now()
);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users (id),
  recipient_id uuid not null references users (id),
  amount_eur numeric(18, 2) not null,
  amount_usdc numeric(18, 6),
  status text not null default 'pending'
    check (status in ('pending', 'onramp_complete', 'sent', 'confirmed')),
  onramp_reference text,
  solana_tx_signature text,
  created_at timestamptz not null default now()
);

create table if not exists balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  usdc_balance numeric(18, 6) not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists transfers_sender_id_idx on transfers (sender_id);
create index if not exists transfers_recipient_id_idx on transfers (recipient_id);
create index if not exists balances_user_id_idx on balances (user_id);
