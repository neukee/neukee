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
  stats: { filesScanned: number; filesSkipped: number; durationMs: number };
}

const SEVERITY_RANK: Record<Severity, number> = { "action-required": 0, warning: 1, info: 2 };

/** Deterministic order: severity, then first file, then first line, then rule id. */
export function compareFindings(a: Finding, b: Finding): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const fileA = a.locations[0]?.file ?? "";
  const fileB = b.locations[0]?.file ?? "";
  if (fileA !== fileB) return fileA < fileB ? -1 : 1;
  const lineDiff = (a.locations[0]?.line ?? 0) - (b.locations[0]?.line ?? 0);
  if (lineDiff !== 0) return lineDiff;
  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
}
