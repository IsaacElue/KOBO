import "dotenv/config";
import { Client } from "pg";

/**
 * DEVELOPER / OPERATOR TOOL — one-time production seed of `users.access_role`.
 *
 * Grants access_role = 'developer' to the confirmed Kobo developer accounts.
 * Does NOT touch users.role (sender/recipient), wallet data, auth credentials,
 * PINs, payment data, or waitlist numbering.
 *
 *   npx tsx scripts/grant-access-role.ts           # dry run (prints, rolls back)
 *   npx tsx scripts/grant-access-role.ts --apply   # commit
 *
 * Safety: verifies each email resolves to EXACTLY ONE auth.users row AND
 * exactly one linked public.users row before writing. If any email is missing
 * or ambiguous it aborts and changes nothing — it never creates an account.
 * Idempotent: re-running is a no-op once the roles are set.
 */

// Confirmed with the account owner (audit: both are existing sender accounts
// with a single auth.users row each).
const DEVELOPER_EMAILS = ["elueisaac14@gmail.com", "shinaanafi10@gmail.com"];
const TARGET_ROLE = "developer";

const apply = process.argv.includes("--apply");

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not set in .env");

  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");

    // Guard: access_role column must exist (migration 20260906000000 applied).
    const col = await c.query(
      `select 1 from information_schema.columns
        where table_schema='public' and table_name='users' and column_name='access_role'`
    );
    if (col.rowCount === 0) {
      throw new Error("users.access_role does not exist — apply 20260906000000_add_user_access_role.sql first");
    }

    const resolved: { email: string; usersId: string; authId: string; current: string }[] = [];
    for (const email of DEVELOPER_EMAILS) {
      const rows = await c.query(
        `select u.id as users_id, u.auth_user_id, u.access_role, au.id as auth_id
           from auth.users au
           join public.users u on u.auth_user_id = au.id
          where lower(au.email) = lower($1)`,
        [email]
      );
      if (rows.rowCount === 0) {
        throw new Error(`ABORT: ${email} — no linked auth.users + public.users record. Not creating one.`);
      }
      if (rows.rowCount > 1) {
        throw new Error(`ABORT: ${email} — resolves to ${rows.rowCount} records, ambiguous.`);
      }
      const r = rows.rows[0];
      resolved.push({ email, usersId: r.users_id, authId: r.auth_id, current: r.access_role });
    }

    console.log("Resolved developer accounts:");
    for (const r of resolved) {
      console.log(`  ${r.email}  users.id=${r.usersId}  auth.id=${r.authId}  access_role: ${r.current} -> ${TARGET_ROLE}`);
    }

    for (const r of resolved) {
      await c.query(`update public.users set access_role = $1 where id = $2`, [TARGET_ROLE, r.usersId]);
    }

    const after = await c.query(
      `select au.email, u.access_role
         from public.users u join auth.users au on au.id = u.auth_user_id
        where u.access_role <> 'user' order by au.email`
    );
    console.log("\nPrivileged accounts after this change:");
    console.table(after.rows);

    if (apply) {
      await c.query("commit");
      console.log("\nCOMMITTED ✅");
    } else {
      await c.query("rollback");
      console.log("\nDRY RUN — rolled back. Re-run with --apply to commit.");
    }
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
