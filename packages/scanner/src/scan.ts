import { statSync } from "node:fs";
import type { CatalogEntry, Diagnostic, ScanReport, Target } from "@neukee/core";
import { discoverFiles } from "./discover.js";
import { sortAndDedupe, sortDiagnostics } from "./report.js";
import { declaredValue, runtimeFindings } from "./runtime-findings.js";
import { type NodeVersionDeclaration, readRuntimeSources } from "./runtime-sources.js";

export interface ScanOptions {
  /** The catalog's entries; every finding's knowledge (severity, fix, source) comes from them. */
  entries: readonly CatalogEntry[];
  /** The node target came from the default, not from `--target` (softens below-target, ADR-021). */
  defaultTarget: boolean;
  /** The report's timestamp, which also dates end-of-life; the clock when absent. Tests fix it. */
  scannedAt?: string;
}

/**
 * The scan pipeline (docs/ARCHITECTURE.md §4): discover files, read what each detector needs,
 * turn declarations into findings, and sort everything so the same repo always gives the same
 * report. `tool` comes from the caller (the CLI knows its own version).
 */
export function scan(
  root: string,
  targets: Target[],
  tool: ScanReport["tool"],
  options: ScanOptions,
): ScanReport {
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`${root} is not a folder. Pass the path of the project to scan.`);
  }
  const scannedAt = options.scannedAt ?? new Date().toISOString();
  const diagnostics: Diagnostic[] = [];
  const declarations: NodeVersionDeclaration[] = [];
  const packageDirs: string[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  for (const event of discoverFiles(root)) {
    switch (event.type) {
      case "file": {
        filesScanned++;
        const read = readRuntimeSources(event.file);
        declarations.push(...read.declarations);
        diagnostics.push(...read.diagnostics);
        const dir = packageDirOf(event.file.path);
        if (dir !== undefined) packageDirs.push(dir);
        break;
      }
      case "skipped":
        filesSkipped++;
        break;
      case "diagnostic":
        diagnostics.push(event.diagnostic);
        break;
      default:
        assertNever(event);
    }
  }
  return {
    schemaVersion: 1,
    tool,
    scannedAt,
    root: ".",
    targets,
    detected: { node: detectedNode(declarations), frameworks: {} },
    findings: sortAndDedupe(
      runtimeFindings({
        declarations,
        packageDirs,
        targets,
        defaultTarget: options.defaultTarget,
        entries: options.entries,
        scannedAt,
      }),
    ),
    diagnostics: sortDiagnostics(diagnostics),
    stats: { filesScanned, filesSkipped },
  };
}

/**
 * The distinct declared values, sorted (the default sort compares UTF-16 code units, never by
 * locale). An empty `engines.node` means "any version", so it declares nothing, and the report
 * schema wants non-empty values.
 */
function detectedNode(declarations: readonly NodeVersionDeclaration[]): string[] {
  const values = declarations.map(declaredValue).filter((value) => value !== "");
  return [...new Set(values)].sort();
}

/** The folder of a `package.json` ("" for the root), or undefined for any other file. */
function packageDirOf(path: string): string | undefined {
  if (path === "package.json") return "";
  return path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : undefined;
}

function assertNever(event: never): never {
  throw new Error(`Unknown file discovery event: ${String(event)}`);
}
