import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { validateReport } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { FIXED_SCANNED_AT, matchGolden, scanFixture } from "./testing/scan-fixture.js";

describe("fixture harness", () => {
  it("scans a fixture repo into a valid report with the fixed timestamp", () => {
    const report = scanFixture("empty", [{ tool: "next", version: "16", source: "flag" }]);
    expect(report.scannedAt).toBe(FIXED_SCANNED_AT);
    expect(report.root).toBe(".");
    expect(report.targets).toEqual([{ tool: "next", version: "16", source: "flag" }]);
    expect(validateReport(report).valid).toBe(true);
  });

  it("gives byte-identical output when the same fixture is scanned twice", () => {
    expect(JSON.stringify(scanFixture("empty"))).toBe(JSON.stringify(scanFixture("empty")));
  });

  it("rejects a fixture name that isn't a folder under fixtures/repos/", () => {
    expect(() => scanFixture("does-not-exist")).toThrow(/does-not-exist/);
  });

  it("rejects a fixture path that escapes fixtures/repos/", () => {
    expect(() => scanFixture("../expected")).toThrow(/inside fixtures\/repos/);
  });

  it("rejects an absolute fixture path", () => {
    expect(() => scanFixture(resolve("fixtures/expected"))).toThrow(/inside fixtures\/repos/);
  });

  it("rejects a fixture symlink that resolves outside fixtures/repos/", () => {
    const outside = mkdtempSync(join(tmpdir(), "neukee-fixture-outside-"));
    const linkName = `outside-${basename(outside)}`;
    const link = join(resolve("fixtures/repos"), linkName);
    let linkCreated = false;
    try {
      symlinkSync(outside, link, "junction");
      linkCreated = true;
      expect(() => scanFixture(linkName)).toThrow(/inside fixtures\/repos/);
    } finally {
      if (linkCreated) rmSync(link);
      rmSync(outside, { recursive: true });
    }
  });

  it("rejects an empty golden name", async () => {
    await expect(matchGolden("", scanFixture("empty"))).rejects.toThrow(
      /inside fixtures\/expected/,
    );
  });

  it("rejects a golden path that escapes fixtures/expected/", async () => {
    await expect(matchGolden("../../package", scanFixture("empty"))).rejects.toThrow(
      /inside fixtures\/expected/,
    );
  });

  it("rejects a golden path through a symlink outside fixtures/expected/", async () => {
    const outside = mkdtempSync(join(tmpdir(), "neukee-golden-outside-"));
    const linkName = `outside-${basename(outside)}`;
    const link = join(resolve("fixtures/expected"), linkName);
    let linkCreated = false;
    try {
      symlinkSync(outside, link, "junction");
      linkCreated = true;
      await expect(matchGolden(`${linkName}/empty`, scanFixture("empty"))).rejects.toThrow(
        /inside fixtures\/expected/,
      );
    } finally {
      if (linkCreated) rmSync(link);
      rmSync(outside, { recursive: true });
    }
  });

  // Golden reports live in fixtures/expected/<name>.json. Changing one needs a reason in the
  // commit message and PROGRESS (CLAUDE.md); CI never writes them.
  it("matches the golden report for the discovery repo", async () => {
    await matchGolden("discovery", scanFixture("discovery"));
  });

  it("matches the golden report for the empty repo", async () => {
    await matchGolden("empty", scanFixture("empty"));
  });
});
