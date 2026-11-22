import { statSync } from "node:fs";
import type { ScanReport, Target } from "@neukee/core";

/**
 * The scan pipeline (docs/ARCHITECTURE.md §4). For now it only produces the report frame:
 * T-005 adds file discovery, the detectors fill `detected` and `findings`, and T-030 assembles
 * and sorts them. `tool` comes from the caller (the CLI knows its own version).
 */
export function scan(root: string, targets: Target[], tool: ScanReport["tool"]): ScanReport {
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`${root} is not a folder. Pass the path of the project to scan.`);
  }
  return {
    schemaVersion: 1,
    tool,
    scannedAt: new Date().toISOString(),
    root: ".",
    targets,
    detected: { node: [], frameworks: {} },
    findings: [],
    diagnostics: [],
    stats: { filesScanned: 0, filesSkipped: 0 },
  };
}
