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
