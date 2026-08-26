-- Real auth: link `users` to Supabase Auth accounts, add a PIN fast-unlock hash.
--
-- auth_user_id is nullable, not a NOT NULL/role-conditioned FK: recipients
-- (role = 'recipient') are payees, not logged-in accounts, and never get a
-- Supabase Auth user behind them. Only real sender signups (POST /auth/signup)
-- populate it. A NOT NULL check for role = 'sender' was considered and
-- rejected here — it would fail this migration outright against the existing
-- demo sender row created before real auth existed.
alter table users
  add column auth_user_id uuid unique references auth.users (id) on delete cascade,
  add column pin_hash text;
