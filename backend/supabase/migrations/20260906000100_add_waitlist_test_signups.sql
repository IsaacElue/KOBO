-- ─────────────────────────────────────────────────────────────────────────────
--  WAITLIST TEST SIGNUPS — a separate table for developer testing
--
--  Developers need to exercise the signup flow repeatedly without consuming
--  real queue numbers. The production table `waitlist_signups` has
--  `signup_number integer NOT NULL` and its numbering is immutable by design
--  (20260904000000) — so test rows do NOT belong in it. They live here instead.
--
--  This keeps every production invariant intact BY CONSTRUCTION:
--    * `public.waitlist_signup(p_email)` and `waitlist_counter` are untouched.
--    * `GET /waitlist/count` (COUNT of `waitlist_signups`) already excludes
--      these rows — they are not in that table.
--    * a test signup can never be assigned, or collide with, a real
--      `signup_number`.
--    * deleting test rows touches nothing real.
--
--  Written to only by `POST /waitlist/test-signup` (auth + developer role,
--  enforced server-side); cleared by `POST /waitlist/test-cleanup`. The public
--  signup API never touches this table.
--
--  Additive and idempotent. Not applied automatically: run via
--  scripts/run-migration.ts and record it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists waitlist_test_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  note        text,
  -- who created it (auth.users id), for audit — nullable, ON DELETE SET NULL so
  -- removing a dev account never blocks cleanup of their test rows.
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One row per normalised email — `test-signup` is get-or-create, mirroring the
-- real endpoint's idempotency without any shared state.
create unique index if not exists waitlist_test_signups_email_key
  on waitlist_test_signups (lower(btrim(email)));
