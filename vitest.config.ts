import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Playwright browser specs live in tests/ui and run with `npm run test:ui`.
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration files share one database (and its call-capacity limits),
    // so files run one at a time; tests inside a file still run in order.
    fileParallelism: false,
  },
});
