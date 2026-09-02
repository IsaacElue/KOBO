import "dotenv/config";
import { Client } from "pg";

/**
 * Non-destructive verification of the waitlist numbering: the `waitlist_signup`
 * SQL function + `waitlist_counter` + `GET /waitlist/count`.
 *
 * SAFETY: every check that writes runs inside a transaction that is ALWAYS
 * ROLLED BACK. `waitlist_counter` is a plain row, so a ROLLBACK undoes the
 * increment — this script consumes ZERO signup numbers and can be run against
 * the live database at any time. Nothing is committed; no test row survives.
 *
 *   npx tsx scripts/run-migration.ts supabase/migrations/20260904000000_waitlist_immutable_signup_number.sql
 *   npx tsx scripts/verify-waitlist.ts
 */

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL not set in .env");
const ssl = { rejectUnauthorized: false } as const;

const TEST_DOMAIN = "@waitlist-verify.invalid"; // reserved TLD — never a real address

let ok = true;
function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  if (!cond) ok = false;
}

async function signup(c: Client, email: string): Promise<{ signup_number: number; created: boolean }> {
  const { rows } = await c.query("select signup_number, created from waitlist_signup($1)", [email]);
  return rows[0];
}
const countRows = async (c: Client) =>
  (await c.query("select count(*)::int as n from waitlist_signups")).rows[0].n as number;
const counterValue = async (c: Client) =>
  (await c.query("select next_number from waitlist_counter")).rows[0].next_number as number;

async function main() {
  // ── persistent, read-only snapshot ──────────────────────────────────────
  const ro = new Client({ connectionString: dbUrl, ssl });
  await ro.connect();
  const { rows: liveRows } = await ro.query(
    "select email, signup_number from waitlist_signups order by signup_number"
  );
  const baselineCount = await countRows(ro);
  const baselineCounter = await counterValue(ro);

  console.log(`\nLive waitlist: ${baselineCount} row(s), counter next_number = ${baselineCounter}`);
  for (const r of liveRows) console.log(`  #${r.signup_number}  ${r.email}`);

  check("no stray verification rows committed to the live table", !liveRows.some((r) => r.email.endsWith(TEST_DOMAIN)));
  check(
    "counter is exactly one past the highest assigned number",
    baselineCounter === (liveRows.length ? Math.max(...liveRows.map((r) => r.signup_number)) : 0) + 1,
    baselineCounter
  );
  if (baselineCount === 1) {
    check("the single real signup is #1", liveRows[0].signup_number === 1, liveRows[0]);
    check("counter next_number = 2", baselineCounter === 2);
  }
  await ro.end();

  // ── writes: one transaction, always ROLLED BACK ────────────────────────
  const tx = new Client({ connectionString: dbUrl, ssl });
  await tx.connect();
  try {
    await tx.query("begin");

    // duplicate of an existing real email (mangled case + whitespace):
    // its stored number, created=false, counter untouched
    if (baselineCount >= 1) {
      const dup = await signup(tx, `  ${liveRows[0].email.toUpperCase()}  `);
      check(
        "duplicate of an existing signup → its number, created=false, counter NOT advanced",
        dup.created === false &&
          dup.signup_number === liveRows[0].signup_number &&
          (await counterValue(tx)) === baselineCounter,
        dup
      );
    }

    // next genuinely new unique signup → baseline counter value; counter now +1
    const n1 = await signup(tx, `  A${TEST_DOMAIN.toUpperCase()} `);
    check(`next new unique signup → #${baselineCounter}`, n1.created === true && n1.signup_number === baselineCounter, n1);
    check("counter advanced by exactly 1", (await counterValue(tx)) === baselineCounter + 1);

    // another new unique signup → consecutive
    const n2 = await signup(tx, `b${TEST_DOMAIN}`);
    check(`another new unique signup → #${baselineCounter + 1} (consecutive)`, n2.created === true && n2.signup_number === baselineCounter + 1, n2);

    // duplicate of the just-added email → same number, counter still only +2
    const dup2 = await signup(tx, `  B${TEST_DOMAIN.toUpperCase()}  `);
    check(
      "duplicate submission → same number, does not advance the counter",
      dup2.created === false && dup2.signup_number === n2.signup_number && (await counterValue(tx)) === baselineCounter + 2,
      dup2
    );

    // immutability: an earlier row deleted mid-transaction does NOT renumber the other
    await tx.query("delete from waitlist_signups where email = $1", [`a${TEST_DOMAIN}`]);
    const n2again = await signup(tx, `b${TEST_DOMAIN}`);
    check("after an earlier row is deleted, the other keeps its number (immutable, no re-rank)", n2again.signup_number === n2.signup_number, n2again);
    const n3 = await signup(tx, `c${TEST_DOMAIN}`);
    check("and the next new signup does NOT reuse the deleted number", n3.signup_number === baselineCounter + 2, n3);

    check("count endpoint math holds inside the tx", (await countRows(tx)) === baselineCount + 2);

    await tx.query("rollback");

    check("after ROLLBACK: row count back to baseline (zero residue)", (await countRows(tx)) === baselineCount);
    check("after ROLLBACK: counter back to baseline (zero numbers consumed)", (await counterValue(tx)) === baselineCounter, await counterValue(tx));
  } catch (err) {
    await tx.query("rollback").catch(() => {});
    throw err;
  } finally {
    await tx.end();
  }

  // ── serialization proof: two live connections, both rolled back ─────────
  const a = new Client({ connectionString: dbUrl, ssl });
  const b = new Client({ connectionString: dbUrl, ssl });
  await a.connect();
  await b.connect();
  try {
    await a.query("begin");
    await b.query("begin");

    await signup(a, `race-a${TEST_DOMAIN}`); // A holds the advisory xact lock

    let bDone = false;
    const bCall = signup(b, `race-b${TEST_DOMAIN}`).then((r) => ((bDone = true), r));
    await new Promise((r) => setTimeout(r, 700));
    check("a second concurrent signup BLOCKS while the first holds the lock", bDone === false);

    await a.query("rollback"); // release the lock (and A's row)
    const bResult = await bCall;
    check("the second signup proceeds once the lock is released, taking the next number", bDone === true && bResult.signup_number === baselineCounter, bResult);

    await b.query("rollback");
  } finally {
    await a.end();
    await b.end();
  }

  // ── final: live state is exactly what it was before this run ────────────
  const post = new Client({ connectionString: dbUrl, ssl });
  await post.connect();
  check("live row count unchanged by this verification run", (await countRows(post)) === baselineCount);
  check("live counter unchanged by this verification run", (await counterValue(post)) === baselineCounter);
  const { rows: leaked } = await post.query("select email from waitlist_signups where email like $1", [`%${TEST_DOMAIN}`]);
  check("no verification email committed to the live table", leaked.length === 0);
  await post.end();

  console.log(ok ? "\nALL GOOD ✅  (nothing committed, zero numbers consumed)" : "\nFAILURES ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
