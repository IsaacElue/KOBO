// Vitest doesn't load .env the way `scripts/*.ts` do (each has its own
// `import "dotenv/config"` as the first line). Every backend module that
// throws-at-import on a missing env var (supabase.ts, moonpay.ts, transak.ts,
// crossmint.ts) needs this loaded before anything else imports them.
import "dotenv/config";
