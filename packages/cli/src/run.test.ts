import { describe, expect, it } from "vitest";
import { run } from "./run.js";

describe("cli", () => {
  it("prints its version", () => {
    const result = run(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("prints help with no arguments", () => {
    expect(run([]).stdout).toContain("Usage:");
  });

  it("exits 2 on an unknown flag (usage error)", () => {
    const result = run(["--nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });
});
