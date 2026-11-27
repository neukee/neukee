import type { CatalogEntry, Finding, Location, ReportTarget, Severity } from "@neukee/core";
import { gtr, intersects, validRange } from "semver";
import { endOfLife, ltsMajor, majorLines, releaseLine } from "./node-releases.js";
import type { NodeVersionDeclaration } from "./runtime-sources.js";

/**
 * Runtime findings (T-014, docs/SPEC-SCANNER.md §1 and §2.1, ADR-020, ADR-021) from T-010's
 * declarations: `runtime/sources-disagree` per package, `runtime/below-target` and
 * `runtime/end-of-life` per declaration. Knowledge (title, severity, why, fix, source) comes from
 * the catalog entries. Never throws.
 */
export function runtimeFindings(input: {
  declarations: readonly NodeVersionDeclaration[];
  /** Repo-relative folders that hold a package.json ("" for the root). */
  packageDirs: readonly string[];
  /** A node target whose `source` is "default" softens below-target (ADR-021). */
  targets: readonly ReportTarget[];
  entries: readonly CatalogEntry[];
  /** The report's scannedAt; its date dates end-of-life and support left. */
  scannedAt: string;
}): Finding[] {
  const target = input.targets.find((t) => t.tool === "node");
  const targetMajor = target === undefined ? undefined : TARGET.exec(target.version)?.[1];
  if (target === undefined || targetMajor === undefined) return [];
  // A date we can't read dates nothing: no end-of-life, no softening.
  const date = DATE.exec(input.scannedAt)?.[0];
  const findings: Finding[] = [];
  const add = (id: RuntimeRuleId, detail: string, locations: Location[], severity?: Severity) => {
    const rule = input.entries.find((e) => e.id === id);
    if (rule === undefined) return;
    findings.push({
      ruleId: rule.id,
      severity: severity ?? rule.severity,
      title: rule.title,
      message: `${detail}. ${rule.message}`,
      ...(rule.fix === undefined ? {} : { fix: rule.fix }),
      sourceUrl: rule.sourceUrl,
      locations,
      // The finding's own target is the plain Target: `source` belongs to the report's list.
      target: { tool: target.tool, version: target.version },
    });
  };

  const reported = new Set<string>();
  const scopes = scopesByDirectory(input.declarations);
  // Folders are repo-relative with no trailing slash ("apps/web"); tolerate one anyway.
  const packageDirs = input.packageDirs.map((dir) => (dir.endsWith("/") ? dir.slice(0, -1) : dir));
  for (const dir of packageDirs.sort()) {
    for (const pair of disagreements(scopes, dir)) {
      const [first, second] = pair.sort((a, b) => byLocation(a.location, b.location));
      const key = JSON.stringify([first.location, second.location]);
      if (reported.has(key)) continue; // one pair can cover many packages
      reported.add(key);
      add("runtime/sources-disagree", `${describe(first)}, but ${describe(second)}`, [
        first.location,
        second.location,
      ]);
    }
  }

  for (const declaration of input.declarations) {
    const line = belowTargetLine(declaration, targetMajor);
    if (line === undefined) continue;
    add(
      "runtime/below-target",
      `${describe(declaration)}, below the target Node.js ${targetMajor}`,
      [declaration.location],
      target.source === "default" ? softened(line, date) : undefined,
    );
  }

  for (const declaration of input.declarations) {
    const line = lineOf(declaration);
    const end = line === undefined ? undefined : endOfLife(line);
    if (end !== undefined && date !== undefined && date > end) {
      add("runtime/end-of-life", `${describe(declaration)}, which reached end-of-life on ${end}`, [
        declaration.location,
      ]);
    }
  }
  return findings;
}

/** The catalog entries this detector builds its findings from. */
const RUNTIME_RULE_IDS = [
  "runtime/below-target",
  "runtime/end-of-life",
  "runtime/sources-disagree",
] as const;
type RuntimeRuleId = (typeof RUNTIME_RULE_IDS)[number];

/**
 * The runtime rules a catalog lacks. `runtimeFindings` skips a rule it can't find, so a catalog
 * without one would look like a clean repository; callers check this first.
 */
export function missingRuleIds(entries: readonly CatalogEntry[]): string[] {
  return RUNTIME_RULE_IDS.filter((id) => !entries.some((entry) => entry.id === id));
}

// A target major of up to nine digits without a leading zero, alone or before a `.`: "26",
// "26.1.0". semver rejects "026", so anything else would make it throw.
const TARGET = /^(0|[1-9]\d{0,8})(?:\.|$)/;
const DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Below-target under the default target (Sreeram, ADR-021): info while the declared line has at
 * least 12 months of support left from the scan date, warning when it has less or the date or
 * line is unknown. An explicit `--target` keeps the catalog's severity.
 */
function softened(line: string, date: string | undefined): Severity {
  const end = endOfLife(line);
  if (date === undefined || end === undefined) return "warning";
  const yearLater = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
  return end >= yearLater ? "info" : "warning";
}

/**
 * The release line to report when a declaration is below the target: the line a pin selects, or
 * the newest line an `engines.node` range allows when every version it allows is below. To npm
 * a range is advisory; hosting platforms such as Vercel and Heroku read it to choose the runtime
 * (ADR-023).
 */
function belowTargetLine(
  declaration: NodeVersionDeclaration,
  targetMajor: string,
): string | undefined {
  const major = majorOf(declaration);
  if (major !== undefined)
    return Number(major) < Number(targetMajor) ? lineOf(declaration) : undefined;
  const { version } = declaration;
  if (version.kind !== "range" || validRange(version.range) === null) return undefined;
  if (!gtr(`${targetMajor}.0.0`, version.range)) return undefined;
  return majorLines().find((line) => intersects(version.range, `${line}.x`)) ?? "";
}

/**
 * How far a declaration reaches: `.nvmrc` and `.node-version` pins cover their folder and below
 * (nvm walks up to the nearest); the `volta.node` pin and the `engines.node` range cover their own
 * package only (Volta needs `extends` to share a pin, which isn't followed yet; ADR-020).
 */
type Reach = "subtree" | "package";

function reachOf(declaration: NodeVersionDeclaration): Reach {
  switch (declaration.source) {
    case "nvmrc":
    case "node-version":
      return "subtree";
    case "engines":
    case "volta":
      return "package";
    default:
      return unreachable(declaration.source);
  }
}

function directoryOf(declaration: NodeVersionDeclaration): string {
  const file = declaration.location.file;
  return file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
}

/** Declarations grouped by folder once, so each package walks only its own ancestors. */
function scopesByDirectory(
  declarations: readonly NodeVersionDeclaration[],
): Map<string, NodeVersionDeclaration[]> {
  const byDirectory = new Map<string, NodeVersionDeclaration[]>();
  for (const declaration of declarations) {
    const dir = directoryOf(declaration);
    byDirectory.set(dir, [...(byDirectory.get(dir) ?? []), declaration]);
  }
  return byDirectory;
}

/** `dir`, then each parent folder up to the root (""). */
function* selfAndAncestors(dir: string): Generator<string> {
  let current = dir;
  while (current !== "") {
    yield current;
    current = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
  }
  yield "";
}

/**
 * The pairs that disagree in one package: its applicable pins (package-reach ones from its own
 * folder; subtree ones from the nearest folder that has that kind, every one of them) with
 * different majors, and each pin its own engines.node doesn't allow.
 */
function disagreements(
  scopes: Map<string, NodeVersionDeclaration[]>,
  dir: string,
): [NodeVersionDeclaration, NodeVersionDeclaration][] {
  const applicable: NodeVersionDeclaration[] = [];
  const found = new Set<string>();
  for (const folder of selfAndAncestors(dir)) {
    const here = (scopes.get(folder) ?? []).filter(
      (d) => (folder === dir || reachOf(d) === "subtree") && !found.has(d.source),
    );
    applicable.push(...here);
    for (const d of here) found.add(d.source);
  }
  const ranges = applicable.filter((d) => d.source === "engines");
  // Each pin with the major it selects; unpinned aliases and ranges select none.
  const pins = applicable.flatMap((declaration) => {
    if (declaration.source === "engines") return [];
    const major = majorOf(declaration);
    return major === undefined ? [] : [{ declaration, major }];
  });
  const pairs: [NodeVersionDeclaration, NodeVersionDeclaration][] = [];
  for (const [i, a] of pins.entries()) {
    for (const b of pins.slice(i + 1)) {
      if (a.major !== b.major) pairs.push([a.declaration, b.declaration]);
    }
  }
  for (const range of ranges) {
    if (range.version.kind !== "range") continue;
    for (const { declaration, major } of pins) {
      if (!allowsMajor(range.version.range, major)) pairs.push([declaration, range]);
    }
  }
  return pairs;
}

/** The major a pin selects: a version's first part, or an LTS codename's line. */
function majorOf(declaration: NodeVersionDeclaration): string | undefined {
  const { version } = declaration;
  switch (version.kind) {
    case "version":
      return version.version.split(".")[0];
    case "lts":
      return ltsMajor(version.codename);
    case "range":
    case "unpinned":
      return undefined;
    default:
      return unreachable(version);
  }
}

/** The release line a pin selects (0.x lines keep their minor). */
function lineOf(declaration: NodeVersionDeclaration): string | undefined {
  const { version } = declaration;
  if (version.kind === "version") return releaseLine(version.version);
  return version.kind === "lts" ? ltsMajor(version.codename) : undefined;
}

/** Whether some version of `major` satisfies the range. Majors only (Sreeram, ADR-020). */
function allowsMajor(range: string, major: string): boolean {
  if (validRange(range) === null) return true; // unreadable: never claim a disagreement
  return intersects(range, `${major}.x`);
}

function describe(declaration: NodeVersionDeclaration): string {
  const { file } = declaration.location;
  const { version } = declaration;
  switch (version.kind) {
    case "range":
      return `${file} ${declaration.source}.node allows "${version.range}"`;
    case "version":
      return `${file}${declaration.source === "volta" ? " volta.node" : ""} pins Node.js ${version.version}`;
    case "lts":
      return `${file} pins lts/${version.codename} (Node.js ${ltsMajor(version.codename) ?? "unknown"})`;
    case "unpinned":
      return `${file} pins ${version.alias}`;
    default:
      return unreachable(version);
  }
}

/** A declaration's version as one string, as `detected.node` lists it: `22`, `>=20 <23`, `lts/iron`. */
export function declaredValue({ version }: NodeVersionDeclaration): string {
  switch (version.kind) {
    case "version":
      return version.version;
    case "range":
      return version.range;
    case "lts":
      return `lts/${version.codename}`;
    case "unpinned":
      return version.alias;
    default:
      return unreachable(version);
  }
}

function byLocation(a: Location, b: Location): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0);
}

/** Makes a switch over a union exhaustive: a new case fails to compile here. */
function unreachable(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
