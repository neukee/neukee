import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ScanReport, type Target, validateReport } from "@neukee/core";
import { expect } from "vitest";
import { scan } from "../scan.js";

// Test-only helpers: excluded from the build and the npm package.

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fixtures");

/** Replaces `scannedAt`, the only field that varies between runs (ADR-011). Still a valid timestamp. */
export const FIXED_SCANNED_AT = "1970-01-01T00:00:00Z";

/** A fixed tool version, so golden reports don't change with every release. */
const TEST_TOOL = { name: "neukee", version: "0.0.0-test" };

/** Scans `fixtures/repos/<name>` and returns the normalized report, checked against the schema. */
export function scanFixture(name: string, targets: Target[] = []): ScanReport {
  const report = scan(join(fixtures, "repos", name), targets, TEST_TOOL);
  const check = validateReport({ ...report, scannedAt: FIXED_SCANNED_AT });
  if (!check.valid) {
    throw new Error(
      `scanFixture("${name}") produced an invalid report: ${check.errors.map((e) => e.message).join(" ")}`,
    );
  }
  return check.report;
}

/**
 * Compares a report with its golden file, `fixtures/expected/<name>.json`. A change in output fails
 * until the file is updated on purpose (`vitest -u`), with the reason in the commit message and
 * PROGRESS. CI never writes golden files.
 */
export async function matchGolden(name: string, report: ScanReport): Promise<void> {
  await expect(`${JSON.stringify(report, null, 2)}\n`).toMatchFileSnapshot(
    join(fixtures, "expected", `${name}.json`),
  );
}
