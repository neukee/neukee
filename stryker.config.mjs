// Mutation testing: plants small bugs in source code and checks that tests catch them.
// Pull requests run it on changed files only (incremental); a nightly workflow runs it in full.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.ts" },
  coverageAnalysis: "perTest",
  mutate: [
    "packages/*/src/**/*.ts",
    "!packages/*/src/**/*.test.ts",
    "!packages/*/src/testing/**",
    "!packages/cli/src/index.ts",
  ],
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  thresholds: { high: 80, low: 60, break: 60 },
  concurrency: 4,
  tempDirName: ".stryker-tmp",
};
