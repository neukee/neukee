import type { CatalogEntry, Finding, Location, Target } from "@neukee/core";
import { gtr, intersects, validRange } from "semver";
import { endOfLife, ltsMajor, releaseLine } from "./node-releases.js";
import type { NodeVersionDeclaration } from "./runtime-sources.js";

/**
 * Runtime findings (T-014, docs/SPEC-SCANNER.md §2.1, ADR-020) from T-010's declarations:
 * `runtime/sources-disagree` per package, `runtime/below-target` and `runtime/end-of-life` per
 * declaration. Knowledge (title, severity, why, fix, source) comes from the catalog entries.
 */
export function runtimeFindings(input: {
  declarations: readonly NodeVersionDeclaration[];
  /** Repo-relative folders that hold a package.json ("" for the root). */
  packageDirs: readonly string[];
  targets: readonly Target[];
  entries: readonly CatalogEntry[];
  /** The scan's date, YYYY-MM-DD, so end-of-life is deterministic for a given scan. */
  today: string;
}): Finding[] {
  const target = input.targets.find((t) => t.tool === "node");
  const targetMajor = target === undefined ? undefined : /^\d+/.exec(target.version)?.[0];
  if (target === undefined || targetMajor === undefined) return [];
  const entry = (id: string) => input.entries.find((e) => e.id === id);
  const findings: Finding[] = [];
  const add = (id: string, detail: string, locations: Location[]) => {
    const rule = entry(id);
    if (rule === undefined) return;
    findings.push({
      ruleId: rule.id,
      severity: rule.severity,
      title: rule.title,
      message: `${detail}. ${rule.message}`,
      ...(rule.fix === undefined ? {} : { fix: rule.fix }),
      sourceUrl: rule.sourceUrl,
      locations,
      target,
    });
  };

  const reported = new Set<string>();
  for (const dir of [...input.packageDirs].sort()) {
    for (const [a, b] of disagreements(input.declarations, dir)) {
      const locations = [a.location, b.location].sort(byLocation);
      const key = JSON.stringify(locations);
      if (reported.has(key)) continue; // one pair can cover many packages
      reported.add(key);
      const [first, second] = byLocation(a.location, b.location) <= 0 ? [a, b] : [b, a];
      add("runtime/sources-disagree", `${describe(first)}, but ${describe(second)}`, locations);
    }
  }

  for (const declaration of input.declarations) {
    const major = majorOf(declaration);
    const { version } = declaration;
    const below =
      major === undefined
        ? version.kind === "range" && entirelyBelow(version.range, targetMajor)
        : Number(major) < Number(targetMajor);
    if (below) {
      add(
        "runtime/below-target",
        `${describe(declaration)}, below the target Node.js ${targetMajor}`,
        [declaration.location],
      );
    }
  }

  for (const declaration of input.declarations) {
    const line = lineOf(declaration);
    const end = line === undefined ? undefined : endOfLife(line);
    if (end !== undefined && input.today > end) {
      add("runtime/end-of-life", `${describe(declaration)}, which reached end-of-life on ${end}`, [
        declaration.location,
      ]);
    }
  }
  return findings;
}

/** What a declaration decides: its own folder and below (pins), or its own package (engines). */
type Coverage = { directory: string; reach: "subtree" | "package" };

function coverage(declaration: NodeVersionDeclaration): Coverage {
  const file = declaration.location.file;
  const directory = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  switch (declaration.source) {
    case "nvmrc":
    case "node-version":
    case "volta":
      return { directory, reach: "subtree" }; // nvm walks up to the nearest .nvmrc
    case "engines":
      return { directory, reach: "package" };
  }
}

function covers(scope: Coverage, dir: string): boolean {
  if (scope.reach === "package") return scope.directory === dir;
  return scope.directory === "" || scope.directory === dir || dir.startsWith(`${scope.directory}/`);
}

/**
 * The pairs that disagree in one package: its applicable pins (per kind, its own or the nearest in
 * a parent folder) with different majors, and each pin its own engines.node doesn't allow.
 */
function disagreements(
  declarations: readonly NodeVersionDeclaration[],
  dir: string,
): [NodeVersionDeclaration, NodeVersionDeclaration][] {
  const nearest = new Map<string, NodeVersionDeclaration>();
  const ranges: NodeVersionDeclaration[] = [];
  for (const declaration of declarations) {
    const scope = coverage(declaration);
    if (!covers(scope, dir)) continue;
    if (declaration.source === "engines") {
      ranges.push(declaration);
      continue;
    }
    const current = nearest.get(declaration.source);
    if (current === undefined || coverage(current).directory.length < scope.directory.length) {
      nearest.set(declaration.source, declaration);
    }
  }
  // Each pin with the major it selects; unpinned aliases and ranges select none.
  const pins = [...nearest.values()].flatMap((declaration) => {
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
  }
}

/** The release line a pin selects (0.x lines keep their minor), for end-of-life. */
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

/** Whether every version the range allows is below the target major. */
function entirelyBelow(range: string, targetMajor: string): boolean {
  return validRange(range) !== null && gtr(`${targetMajor}.0.0`, range);
}

function describe(declaration: NodeVersionDeclaration): string {
  const { file } = declaration.location;
  const { version } = declaration;
  switch (version.kind) {
    case "range":
      return `${file} ${declaration.source}.node allows "${version.range}"`;
    case "version":
      return `${file}${declaration.source === "volta" ? " volta.node" : ""} pins Node.js ${version.version}`;
    case "lts": {
      const major = ltsMajor(version.codename);
      return `${file} pins lts/${version.codename}${major === undefined ? "" : ` (Node.js ${major})`}`;
    }
    case "unpinned":
      return `${file} pins ${version.alias}`;
  }
}

function byLocation(a: Location, b: Location): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0);
}
