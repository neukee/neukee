import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ScanReport, type Target, validateReport } from "@neukee/core";
import { expect } from "vitest";
import { scan } from "../scan.js";

// Test-only helpers: excluded from the build and the npm package.

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fixtures");
const fixtureRepos = join(fixtures, "repos");
const expectedReports = join(fixtures, "expected");

function isWithin(parent: string, candidate: string): boolean {
  const relativePath = relative(parent, candidate);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function resolveFixture(name: string): string {
  const candidate = resolve(fixtureRepos, name);
  if (isAbsolute(name) || !isWithin(fixtureRepos, candidate)) {
    throw new Error(`Fixture "${name}" must resolve inside fixtures/repos.`);
  }

  const realRepos = realpathSync(fixtureRepos);
  const realCandidate = realpathSync(candidate);
  if (!isWithin(realRepos, realCandidate)) {
    throw new Error(`Fixture "${name}" must resolve inside fixtures/repos.`);
  }
  return realCandidate;
}

/** Replaces `scannedAt`, the only field that varies between runs (ADR-011). Still a valid timestamp. */
export const FIXED_SCANNED_AT = "1970-01-01T00:00:00Z";

/** A fixed tool version, so golden reports don't change with every release. */
const TEST_TOOL = { name: "neukee", version: "0.0.0-test" };

/** Scans `fixtures/repos/<name>` and returns the normalized report, checked against the schema. */
export function scanFixture(name: string, targets: Target[] = []): ScanReport {
  const report = scan(resolveFixture(name), targets, TEST_TOOL);
  const check = validateReport({ ...report, scannedAt: FIXED_SCANNED_AT });
  if (!check.valid) {
    throw new Error(
      `scanFixture("${name}") produced an invalid report: ${check.errors.map((e) => e.message).join(" ")}`,
    );
  }
  return check.report;
}

function resolveGolden(name: string): string {
  const candidate = resolve(expectedReports, `${name}.json`);
  if (!name || isAbsolute(name) || !isWithin(expectedReports, candidate)) {
    throw new Error(`Golden report "${name}" must resolve inside fixtures/expected.`);
  }

  const realExpected = realpathSync(expectedReports);
  const realParent = realpathSync(dirname(candidate));
  if (realParent !== realExpected && !isWithin(realExpected, realParent)) {
    throw new Error(`Golden report "${name}" must resolve inside fixtures/expected.`);
  }

  if (lstatSync(candidate, { throwIfNoEntry: false }) !== undefined) {
    const realCandidate = realpathSync(candidate);
    if (!isWithin(realExpected, realCandidate)) {
      throw new Error(`Golden report "${name}" must resolve inside fixtures/expected.`);
    }
  }
  return candidate;
}

/**
 * Compares a report with its golden file, `fixtures/expected/<name>.json`. A change in output fails
 * until the file is updated on purpose (`vitest -u`), with the reason in the commit message and
 * PROGRESS. CI never writes golden files.
 */
export async function matchGolden(name: string, report: ScanReport): Promise<void> {
  await expect(`${JSON.stringify(report, null, 2)}\n`).toMatchFileSnapshot(resolveGolden(name));
}
