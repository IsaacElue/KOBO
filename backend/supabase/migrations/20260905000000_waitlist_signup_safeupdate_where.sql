-- ─────────────────────────────────────────────────────────────────────────────
--  WAITLIST SIGNUP — make the counter UPDATE safe under `safeupdate`
--
--  Bug: POST /waitlist/signup 500s for every genuinely new email with
--       `{"error":"UPDATE requires a WHERE clause"}`. An existing email
--       (dedupe branch, no write) still returns 200.
--
--  Cause: Supabase preloads the `safeupdate` (pg-safeupdate) library for the
--  `authenticator` role that PostgREST uses for ALL REST/RPC calls
--  (`rolconfig: session_preload_libraries=supautils, safeupdate`). It aborts
--  any UPDATE/DELETE that has no WHERE clause. `20260904000000`'s
--  `waitlist_signup()` increments the singleton counter with a bare
--
--      update waitlist_counter set next_number = next_number + 1 ...
--
--  which is fine over a direct `postgres` connection (verify-waitlist.ts,
--  run-migration.ts — no such preload) but rejected on the PostgREST path the
--  live backend actually takes.
--
--  Fix: add `where id` to that one statement. `waitlist_counter.id` is
--  `boolean primary key default true check (id)` — there is always exactly one
--  row and its `id` is always true, so `where id` selects it and nothing else.
--  Numbering is byte-for-byte unchanged: one advisory-locked increment-by-one
--  per genuine new signup, rollback-safe, duplicates still touch nothing.
--
--  Scope: replaces the body of `public.waitlist_signup(text)` only. No schema
--  change, no counter/table change, no touch to users / recipients / transfers
--  / balances / auth / PIN / funding / Solana / frontend.
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- `where id` is required by `safeupdate` on the PostgREST path; the counter
    -- is a singleton (`id boolean primary key ... check (id)`) so it is a no-op
    -- filter that always matches the one row.
    update waitlist_counter
       set next_number = next_number + 1
     where id
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
  'Idempotent waitlist join. Returns (signup_number, created); signup_number is an immutable historical ordinal assigned from waitlist_counter only on a genuine new insert. Advisory-locked; concurrency-safe. Counter UPDATE carries `where id` for safeupdate on the PostgREST path.';

revoke all on function public.waitlist_signup(text) from public;
grant execute on function public.waitlist_signup(text) to service_role;
