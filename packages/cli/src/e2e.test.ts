import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The built CLI, run as a child process on fixture repos (T-033's done-when). Needs `dist`, so it
// builds the workspace first; `dist` is ignored by git.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cli = join(repoRoot, "packages", "cli", "dist", "index.js");
const fixture = (name: string) => join(repoRoot, "fixtures", "repos", name);

function neukee(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: repoRoot });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

let outDir = "";
beforeAll(() => {
  // One constant command, run through a shell only so Windows finds `pnpm.cmd`.
  const build = spawnSync("pnpm -r build", { cwd: repoRoot, encoding: "utf8", shell: true });
  if (build.status !== 0)
    throw new Error(`pnpm -r build failed:\n${build.stdout}\n${build.stderr}`);
  outDir = mkdtempSync(join(tmpdir(), "neukee-e2e-"));
}, 240_000);
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("the built CLI", () => {
  it("prints its version and help", () => {
    const version = neukee("--version");
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(neukee("--help").stdout).toContain("neukee scan");
  });

  it("finds nothing in an empty repo and exits 0", () => {
    const result = neukee("scan", fixture("empty"));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No findings.");
    expect(result.stdout).toContain("Targets: node@26");
    expect(result.stdout).not.toContain(String.fromCharCode(27)); // piped, so no color
    expect(result.stderr).toBe("");
  });

  it("reports runtime findings with their locations, and exits 1 under --fail-on warning", () => {
    const args = ["scan", fixture("runtime-sources"), "--target", "node@26"];
    const result = neukee(...args, "--fail-on", "warning");
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/WARNING \(\d+\)/);
    expect(result.stdout).toContain("runtime/sources-disagree");
    expect(result.stdout).toContain("runtime/end-of-life");
    expect(result.stdout).toContain("apps/web/.nvmrc:1:1");
    expect(result.stdout).toMatch(/Exit code 1: \d+ findings at or above warning/);
    expect(neukee(...args).code).toBe(0);
    expect(neukee(...args, "--fail-on", "never").code).toBe(0);
  });

  it("never prints the scanned folder's absolute path", () => {
    const result = neukee("scan", fixture("runtime-sources"), "--target", "node@26");
    expect(result.stdout).not.toContain(fixture("runtime-sources"));
    expect(result.stdout).not.toContain(repoRoot);
  });

  it("writes markdown to --output", () => {
    const out = join(outDir, "report.md");
    const result = neukee("scan", fixture("render-mixed"), "--format", "markdown", "--output", out);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(out, "utf8")).toContain("# Neukee scan report");
  });

  it("exits 2 with the supported targets on a usage error, printing nothing to stdout", () => {
    const result = neukee("scan", fixture("empty"), "--target", "python@3");
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("node@24, node@26, next@15, next@16");
  });

  // A published install is `node_modules/@neukee/cli/{dist,catalog}`; the repository's `catalog`
  // three folders up must not be used there (it could be any package named `catalog`).
  describe("in a published-like install", () => {
    function install(withCatalog: boolean): string {
      const root = mkdtempSync(join(tmpdir(), "neukee-install-"));
      const scope = join(root, "node_modules", "@neukee");
      mkdirSync(join(scope, "cli"), { recursive: true });
      const cliSource = join(repoRoot, "packages", "cli");
      cpSync(join(cliSource, "dist"), join(scope, "cli", "dist"), { recursive: true });
      cpSync(join(cliSource, "package.json"), join(scope, "cli", "package.json"));
      for (const name of ["core", "scanner"]) {
        symlinkSync(join(repoRoot, "packages", name), join(scope, name), "junction");
      }
      // A sibling package named `catalog` with one unrelated entry, as a repo's own install could have.
      const sibling = join(root, "node_modules", "catalog", "next16");
      mkdirSync(sibling, { recursive: true });
      cpSync(
        join(repoRoot, "catalog", "next16", "sync-request-apis.yaml"),
        join(sibling, "sync-request-apis.yaml"),
      );
      if (withCatalog) {
        cpSync(join(repoRoot, "catalog"), join(scope, "cli", "catalog"), { recursive: true });
      }
      return root;
    }

    const scanFrom = (root: string) =>
      spawnSync(
        process.execPath,
        [
          join(root, "node_modules", "@neukee", "cli", "dist", "index.js"),
          "scan",
          fixture("runtime-sources"),
          "--target",
          "node@26",
          "--fail-on",
          "warning",
        ],
        { encoding: "utf8" },
      );

    it("fails with exit 3, never a clean scan, when the package ships no catalog", () => {
      const root = install(false);
      try {
        const result = scanFrom(root);
        expect(result.status).toBe(3);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("The catalog can't be used");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("uses the catalog shipped beside dist", () => {
      const root = install(true);
      try {
        const result = scanFrom(root);
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("runtime/sources-disagree");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
