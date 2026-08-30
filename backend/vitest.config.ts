import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    environment: "node",
    // Unit tests run with no DB by default; live Supabase tests are opt-in
    // via RUN_DB_TESTS=1 (see src/test/balances-live.test.ts).
    env: {
      RUN_DB_TESTS: process.env.RUN_DB_TESTS ?? "0",
    },
    // The live tests intentionally create + delete a test user; keep them
    // from running in parallel with each other to avoid cross-test cleanup.
    fileParallelism: false,
  },
});