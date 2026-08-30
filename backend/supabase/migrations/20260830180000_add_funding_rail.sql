-- Phase 1: Funding Rail Abstraction — explicit rail identity on funding_requests
-- + statuses expanded to represent the full funding lifecycle.
--
-- Hosted-session rails (MoonPay / Transak / future Coinbase) keep the existing
-- `pending | confirmed | failed` shape. The two new statuses — `awaiting_reconciliation`
-- (SEPA: a bank transfer arrived but hasn't been matched/credited yet) and
-- `manual_review` (ambiguous transaction that must not auto-credit) — exist so
-- reconciled rails can converge on the same table without pretending every rail
-- produces a widget URL. `payout_pending` is reserved for treasury rails (Stripe:
-- fiat collected, USDC payout not yet confirmed); it is NOT used by hosted-session
-- rails, whose settlement is provider-delivered USDC + a single ledger credit.
--
-- `rail` is a plain text column (no enum) for forward-compat: adding a rail
-- later is a data change, not a migration. Existing rows default to 'moonpay'
-- (the pre-refactor behavior — MoonPay was the provider of record for funding).

alter table funding_requests
  add column if not exists rail text not null default 'moonpay'
    check (rail in ('moonpay', 'transak', 'coinbase', 'sepa', 'stripe'));

-- Expand the status check to cover the new lifecycle states. Postgres can't
-- ALTER a check constraint in place — drop and re-add it.
alter table funding_requests
  drop constraint if exists funding_requests_status_check;

alter table funding_requests
  add constraint funding_requests_status_check
    check (status in (
      'pending',              -- hosted-session: session created, awaiting provider completion
      'confirmed',            -- settled: ledger credited (hosted-session) / reconciled (SEPA)
      'failed',               -- provider reported failure, or an unrecoverable error
      'awaiting_reconciliation', -- SEPA: bank transfer observed, reference not yet matched
      'manual_review',        -- ambiguous transaction — must not auto-credit
      'payout_pending'        -- treasury rail: fiat collected, USDC payout not yet confirmed
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic balance credit (Phase 1 — balances.ts now calls this via supabase.rpc)
--
-- One statement, fully race-safe: INSERT with ON CONFLICT (user_id) DO UPDATE.
-- If the row exists the increment happens under the unique constraint's row
-- lock (concurrent credits serialize); if it doesn't, the insert creates it,
-- or a concurrent insert's winner absorbs the increment via DO UPDATE. Exactly
-- one credit lands no matter how many credits race.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function credit_balance(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into balances (user_id, usdc_balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set
    usdc_balance = balances.usdc_balance + p_amount,
    updated_at = now();
end;
$$;