-- ─────────────────────────────────────────────────────────────────────────────
--  ACCESS CONTROL — server-trusted developer/admin role on public.users
--
--  Pre-launch, Kobo runs in waitlist mode: the public must not reach the
--  product (the SPA at "/", "/landing", the authenticated app). A small number
--  of developer accounts must. That decision has to come from trusted
--  server-side data, never a client-supplied flag — this column is that data.
--
--  `access_role` is SEPARATE from `users.role` (which is the money role,
--  'sender' | 'recipient', and is not touched here):
--    * user       — normal account. Blocked from the product while access mode
--                   is 'waitlist'.
--    * developer  — bypasses waitlist gating; may use the developer-only
--                   waitlist test-signup / cleanup tooling.
--    * admin      — reserved; same product access as developer. Assigned to
--                   nobody by this migration.
--
--  The backend reads this in `resolveKoboUser` and, for a developer/admin,
--  mints a short-lived HMAC-signed "access grant" (see
--  backend/src/lib/access-grant.ts) that the Next.js proxy verifies offline.
--
--  Additive and idempotent. No data is seeded here — the one-time production
--  grant is a separate, reviewed operation (backend/scripts/grant-access-role.ts).
--  Not applied automatically: run via scripts/run-migration.ts and record it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table users
  add column if not exists access_role text not null default 'user';

-- Constraint added separately so a re-run doesn't error on an existing one.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_access_role_check'
  ) then
    alter table users
      add constraint users_access_role_check
      check (access_role in ('user', 'developer', 'admin'));
  end if;
end $$;

-- Tiny partial index — the only lookups are "is this user privileged", never
-- "list all normal users".
create index if not exists users_access_role_privileged_idx
  on users (access_role)
  where access_role <> 'user';
