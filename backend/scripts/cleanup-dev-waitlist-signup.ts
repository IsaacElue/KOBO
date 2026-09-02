import "dotenv/config";
import { Client } from "pg";

/**
 * DEVELOPER / OPERATOR TOOL — one-time, pre-launch cleanup of the SOLE known
 * developer/test signup from the genuine waitlist.
 *
 * Context: `elueisaac7@gmail.com` = #1 was a developer test, not a real
 * customer. Pre-launch we want the genuine waitlist to start empty so the first
 * real public signup receives #1.
 *
 *   npx tsx scripts/cleanup-dev-waitlist-signup.ts           # dry run
 *   npx tsx scripts/cleanup-dev-waitlist-signup.ts --apply   # commit
 *
 * This is the ONE sanctioned exception to "never rewind the counter": it is a
 * pre-launch reset of the only known test row, not a response to a deleted
 * genuine signup. After launch this must never be run again.
 *
 * Hard guards (abort + change nothing if any fails):
 *   - waitlist_signups contains EXACTLY ONE row
 *   - that row is elueisaac7@gmail.com with signup_number = 1
 *   - waitlist_counter.next_number = 2
 * On success: delete that row, set waitlist_counter.next_number = 1.
 * Never touches users / auth / balances / transfers / test signups.
 */

const DEV_EMAIL = "elueisaac7@gmail.com";
const apply = process.argv.includes("--apply");

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not set in .env");

  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");

    const rows = (await c.query("select email, signup_number from waitlist_signups order by signup_number")).rows;
    const counter = (await c.query("select next_number from waitlist_counter")).rows[0]?.next_number;

    console.log("Current waitlist_signups:", rows);
    console.log("Current waitlist_counter.next_number:", counter);

    if (rows.length !== 1) {
      throw new Error(`ABORT: expected exactly 1 waitlist row, found ${rows.length}`);
    }
    if (rows[0].email !== DEV_EMAIL || rows[0].signup_number !== 1) {
      throw new Error(`ABORT: the single row is not ${DEV_EMAIL} #1 (got ${rows[0].email} #${rows[0].signup_number})`);
    }
    if (counter !== 2) {
      throw new Error(`ABORT: expected waitlist_counter.next_number = 2, found ${counter}`);
    }

    const del = await c.query("delete from waitlist_signups where email = $1 returning email, signup_number", [DEV_EMAIL]);
    await c.query("update waitlist_counter set next_number = 1 where id");

    const afterRows = (await c.query("select email, signup_number from waitlist_signups")).rows;
    const afterCounter = (await c.query("select next_number from waitlist_counter")).rows[0].next_number;
    console.log(`\nDeleted:`, del.rows);
    console.log("After — waitlist_signups:", afterRows, "counter.next_number:", afterCounter);

    if (afterRows.length !== 0 || afterCounter !== 1) {
      throw new Error("ABORT: post-state check failed");
    }

    if (apply) {
      await c.query("commit");
      console.log("\nCOMMITTED ✅  The next genuine public signup will be #1.");
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
