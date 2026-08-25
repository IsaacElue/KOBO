-- Day 5-6: failure handling for the transfer pipeline.
-- Adds 'failed' as a terminal status, plus failure_reason and retry_count
-- so slow/failed on-ramp -> Solana sends are observable instead of hanging.

alter table transfers
  drop constraint if exists transfers_status_check;

alter table transfers
  add constraint transfers_status_check
  check (status in ('pending', 'onramp_complete', 'sent', 'confirmed', 'failed'));

alter table transfers
  add column if not exists failure_reason text,
  add column if not exists retry_count integer not null default 0;
