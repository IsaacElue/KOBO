import "dotenv/config";
import express from "express";
import request from "supertest";
import { supabase } from "../src/lib/supabase";
import { createWaitlistRouter } from "../src/routes/waitlist";
import { createRateLimiter } from "../src/lib/rate-limit";

/**
 * One-off: exercises POST /waitlist/signup + GET /waitlist/count against the
 * REAL Supabase DB, over the real Express router, then deletes every row it
 * created. Run after applying the migration:
 *
 *   npx tsx scripts/verify-waitlist.ts
 */

const stamp = Date.now();
const emails = [
  `verify+${stamp}-a@kobo-test.dev`,
  `verify+${stamp}-b@kobo-test.dev`,
  `verify+${stamp}-c@kobo-test.dev`,
];

function makeApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  // Generous limit so this script's own burst doesn't trip it; the 429 path is
  // covered separately in the unit tests.
  app.use("/waitlist", createWaitlistRouter({ signupRateLimiter: createRateLimiter({ windowMs: 60_000, max: 1000 }) }));
  return app;
}

async function cleanup() {
  const { error } = await supabase.from("waitlist_signups").delete().in("email", emails);
  if (error) console.warn("cleanup warning:", error.message);
}

async function main() {
  const app = makeApp();
  let ok = true;
  const check = (label: string, cond: boolean) => {
    console.log(`${cond ? "✓" : "✗"} ${label}`);
    if (!cond) ok = false;
  };

  await cleanup(); // in case a prior run died mid-way

  const countBefore = (await request(app).get("/waitlist/count")).body.total as number;
  check("GET /waitlist/count returns a number", typeof countBefore === "number");

  // 1. First signup → 201 + a numeric signup_number
  const first = await request(app).post("/waitlist/signup").send({ email: emails[0].toUpperCase() });
  check("first signup → 201", first.status === 201);
  check("first signup → { signup_number: <number> }", typeof first.body.signup_number === "number");

  // 2. Same email again (different case / whitespace) → 200 + SAME number (idempotent)
  const again = await request(app).post("/waitlist/signup").send({ email: `  ${emails[0]}  ` });
  check("repeat signup → 200", again.status === 200);
  check("repeat signup → same signup_number", again.body.signup_number === first.body.signup_number);

  // 3. Malformed email → 400, nothing inserted
  const bad = await request(app).post("/waitlist/signup").send({ email: "not-an-email" });
  check("malformed email → 400", bad.status === 400);
  const missing = await request(app).post("/waitlist/signup").send({});
  check("missing email → 400", missing.status === 400);

  // 4. Concurrent signups of two NEW emails → both 201, distinct increasing numbers, no race
  const [b, c] = await Promise.all([
    request(app).post("/waitlist/signup").send({ email: emails[1] }),
    request(app).post("/waitlist/signup").send({ email: emails[2] }),
  ]);
  check("concurrent new signups → both 201", b.status === 201 && c.status === 201);
  const nums = [first.body.signup_number, b.body.signup_number, c.body.signup_number];
  check("all three signup_numbers are distinct", new Set(nums).size === 3);

  // 5. Concurrent DUPLICATE signups of one email → all resolve to the same number
  const dupEmail = `verify+${stamp}-dup@kobo-test.dev`;
  emails.push(dupEmail);
  const dupResults = await Promise.all(
    Array.from({ length: 5 }, () => request(app).post("/waitlist/signup").send({ email: dupEmail }))
  );
  const dupNums = new Set(dupResults.map((r) => r.body.signup_number));
  check("5 concurrent dup signups → 1 distinct number", dupNums.size === 1);
  check("5 concurrent dup signups → all 2xx", dupResults.every((r) => r.status === 200 || r.status === 201));

  // 6. count reflects the 4 new emails
  const countAfter = (await request(app).get("/waitlist/count")).body.total as number;
  check("count increased by exactly 4", countAfter === countBefore + 4);

  await cleanup();
  const countClean = (await request(app).get("/waitlist/count")).body.total as number;
  check("count back to baseline after cleanup", countClean === countBefore);

  console.log(ok ? "\nALL GOOD ✅" : "\nFAILURES ❌");
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  process.exit(1);
});
