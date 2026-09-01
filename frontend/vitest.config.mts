import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    css: true,
    // Several suites drive fake timers through multi-step flows (send checklist,
    // undo grace, on-ramp polling, focus-return assertions). Under parallel load
    // the default 5s ceiling is occasionally missed on a rotating subset of them
    // — not a real hang, just CPU contention pushing an `advanceTimersByTime` /
    // `waitFor` window past 5s. 15s gives headroom without masking a genuine hang.
    testTimeout: 15000,
    // Cap worker parallelism (pool defaults to "forks"). Vitest otherwise scales
    // to ~one worker per core; on an 8-core dev machine that's 8 jsdom + SWC
    // workers plus the coordinator all contending, which is what starves the
    // timer suites above. 4 leaves roughly half the cores for Vite/main/OS — the
    // same "half the cores" heuristic Vitest itself used as its old default.
    // It's a ceiling, so smaller CI runners (GitHub-hosted ubuntu = 2 cores) are
    // unaffected and just run ~2-wide as before. (Vitest 4 unified the old
    // poolOptions.{forks.maxForks,threads.maxThreads} into this one option.)
    pool: "forks",
    maxWorkers: 4,
  },
});
