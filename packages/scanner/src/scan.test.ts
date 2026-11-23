import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReport } from "@neukee/core";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "./index.js";

const tool = { name: "neukee", version: "1.2.3" };
const discoveryFixture = fileURLToPath(
  new URL("../../../fixtures/repos/discovery/", import.meta.url),
);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const tempRepo = () => {
  const root = mkdtempSync(join(tmpdir(), "neukee-scan-"));
  roots.push(root);
  return root;
};

describe("scan", () => {
  it("returns a valid report for the given targets and tool, with root always '.'", () => {
    const report = scan(tempRepo(), [{ tool: "node", version: "24" }], tool);
    expect(validateReport(report).valid).toBe(true);
    expect(report.tool).toEqual(tool);
    expect(report.targets).toEqual([{ tool: "node", version: "24" }]);
    expect(report.root).toBe(".");
  });

  it("stamps scannedAt with the current time, the only field that varies", () => {
    const before = Date.now();
    const report = scan(tempRepo(), [], tool);
    expect(Date.parse(report.scannedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(report.scannedAt)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("refuses a root that isn't a folder, naming it", () => {
    const root = tempRepo();
    writeFileSync(join(root, "file.txt"), "x");
    expect(() => scan(join(root, "file.txt"), [], tool)).toThrow(/file\.txt is not a folder/);
    expect(() => scan(join(root, "missing"), [], tool)).toThrow(/missing is not a folder/);
  });

  it("reports the number of files discovered and skipped", () => {
    const report = scan(discoveryFixture, [], tool);
    expect(report.stats).toEqual({ filesScanned: 8, filesSkipped: 0 });
  });

  it("reports files skipped for exceeding the size limit", () => {
    const root = tempRepo();
    writeFileSync(join(root, "over-limit.bin"), Buffer.alloc(1024 * 1024 + 1));
    const report = scan(root, [], tool);
    expect(report.stats).toEqual({ filesScanned: 0, filesSkipped: 1 });
  });
});
