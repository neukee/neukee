import { describe, expect, it, vi } from "vitest";

// A package.json without a version is a broken install: exit 3 with a short message, not an
// uncaught exception (exit 1 would read as "blocking findings" in CI).
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    readFileSync: (path: Parameters<typeof original.readFileSync>[0], ...rest: unknown[]) =>
      String(path).replaceAll("\\", "/").endsWith("packages/cli/package.json")
        ? "{}"
        : Reflect.apply(original.readFileSync, original, [path, ...rest]),
  };
});

const { run } = await import("./run.js");

describe("a broken install", () => {
  it("exits 3 with a short message for --version and for scan", () => {
    for (const argv of [["--version"], ["scan", "."]]) {
      const result = run(argv, { color: false });
      expect(result.code, argv.join(" ")).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("internal error (Error)");
      expect(result.stderr).not.toContain("has no version");
      expect(result.stderr).not.toContain("    at ");
    }
  });
});
