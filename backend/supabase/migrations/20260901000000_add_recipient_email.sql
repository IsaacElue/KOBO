-- Sprint 1A "Recipient Foundation": add an optional email column for users.
-- Recipients are resolved from email via Crossmint, so their users row can
-- carry the email they signed up with. Email is OPTIONAL: existing rows
-- (legacy recipients, senders) keep email = NULL, and no row is ever
-- required to have an email.
--
-- Additive only: this migration does not touch any other column, constraint,
-- or existing row.

alter table users
  add column if not exists email text;

-- Partial unique index: only non-null emails must be unique. NULLs are
-- exempt from the uniqueness guarantee, so existing recipients/senders
-- without an email are unaffected and no global NOT NULL is introduced.
create unique index if not exists users_email_unique_idx
  on users (email)
  where email is not null;