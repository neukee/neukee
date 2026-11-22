import { statSync } from "node:fs";
import type { ScanReport, Target } from "@neukee/core";
import { discoverFiles } from "./discover.js";

/**
 * The scan pipeline (docs/ARCHITECTURE.md §4). For now it only produces the report frame:
 * the detectors fill `detected` and `findings`, and T-030 assembles and sorts them. `tool` comes
 * from the caller (the CLI knows its own version).
 */
export function scan(root: string, targets: Target[], tool: ScanReport["tool"]): ScanReport {
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`${root} is not a folder. Pass the path of the project to scan.`);
  }
  const diagnostics: ScanReport["diagnostics"] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  for (const event of discoverFiles(root)) {
    switch (event.type) {
      case "file":
        filesScanned++;
        break;
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
    scannedAt: new Date().toISOString(),
    root: ".",
    targets,
    detected: { node: [], frameworks: {} },
    findings: [],
    diagnostics,
    stats: { filesScanned, filesSkipped },
  };
}

function assertNever(event: never): never {
  throw new Error(`Unknown file discovery event: ${String(event)}`);
}
