import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    // DB-backed tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
