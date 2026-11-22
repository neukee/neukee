import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source during tests.
    conditions: ["@neukee/source"],
    alias: {
      "@neukee/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@neukee/scanner": fileURLToPath(new URL("./packages/scanner/src/index.ts", import.meta.url)),
      "@neukee/cli": fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url)),
    },
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
