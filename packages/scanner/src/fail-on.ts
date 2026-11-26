import type { Finding, Severity } from "@neukee/core";

/** `--fail-on`: the lowest severity that makes a scan exit with code 1 (SPEC-SCANNER §1). */
export type FailOn = "action-required" | "warning" | "never";

// A record keyed by the union: a new `--fail-on` value fails to compile until it is listed here.
const BLOCKING: Record<FailOn, readonly Severity[]> = {
  "action-required": ["action-required"],
  warning: ["action-required", "warning"],
  never: [],
};

/** The findings that make the scan exit with code 1. */
export function blockingFindings(findings: readonly Finding[], failOn: FailOn): Finding[] {
  const blocking = BLOCKING[failOn];
  return findings.filter((finding) => blocking.includes(finding.severity));
}
