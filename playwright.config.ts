import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against a running app (default http://localhost:3000).
 * They reset the database named in .env, so point them at a dev database only.
 * Usage: pnpm dev (in another terminal), then pnpm e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
