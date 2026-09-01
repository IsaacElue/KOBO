-- Pre-launch waitlist capture for the /waitlist campaign page.
--
-- Standalone by design: NO foreign keys to users/transfers/balances/etc., no
-- auth, no RLS assumptions — the two endpoints (POST /waitlist/signup,
-- GET /waitlist/count) are public and unauthenticated. Keeping it in its own
-- table means the campaign can collect emails with zero coupling to the
-- product schema.
--
-- `signup_number` is assigned by a GENERATED-ALWAYS IDENTITY column, so the
-- value is drawn from a sequence *inside the INSERT itself*. Concurrent
-- signups therefore each get a distinct, strictly-increasing number with no
-- application-level locking and no read-modify-write race. (Numbers are not
-- guaranteed gap-free — a rolled-back INSERT still consumes a sequence value —
-- but they are unique and monotonic, which is all the "#N in line" display
-- needs.)

create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  signup_number integer generated always as identity unique,
  created_at timestamptz not null default now()
);

-- Idempotent re-run: the block above is `if not exists`, but the identity /
-- unique bits are only created with the table. Nothing else to add — the
-- `unique` on `email` and on `signup_number` each create the index they need,
-- and lookups are either by `email` (idempotency check) or a full-table
-- `count`.
