-- ─────────────────────────────────────────────────────────────────────────────
--  WAITLIST NUMBERING — signup_number is an IMMUTABLE historical ordinal
--
--  Supersedes the original `20260902` mechanism (`signup_number` was a
--  `GENERATED ALWAYS AS IDENTITY` column). That drew a sequence value on every
--  INSERT *attempt* — including ones that hit the `unique(email)` conflict —
--  and never returned a value on DELETE / ROLLBACK, so the verification script's
--  insert+delete cycles advanced it: one real signup, but `nextval()` had
--  reached 35.
--
--  New mechanism: a singleton counter row incremented by a TRANSACTIONAL UPDATE
--  inside `waitlist_signup()`'s advisory-locked section, ONLY when a genuinely
--  new row is inserted.
--
--    * "the Nth person to successfully join is #N, forever" — written once, on
--      insert, never recomputed. A deleted row leaves a permanent gap; nobody
--      else's number moves.
--    * advisory lock -> serializes the check-then-insert, so concurrent new
--      signups get distinct CONSECUTIVE numbers and a losing duplicate-race
--      never reaches the counter.
--    * the counter is a plain row, not a sequence -> a ROLLBACK undoes the
--      increment, so a rollback-only verification script consumes ZERO numbers.
--    * duplicate email -> returns its stored number, counter untouched.
--
--  Idempotent, and safe to run from either the `20260902` identity state or a
--  state where `signup_number` was already dropped by a hotfix.
--
--  Scope: `waitlist_signups` + the new `waitlist_counter` only. No touch to
--  public.users / users.email / recipients / transfers / balances / auth /
--  PIN / funding / Crossmint / Solana.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. `signup_number` as a plain integer we assign ourselves.
--    add-then-drop-identity covers both starting states:
--      * 20260902 state: column exists as IDENTITY -> add is a no-op, then
--        DROP IDENTITY removes the property and its owned sequence.
--      * hotfixed state: column absent -> add creates a plain integer, then
--        DROP IDENTITY IF EXISTS is a no-op.
alter table waitlist_signups
  add column if not exists signup_number integer;

alter table waitlist_signups
  alter column signup_number drop identity if exists;

-- 2. Backfill 1..N by signup order for any NULLs. (Coming from 20260902 the
--    identity already filled them; coming from the hotfix this assigns them.
--    Exactly one row today -> #1.)
with ordered as (
  select id, row_number() over (order by created_at, id) as n
    from waitlist_signups
)
update waitlist_signups w
   set signup_number = ordered.n
  from ordered
 where ordered.id = w.id
   and w.signup_number is null;

-- 3. Lock the column down. A unique INDEX (not a named constraint) so the
--    migration stays re-runnable; matches the auto-name 20260902's `unique`
--    would have used, so `if not exists` is a no-op on that path.
alter table waitlist_signups
  alter column signup_number set not null;

create unique index if not exists waitlist_signups_signup_number_key
  on waitlist_signups (signup_number);

-- 4. The counter: one row holding the number the NEXT new signup will get.
create table if not exists waitlist_counter (
  id           boolean primary key default true check (id),  -- singleton guard
  next_number  integer not null
);

insert into waitlist_counter (id, next_number)
values (true, coalesce((select max(signup_number) from waitlist_signups), 0) + 1)
on conflict (id) do nothing;

-- 5. The single entry point for joining the list.
create or replace function public.waitlist_signup(p_email text)
returns table (signup_number integer, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_num   integer;
begin
  perform pg_advisory_xact_lock(hashtext('kobo.waitlist_signup'));

  select w.signup_number into v_num
    from waitlist_signups w
   where w.email = v_email;

  if found then
    -- Already on the list: return the number assigned before, touch nothing.
    signup_number := v_num;
    created := false;
  else
    -- A genuine new signup: take exactly one number off the counter, then insert.
    update waitlist_counter
       set next_number = next_number + 1
     returning next_number - 1
      into v_num;

    insert into waitlist_signups (email, signup_number)
    values (v_email, v_num);

    signup_number := v_num;
    created := true;
  end if;

  return next;
end;
$$;

comment on function public.waitlist_signup(text) is
  'Idempotent waitlist join. Returns (signup_number, created); signup_number is an immutable historical ordinal assigned from waitlist_counter only on a genuine new insert. Advisory-locked; concurrency-safe.';

-- 6. Grants. The backend calls this as the Supabase service role via PostgREST
--    RPC; `anon` / `authenticated` are intentionally not granted.
revoke all on function public.waitlist_signup(text) from public;
grant execute on function public.waitlist_signup(text) to service_role;

-- Housekeeping: an index a superseded design added. No-op elsewhere.
drop index if exists waitlist_signups_created_at_id_idx;
