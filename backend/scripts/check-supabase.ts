import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  }

  const supabase = createClient(url, key);

  // No schema exists yet, so just confirm the client can authenticate and
  // reach the project via an admin API call rather than a table query.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

  if (error) {
    throw error;
  }

  console.log("Supabase connectivity check succeeded.");
  console.log(`Reached project: ${url}`);
  console.log(`Auth admin API responded. Users on page 1: ${data.users.length}`);
}

main().catch((err) => {
  console.error("Supabase connectivity check failed:");
  console.error(err);
  process.exit(1);
});
