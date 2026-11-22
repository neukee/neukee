import { describe, expect, it } from "vitest";
import { compareFindings, type Finding, SCHEMA_VERSION } from "./index.js";

const finding = (overrides: Partial<Finding>): Finding => ({
  ruleId: "x/rule",
  severity: "warning",
  title: "t",
  message: "m",
  sourceUrl: "https://nodejs.org/",
  locations: [{ file: "a.ts", line: 1 }],
  target: { tool: "node", version: "24" },
  ...overrides,
});

describe("core", () => {
  it("is on schema version 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("sorts findings deterministically: severity, file, line, rule id", () => {
    const input = [
      finding({ ruleId: "b", severity: "info" }),
      finding({ ruleId: "c", locations: [{ file: "b.ts", line: 1 }] }),
      finding({ ruleId: "d", locations: [{ file: "a.ts", line: 9 }] }),
      finding({ ruleId: "a", severity: "action-required" }),
      finding({ ruleId: "e", locations: [{ file: "a.ts", line: 1 }] }),
    ];
    const order = [...input].sort(compareFindings).map((f) => f.ruleId);
    expect(order).toEqual(["a", "e", "d", "c", "b"]);
    // Same result regardless of input order.
    expect(
      [...input]
        .reverse()
        .sort(compareFindings)
        .map((f) => f.ruleId),
    ).toEqual(order);
  });
});

describe("compareFindings: a total order", () => {
  const at = (file: string, line?: number, column?: number) => ({
    locations: [
      {
        file,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
      },
    ],
  });

  // Each pair differs only in the named key; the first must sort before the second.
  const ties: [string, Partial<Finding>, Partial<Finding>][] = [
    [
      "severity (action-required < warning)",
      { severity: "action-required" },
      { severity: "warning" },
    ],
    ["severity (warning < info)", { severity: "warning" }, { severity: "info" }],
    ["file", at("a.ts", 1), at("b.ts", 1)],
    ["no location before any file", { locations: [] }, at("a.ts")],
    ["line", at("a.ts", 2), at("a.ts", 10)],
    ["no line before line 1", at("a.ts"), at("a.ts", 1)],
    ["column", at("a.ts", 1, 2), at("a.ts", 1, 10)],
    ["no column before column 1", at("a.ts", 1), at("a.ts", 1, 1)],
    ["ruleId", { ruleId: "a/x" }, { ruleId: "b/x" }],
    [
      "target.tool",
      { target: { tool: "next", version: "24" } },
      { target: { tool: "node", version: "24" } },
    ],
    [
      "target.version",
      { target: { tool: "node", version: "22" } },
      { target: { tool: "node", version: "24" } },
    ],
    ["message", { message: "a" }, { message: "b" }],
  ];

  it.each(ties)("breaks a tie on %s", (_, first, second) => {
    expect(compareFindings(finding(first), finding(second))).toBeLessThan(0);
    expect(compareFindings(finding(second), finding(first))).toBeGreaterThan(0);
  });

  // Each pair: an earlier key decides even though the next key points the other way.
  const precedence: [string, Partial<Finding>, Partial<Finding>][] = [
    [
      "severity over file",
      { severity: "action-required", ...at("z.ts") },
      { severity: "info", ...at("a.ts") },
    ],
    ["file over line", at("a.ts", 9), at("b.ts", 1)],
    ["line over column", at("a.ts", 1, 9), at("a.ts", 2, 1)],
    [
      "column over ruleId",
      { ...at("a.ts", 1, 1), ruleId: "z/x" },
      { ...at("a.ts", 1, 2), ruleId: "a/x" },
    ],
    [
      "ruleId over target.tool",
      { ruleId: "a/x", target: { tool: "node", version: "24" } },
      { ruleId: "b/x", target: { tool: "next", version: "24" } },
    ],
    [
      "target.tool over target.version",
      { target: { tool: "next", version: "24" } },
      { target: { tool: "node", version: "22" } },
    ],
    [
      "target.version over message",
      { target: { tool: "node", version: "22" }, message: "z" },
      { target: { tool: "node", version: "24" }, message: "a" },
    ],
  ];

  it.each(precedence)("orders keys correctly: %s", (_, first, second) => {
    expect(compareFindings(finding(first), finding(second))).toBeLessThan(0);
    expect(compareFindings(finding(second), finding(first))).toBeGreaterThan(0);
  });

  it("compares text by code unit, not by locale", () => {
    expect(compareFindings(finding(at("Z.ts")), finding(at("a.ts")))).toBeLessThan(0);
    expect(compareFindings(finding({ message: "B" }), finding({ message: "a" }))).toBeLessThan(0);
  });

  it("returns 0 only for findings equal on every key", () => {
    expect(compareFindings(finding({}), finding({}))).toBe(0);
  });

  // Seeded, so the test itself is deterministic (no Math.random).
  function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled<T>(items: readonly T[], random: () => number): T[] {
    return items
      .map((item) => ({ item, key: random() }))
      .sort((x, y) => x.key - y.key)
      .map(({ item }) => item);
  }

  it("gives identical output for the same findings shuffled 100 times", () => {
    // Every combination of two values per sort key: 2^8 = 256 findings that tie on all keys but one.
    const all: Finding[] = [];
    for (const severity of ["action-required", "info"] as const)
      for (const file of ["a.ts", "b.ts"])
        for (const line of [1, 2])
          for (const column of [1, 2])
            for (const ruleId of ["a/x", "b/x"])
              for (const tool of ["next", "node"] as const)
                for (const version of ["22", "24"])
                  for (const message of ["a", "b"])
                    all.push(
                      finding({
                        severity,
                        ...at(file, line, column),
                        ruleId,
                        target: { tool, version },
                        message,
                      }),
                    );
    expect(all).toHaveLength(256);

    const expected = JSON.stringify([...all].sort(compareFindings));
    const random = seededRandom(20261122);
    for (let run = 0; run < 100; run++) {
      const input = shuffled(all, random);
      expect(JSON.stringify(input)).not.toBe(expected); // the shuffle really reorders
      expect(JSON.stringify(input.sort(compareFindings))).toBe(expected);
    }
  });
});
