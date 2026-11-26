import type { Diagnostic, Finding } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { sortAndDedupe, sortDiagnostics, sortedUnique } from "./report.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "runtime/below-target",
    severity: "warning",
    title: "Declared Node.js version is below the upgrade target",
    message: "message",
    sourceUrl: "https://nodejs.org/en/about/previous-releases",
    locations: [{ file: ".nvmrc", line: 1, column: 1 }],
    target: { tool: "node", version: "26" },
    ...over,
  };
}

describe("sortAndDedupe", () => {
  it("puts the most severe first, then by the first location", () => {
    const info = finding({ severity: "info" });
    const late = finding({ locations: [{ file: "package.json", line: 2, column: 3 }] });
    const early = finding({ locations: [{ file: ".nvmrc", line: 1, column: 1 }] });
    const blocking = finding({ severity: "action-required" });
    expect(sortAndDedupe([info, late, early, blocking])).toEqual([blocking, early, late, info]);
  });

  it("drops a finding that is equal in every field, however many times it repeats", () => {
    const one = finding();
    const same = finding();
    const other = finding({ message: "another" });
    // "another" sorts before "message".
    expect(sortAndDedupe([one, other, same, finding()])).toEqual([other, one]);
  });

  it("keeps findings that differ in any field, even only in a later location", () => {
    const a = finding({ locations: [{ file: "a" }, { file: "b" }] });
    const b = finding({ locations: [{ file: "a" }, { file: "c" }] });
    expect(sortAndDedupe([b, a])).toEqual([a, b]);
  });

  it("gives the same output for any input order and leaves its input alone", () => {
    const list = [
      finding({ severity: "info" }),
      finding({ ruleId: "runtime/end-of-life" }),
      finding({ message: "z" }),
      finding(),
    ];
    const forward = sortAndDedupe(list);
    expect(sortAndDedupe([...list].reverse())).toEqual(forward);
    expect(list[0]?.severity).toBe("info");
  });

  it("returns an empty list for no findings", () => {
    expect(sortAndDedupe([])).toEqual([]);
  });
});

describe("sortDiagnostics", () => {
  const note = (over: Partial<Diagnostic>): Diagnostic => ({
    level: "warning",
    message: "m",
    ...over,
  });

  it("puts diagnostics without a file first, then orders by file, level and message", () => {
    const noFile = note({});
    const a = note({ file: "a.json" });
    const bError = note({ file: "b.json", level: "error" });
    const bWarningA = note({ file: "b.json", message: "a" });
    const bWarningB = note({ file: "b.json", message: "b" });
    expect(sortDiagnostics([bWarningB, a, bWarningA, bError, noFile])).toEqual([
      noFile,
      a,
      bError,
      bWarningA,
      bWarningB,
    ]);
  });

  it("compares by code unit, so upper-case names come before lower-case ones", () => {
    const lower = note({ file: "a" });
    const upper = note({ file: "B" });
    expect(sortDiagnostics([lower, upper])).toEqual([upper, lower]);
  });
});

describe("sortedUnique", () => {
  it("drops repeats and orders by code unit, never by locale", () => {
    expect(sortedUnique(["b", "a", "B", "a", ">=20", "22"])).toEqual(["22", ">=20", "B", "a", "b"]);
  });
});
