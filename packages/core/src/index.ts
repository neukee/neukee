/**
 * Core types: the contract between packages and the shape of every report.
 * Changing these is a schema change — see docs/ARCHITECTURE.md §5 and add a decision record.
 */

export { type ReportValidation, type ValidationError, validateReport } from "./validate.js";

export const SCHEMA_VERSION = 1 as const;

export type Severity = "action-required" | "warning" | "info";

export type Tool = "node" | "next" | "react" | "prisma";

export interface Target {
  tool: Tool;
  /** Major version or full version, e.g. "24" or "16.0.0". */
  version: string;
}

export interface Location {
  /** Repo-relative path with forward slashes. Never absolute. */
  file: string;
  line?: number;
  column?: number;
}

export interface Finding {
  /** Matches a catalog entry id, e.g. "next16/sync-request-apis". */
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  fix?: string;
  /** Official release note or migration guide. */
  sourceUrl: string;
  locations: Location[];
  target: Target;
}

export interface Diagnostic {
  level: "error" | "warning";
  message: string;
  file?: string;
}

export interface ScanReport {
  schemaVersion: typeof SCHEMA_VERSION;
  tool: { name: string; version: string };
  /** The only non-deterministic field; excluded from snapshots. */
  scannedAt: string;
  /** Always "." — reports never contain absolute paths. */
  root: ".";
  targets: Target[];
  detected: { node: string[]; packageManager?: string; frameworks: Record<string, string> };
  findings: Finding[];
  diagnostics: Diagnostic[];
  /** Counts only: timing would differ on every run (see T-033 for an opt-in flag later). */
  stats: { filesScanned: number; filesSkipped: number };
}

const SEVERITY_RANK: Record<Severity, number> = { "action-required": 0, warning: 1, info: 2 };

/** Code-unit order, so the result never depends on the machine's locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Total order for findings: severity, first location's file, line and column (absent sorts
 * first), rule id, target tool, target version, message. Any input order gives the same output.
 */
export function compareFindings(a: Finding, b: Finding): number {
  const first = a.locations[0];
  const second = b.locations[0];
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    byText(first?.file ?? "", second?.file ?? "") ||
    (first?.line ?? 0) - (second?.line ?? 0) ||
    (first?.column ?? 0) - (second?.column ?? 0) ||
    byText(a.ruleId, b.ruleId) ||
    byText(a.target.tool, b.target.tool) ||
    byText(a.target.version, b.target.version) ||
    byText(a.message, b.message)
  );
}
