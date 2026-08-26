import "dotenv/config";
import { readFileSync } from "fs";
import { Client } from "pg";

// One-off migration runner — applies a single .sql file from
// supabase/migrations/ directly against SUPABASE_DB_URL. Supabase CLI isn't
// usable in this environment (no auth, no Docker for local dev), and
// PostgREST (the service-role REST API) can't execute DDL at all — this is
// the direct-Postgres-connection fallback.

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/run-migration.ts <path-to-sql-file>");

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not set in .env");

  const sql = readFileSync(file, "utf-8");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied migration: ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:");
  console.error(err);
  process.exit(1);
});
