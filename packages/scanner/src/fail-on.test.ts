import type { Finding, Severity } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { blockingFindings } from "./fail-on.js";

const finding = (severity: Severity): Finding => ({
  ruleId: "runtime/below-target",
  severity,
  title: "t",
  message: "m",
  sourceUrl: "https://nodejs.org/en/about/previous-releases",
  locations: [],
  target: { tool: "node", version: "26" },
});
const all = [finding("action-required"), finding("warning"), finding("info")];

describe("blockingFindings (--fail-on, SPEC-SCANNER §1)", () => {
  it("action-required blocks only action-required findings", () => {
    expect(blockingFindings(all, "action-required").map((f) => f.severity)).toEqual([
      "action-required",
    ]);
  });

  it("warning blocks action-required and warning findings, never info", () => {
    expect(blockingFindings(all, "warning").map((f) => f.severity)).toEqual([
      "action-required",
      "warning",
    ]);
  });

  it("never blocks nothing", () => {
    expect(blockingFindings(all, "never")).toEqual([]);
  });

  it("blocks nothing when there are no findings", () => {
    expect(blockingFindings([], "warning")).toEqual([]);
  });
});
