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
const byNumber = (a: number, b: number): number => a - b;

/** An absent value sorts before any present one. */
function absentFirst<T>(a: T | undefined, b: T | undefined, compare: (x: T, y: T) => number) {
  if (a === undefined) return b === undefined ? 0 : -1;
  return b === undefined ? 1 : compare(a, b);
}

const byLocation = (a: Location, b: Location): number =>
  byText(a.file, b.file) ||
  absentFirst(a.line, b.line, byNumber) ||
  absentFirst(a.column, b.column, byNumber);

/** Element by element; a shorter list sorts first when it is a prefix of the other. */
function byLocations(a: readonly Location[], b: readonly Location[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const result = absentFirst(a[i], b[i], byLocation);
    if (result !== 0) return result;
  }
  return 0;
}

/**
 * Total order for findings. The sort keys: severity, the first location's file, line and column
 * (absent first), rule id, target tool, target version, message. Then every remaining field
 * breaks what is left (title, fix, sourceUrl, all locations), so 0 means equal in every field
 * and any input order gives the same output.
 */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    absentFirst(a.locations[0], b.locations[0], byLocation) ||
    byText(a.ruleId, b.ruleId) ||
    byText(a.target.tool, b.target.tool) ||
    byText(a.target.version, b.target.version) ||
    byText(a.message, b.message) ||
    byText(a.title, b.title) ||
    absentFirst(a.fix, b.fix, byText) ||
    byText(a.sourceUrl, b.sourceUrl) ||
    byLocations(a.locations, b.locations)
  );
}
