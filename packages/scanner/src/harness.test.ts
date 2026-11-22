import { validateReport } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { FIXED_SCANNED_AT, matchGolden, scanFixture } from "./testing/scan-fixture.js";

describe("fixture harness", () => {
  it("scans a fixture repo into a valid report with the fixed timestamp", () => {
    const report = scanFixture("empty", [{ tool: "next", version: "16" }]);
    expect(report.scannedAt).toBe(FIXED_SCANNED_AT);
    expect(report.root).toBe(".");
    expect(report.targets).toEqual([{ tool: "next", version: "16" }]);
    expect(validateReport(report).valid).toBe(true);
  });

  it("gives byte-identical output when the same fixture is scanned twice", () => {
    expect(JSON.stringify(scanFixture("empty"))).toBe(JSON.stringify(scanFixture("empty")));
  });

  it("rejects a fixture name that isn't a folder under fixtures/repos/", () => {
    expect(() => scanFixture("does-not-exist")).toThrow(/does-not-exist/);
  });

  // Golden reports live in fixtures/expected/<name>.json. Changing one needs a reason in the
  // commit message and PROGRESS (CLAUDE.md); CI never writes them.
  it("matches the golden report for the empty repo", async () => {
    await matchGolden("empty", scanFixture("empty"));
  });
});
