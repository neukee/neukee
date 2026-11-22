import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source during tests.
    conditions: ["@neukee/source"],
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/testing/**", "packages/cli/src/index.ts"],
    },
  },
});
