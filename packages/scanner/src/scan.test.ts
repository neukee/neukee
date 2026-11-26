import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareFindings, loadCatalog, type ReportTarget, validateReport } from "@neukee/core";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "./index.js";
import { matchGolden, scanFixture } from "./testing/scan-fixture.js";

const tool = { name: "neukee", version: "1.2.3" };
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const discoveryFixture = `${repoRoot}fixtures/repos/discovery/`;
const { entries } = loadCatalog(`${repoRoot}catalog`);
const SCANNED_AT = "2026-11-26T12:00:00.000Z";
const options = { entries, scannedAt: SCANNED_AT };
const NODE_24: ReportTarget = { tool: "node", version: "24", source: "flag" };
const NODE_26: ReportTarget = { tool: "node", version: "26", source: "flag" };

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const tempRepo = (files: Record<string, string> = {}) => {
  const root = mkdtempSync(join(tmpdir(), "neukee-scan-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};

describe("scan", () => {
  it("returns a valid report for the given targets and tool, with root always '.'", () => {
    const report = scan(tempRepo(), [NODE_24], tool, options);
    expect(validateReport(report).valid).toBe(true);
    expect(report.tool).toEqual(tool);
    expect(report.targets).toEqual([NODE_24]);
    expect(report.root).toBe(".");
  });

  it("stamps scannedAt with the current time unless the caller passes one", () => {
    const before = Date.now();
    const report = scan(tempRepo(), [], tool, { entries });
    expect(Date.parse(report.scannedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(report.scannedAt)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(scan(tempRepo(), [], tool, options).scannedAt).toBe(SCANNED_AT);
  });

  it("refuses a root that isn't a folder, naming it", () => {
    const root = tempRepo({ "file.txt": "x" });
    expect(() => scan(join(root, "file.txt"), [], tool, options)).toThrow(
      /file\.txt is not a folder/,
    );
    expect(() => scan(join(root, "missing"), [], tool, options)).toThrow(/missing is not a folder/);
  });

  it("reports the number of files discovered and skipped", () => {
    const report = scan(discoveryFixture, [], tool, options);
    expect(report.stats).toEqual({ filesScanned: 8, filesSkipped: 0 });
  });

  it("reports files skipped for exceeding the size limit", () => {
    const root = tempRepo();
    writeFileSync(join(root, "over-limit.bin"), Buffer.alloc(1024 * 1024 + 1));
    const report = scan(root, [], tool, options);
    expect(report.stats).toEqual({ filesScanned: 0, filesSkipped: 1 });
  });
});

describe("scan: runtime findings", () => {
  it("reports a pin that disagrees with engines.node, each finding pointing at its lines", () => {
    const root = tempRepo({
      ".nvmrc": "24\n",
      "package.json": '{\n  "engines": { "node": "20.x" }\n}\n',
    });
    const report = scan(root, [NODE_24], tool, options);
    expect(
      report.findings.map((f) => [f.ruleId, f.severity, f.locations.map((l) => l.file)]),
    ).toEqual([
      ["runtime/sources-disagree", "warning", [".nvmrc", "package.json"]],
      ["runtime/below-target", "warning", ["package.json"]],
    ]);
    expect(report.findings[1]?.locations).toEqual([{ file: "package.json", line: 2, column: 25 }]);
  });

  it("softens below-target only under the default target (ADR-021)", () => {
    const root = tempRepo({ ".nvmrc": "24\n" });
    const severityOf = (source: ReportTarget["source"]) =>
      scan(root, [{ ...NODE_26, source }], tool, options).findings.map((f) => f.severity);
    expect(severityOf("default")).toEqual(["info"]);
    expect(severityOf("flag")).toEqual(["warning"]);
  });

  it("dates end-of-life by the scan date it was given", () => {
    const root = tempRepo({ ".nvmrc": "20\n" });
    const ruleIds = (scannedAt: string) =>
      scan(root, [NODE_26], tool, { ...options, scannedAt }).findings.map((f) => f.ruleId);
    expect(ruleIds("2026-11-26T12:00:00Z")).toContain("runtime/end-of-life");
    expect(ruleIds("2026-04-01T12:00:00Z")).not.toContain("runtime/end-of-life");
  });

  it("finds nothing to compare against when there is no node target", () => {
    const root = tempRepo({ ".nvmrc": "20\n" });
    expect(scan(root, [], tool, options).findings).toEqual([]);
  });

  it("lists the declared Node.js versions it found, sorted and without repeats", () => {
    const root = tempRepo({
      ".nvmrc": "v22.11.0\n",
      ".node-version": "22.11.0\n",
      "package.json": '{ "engines": { "node": ">=20" } }',
      "apps/web/.nvmrc": "lts/iron\n",
    });
    expect(scan(root, [NODE_26], tool, options).detected.node).toEqual([
      "22.11.0",
      ">=20",
      "lts/iron",
    ]);
  });

  it("lists nothing for an empty engines.node, which declares no version, and stays valid", () => {
    for (const range of ["", "  "]) {
      const root = tempRepo({ "package.json": JSON.stringify({ engines: { node: range } }) });
      const report = scan(root, [NODE_26], tool, options);
      expect(validateReport(report).valid).toBe(true);
      expect(report.detected.node).toEqual([]);
      expect(report.findings).toEqual([]);
    }
  });

  it("sorts findings by the total order and gives the same bytes every time", () => {
    const first = scan(`${repoRoot}fixtures/repos/runtime-sources`, [NODE_26], tool, options);
    const second = scan(`${repoRoot}fixtures/repos/runtime-sources`, [NODE_26], tool, options);
    expect(first.findings.length).toBeGreaterThan(2);
    expect(first.findings).toEqual([...first.findings].sort(compareFindings));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("differs between two scans of one repo only in scannedAt", () => {
    const at = (scannedAt: string) =>
      scan(`${repoRoot}fixtures/repos/runtime-sources`, [NODE_26], tool, { ...options, scannedAt });
    const earlier = at("2026-11-26T01:00:00Z");
    const later = at("2026-11-26T23:00:00Z");
    expect(earlier.scannedAt).not.toBe(later.scannedAt);
    expect({ ...earlier, scannedAt: "" }).toEqual({ ...later, scannedAt: "" });
  });

  it("keeps going past files it can't read, sorting their diagnostics", () => {
    const root = tempRepo({
      "package.json": "{ not json",
      ".nvmrc": "not a version\n",
      "apps/web/.nvmrc": "24\n",
    });
    const report = scan(root, [{ ...NODE_26, source: "default" }], tool, options);
    expect(report.diagnostics.map((d) => d.file)).toEqual([".nvmrc", "package.json"]);
    expect(report.findings.map((f) => f.ruleId)).toEqual(["runtime/below-target"]);
    expect(validateReport(report).valid).toBe(true);
  });

  it("never puts the scanned folder's absolute path in the report", () => {
    const root = tempRepo({ ".nvmrc": "20\n", "package.json": "{ not json" });
    expect(JSON.stringify(scan(root, [NODE_26], tool, options))).not.toContain(root);
  });

  it("matches the golden report for the runtime-sources repo", async () => {
    await matchGolden(
      "runtime-sources",
      scanFixture("runtime-sources", [{ ...NODE_26, source: "default" }], {
        scannedAt: SCANNED_AT,
      }),
    );
  });
});
