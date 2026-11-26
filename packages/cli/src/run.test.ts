import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./run.js";

const ESC = String.fromCharCode(27);
const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../fixtures/repos/${name}`, import.meta.url));
// A fixed scan date keeps dated findings (end-of-life, the softening of below-target) stable.
const options = { color: false, scannedAt: "2026-11-26T12:00:00.000Z" };
const repoCatalog = fileURLToPath(new URL("../../../catalog", import.meta.url));

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "neukee-cli-"));
  temps.push(dir);
  return dir;
};

describe("cli basics", () => {
  it("prints its version", () => {
    const result = run(["--version"], options);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("prints help with no arguments, naming every scan option", () => {
    const { stdout, code } = run([], options);
    expect(code).toBe(0);
    for (const word of ["Usage:", "--target", "--format", "--output", "--fail-on", "node@26"]) {
      expect(stdout).toContain(word);
    }
  });

  it("exits 2 on an unknown flag, with the usage", () => {
    const result = run(["--nope"], options);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("exits 2 on an unknown command", () => {
    const result = run(["frobnicate"], options);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown command: frobnicate");
  });
});

describe("neukee scan", () => {
  it("checks node@26 by default and softens below-target for a line with support left", () => {
    const result = run(["scan", fixture("render-mixed")], options);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Targets: node@26");
    expect(result.stdout).toContain("INFO (1)");
    expect(result.stderr).toBe("");
  });

  it("never softens an explicit target", () => {
    const result = run(["scan", fixture("render-mixed"), "--target", "node@26"], options);
    expect(result.stdout).toContain("WARNING (1)");
    expect(result.stdout).not.toContain("INFO (1)");
  });

  it("checks only the targets it is given", () => {
    const result = run(["scan", fixture("render-mixed"), "--target", "node@24"], options);
    expect(result.stdout).toContain("Targets: node@24");
    expect(result.stdout).toContain("No findings.");
  });

  it("exits 1 when a finding reaches --fail-on, and says why", () => {
    const args = ["scan", fixture("runtime-sources"), "--target", "node@26"];
    const blocked = run([...args, "--fail-on", "warning"], options);
    expect(blocked.code).toBe(1);
    expect(blocked.stdout).toContain("Exit code 1: 12 findings at or above warning");
    expect(run(args, options).code).toBe(0); // the default, action-required, isn't reached
    expect(run([...args, "--fail-on", "never"], options).code).toBe(0);
  });

  it("never lets an info finding block", () => {
    const result = run(["scan", fixture("render-mixed"), "--fail-on", "warning"], options);
    expect(result.code).toBe(0);
  });

  it("prints markdown when asked", () => {
    const result = run(["scan", fixture("render-mixed"), "--format", "markdown"], options);
    expect(result.stdout.startsWith("# Neukee scan report\n")).toBe(true);
    expect(result.stdout).toContain("> **Coverage.**");
  });

  it("prints the coverage note in the terminal output", () => {
    const { stdout } = run(["scan", fixture("empty")], options);
    expect(stdout).toContain("not your code for APIs removed in Node 23 to 26");
  });

  it("colors the terminal output only when the caller says the terminal can show it", () => {
    const repo = fixture("render-mixed");
    expect(run(["scan", repo], options).stdout).not.toContain(ESC);
    expect(run(["scan", repo], { ...options, color: true }).stdout).toContain(ESC);
    expect(
      run(["scan", repo, "--format", "markdown"], { ...options, color: true }).stdout,
    ).not.toContain(ESC);
  });

  it("scans the folder it is run in when no path is given", () => {
    const before = process.cwd();
    process.chdir(fixture("render-mixed"));
    try {
      expect(run(["scan"], options).stdout).toContain("Detected Node.js: 24");
    } finally {
      process.chdir(before);
    }
  });

  it("says the format isn't available yet for json and sarif (T-032)", () => {
    for (const format of ["json", "sarif"]) {
      const result = run(["scan", fixture("empty"), "--format", format], options);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`--format ${format} isn't available yet`);
    }
  });

  it("lists the accepted values when a format or --fail-on value is wrong", () => {
    const format = run(["scan", fixture("empty"), "--format", "html"], options);
    expect(format.code).toBe(2);
    expect(format.stderr).toContain('Unknown format "html". Use terminal or markdown');
    const failOn = run(["scan", fixture("empty"), "--fail-on", "error"], options);
    expect(failOn.code).toBe(2);
    expect(failOn.stderr).toContain(
      'Unknown --fail-on value "error". Use action-required, warning or never',
    );
  });

  it("lists the supported targets when one is wrong", () => {
    for (const target of ["node", "node@", "@26", "python@3", "node@25", "node@26.1", "NODE@26"]) {
      const result = run(["scan", fixture("empty"), "--target", target], options);
      expect(result.code, target).toBe(2);
      expect(result.stderr, target).toContain("node@24, node@26, next@15, next@16");
    }
  });

  it("accepts one target per tool, and says so when two name the same tool", () => {
    const ok = run(
      ["scan", fixture("empty"), "--target", "node@26", "--target", "next@16"],
      options,
    );
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("Targets: next@16, node@26"); // sorted, not in flag order
    const twice = run(
      ["scan", fixture("empty"), "--target", "node@24", "--target", "node@26"],
      options,
    );
    expect(twice.code).toBe(2);
    expect(twice.stderr).toContain("one node target");
    expect(twice.stderr).toContain("run once per target");
  });

  it("marks the default target in the Targets line", () => {
    const result = run(["scan", fixture("empty")], options);
    expect(result.stdout).toContain("Targets: node@26 (default)");
    const markdown = run(["scan", fixture("empty"), "--format", "markdown"], options);
    expect(markdown.stdout).toContain("- **Targets:** `node@26` (default)");
  });

  it("replaces the default only for the tool it names: next@16 still checks node@26", () => {
    const result = run(["scan", fixture("render-mixed"), "--target", "next@16"], options);
    expect(result.stdout).toContain("Targets: next@16, node@26 (default)");
    expect(result.stdout).toContain("INFO (1)"); // the default node target softens below-target
  });

  it("gives the same report for the same targets in any flag order", () => {
    const scanWith = (...targets: string[]) =>
      run(["scan", fixture("render-mixed"), ...targets.flatMap((t) => ["--target", t])], options);
    const forward = scanWith("next@16", "node@26");
    const backward = scanWith("node@26", "next@16");
    expect(backward.stdout).toBe(forward.stdout);
    expect(forward.stdout).toContain("Targets: next@16, node@26\n");
  });

  it("describes the default accurately in --help", () => {
    expect(run(["--help"], options).stdout).toContain(
      "Default: node@26, unless you name a Node.js target.",
    );
  });

  it("does not add a default for a tool whose target was named", () => {
    const node = run(["scan", fixture("render-mixed"), "--target", "node@24"], options);
    expect(node.stdout).toContain("Targets: node@24\n");
    expect(node.stdout).not.toContain("(default)");
    const both = run(
      ["scan", fixture("render-mixed"), "--target", "next@16", "--target", "node@26"],
      options,
    );
    expect(both.stdout).toContain("Targets: next@16, node@26\n");
    expect(both.stdout).toContain("WARNING (1)"); // a named node target is never softened
  });

  it("exits 2 for a path that isn't a folder, and for more than one path", () => {
    const missing = run(["scan", join(tempDir(), "missing")], options);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("is not a folder");
    expect(run(["scan", "\0"], options).code).toBe(2);
    const two = run(["scan", fixture("empty"), fixture("empty")], options);
    expect(two.code).toBe(2);
    expect(two.stderr).toContain("one folder");
  });

  it("writes the report to --output instead of printing it", () => {
    const out = join(tempDir(), "report.md");
    const result = run(
      ["scan", fixture("render-mixed"), "--format", "markdown", "--output", out],
      options,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Wrote the markdown report to");
    expect(readFileSync(out, "utf8")).toContain("# Neukee scan report");
    run(["scan", fixture("render-mixed"), "--output", out], { ...options, color: true });
    expect(readFileSync(out, "utf8")).not.toContain(ESC); // a file never gets color codes
  });

  it("still exits 1 for blocking findings when it writes a file", () => {
    const out = join(tempDir(), "report.txt");
    const args = [
      "scan",
      fixture("runtime-sources"),
      "--target",
      "node@26",
      "--fail-on",
      "warning",
    ];
    expect(run([...args, "--output", out], options).code).toBe(1);
  });

  it("exits 2 when the report can't be written, without a misleading usage hint", () => {
    const out = join(tempDir(), "missing-folder", "report.txt");
    const result = run(["scan", fixture("empty"), "--output", out], options);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Could not write");
    expect(result.stderr).not.toContain("--help");
  });

  it("points the user at --help after a usage mistake", () => {
    const result = run(["scan", fixture("empty"), "--fail-on", "x"], options);
    expect(result.stderr).toContain("neukee --help");
  });

  it("won't write through a symbolic link, which a scanned repo could have planted", (context) => {
    const dir = tempDir();
    const victim = join(dir, "victim.txt");
    const link = join(dir, "neukee-report.md");
    writeFileSync(victim, "precious");
    try {
      symlinkSync(victim, link);
    } catch {
      context.skip(); // creating a file symlink needs a privilege on some Windows setups
    }
    const result = run(["scan", fixture("empty"), "--output", link], options);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("symbolic link");
    expect(readFileSync(victim, "utf8")).toBe("precious");
  });
});

describe("the catalog", () => {
  it("exits 3 and names the file when an entry is broken, instead of scanning without it", () => {
    const catalogDir = tempDir();
    mkdirSync(join(catalogDir, "runtime"));
    writeFileSync(join(catalogDir, "runtime", "broken.yaml"), "id: [not, valid\n");
    const result = run(["scan", fixture("empty")], { ...options, catalogDir });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("runtime/broken.yaml");
    expect(result.stderr).toContain("bug");
  });

  it("exits 3 and names the rules a catalog lacks, instead of reporting a clean scan", () => {
    const catalogDir = tempDir();
    cpSync(join(repoCatalog, "next16"), join(catalogDir, "next16"), { recursive: true });
    const result = run(["scan", fixture("runtime-sources")], { ...options, catalogDir });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    for (const id of ["runtime/below-target", "runtime/end-of-life", "runtime/sources-disagree"]) {
      expect(result.stderr).toContain(id);
    }
    expect(result.stderr).toContain("bug");
    cpSync(join(repoCatalog, "runtime"), join(catalogDir, "runtime"), { recursive: true });
    rmSync(join(catalogDir, "runtime", "end-of-life.yaml"));
    const one = run(["scan", fixture("runtime-sources")], { ...options, catalogDir });
    expect(one.code).toBe(3);
    expect(one.stderr).toContain("runtime/end-of-life");
    expect(one.stderr).not.toContain("runtime/below-target");
  });

  it("exits 3 when the catalog is missing or empty, instead of reporting a clean scan", () => {
    for (const catalogDir of [join(tempDir(), "missing"), tempDir()]) {
      const result = run(["scan", fixture("empty")], { ...options, catalogDir });
      expect(result.code).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("The catalog can't be used, so nothing was scanned.");
    }
    const empty = run(["scan", fixture("empty")], { ...options, catalogDir: tempDir() });
    expect(empty.stderr).toContain("It has no entries.");
  });
});
