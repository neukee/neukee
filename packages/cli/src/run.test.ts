import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./run.js";

const ESC = String.fromCharCode(27);
const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../fixtures/repos/${name}`, import.meta.url));
// A fixed scan date keeps dated findings (end-of-life, the softening of below-target) stable.
const options = { color: false, scannedAt: "2026-11-26T12:00:00.000Z" };

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
    expect(ok.stdout).toContain("Targets: node@26, next@16");
    const twice = run(
      ["scan", fixture("empty"), "--target", "node@24", "--target", "node@26"],
      options,
    );
    expect(twice.code).toBe(2);
    expect(twice.stderr).toContain("one node target");
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

  describe("--output and symbolic links in the scanned folder (CodeRabbit on #22, Sreeram)", () => {
    // A directory link: a junction on Windows needs no privilege, so no skipping is needed.
    function repoWithLink(): { repo: string; outside: string } {
      const dir = tempDir();
      const repo = join(dir, "repo");
      const outside = join(dir, "outside");
      mkdirSync(join(repo, "a"), { recursive: true });
      mkdirSync(outside);
      writeFileSync(join(repo, ".nvmrc"), "26\n");
      symlinkSync(outside, join(repo, "reports"), "junction");
      symlinkSync(outside, join(repo, "a", "b"), "junction");
      mkdirSync(join(repo, "plain"));
      return { repo, outside };
    }

    it("refuses an output path that goes through a link inside the scanned folder", () => {
      const { repo, outside } = repoWithLink();
      for (const out of [
        join(repo, "reports", "report.md"),
        join(repo, "a", "b", "c", "report.md"),
        `${repo}${sep}a${sep}..${sep}reports${sep}report.md`, // a raw ".." the OS never sees
      ]) {
        const result = run(["scan", repo, "--output", out], options);
        expect(result.code, out).toBe(2);
        expect(result.stderr, out).toContain("symbolic link");
      }
      expect(readdirSync(outside)).toEqual([]); // nothing was written outside the repository
    });

    it("writes exactly where it checked: a '..' after a link is collapsed first, as on Windows", () => {
      const { repo, outside } = repoWithLink();
      // On POSIX the OS would follow the link `a/b` and then apply `..` inside its target,
      // landing in the folder above `outside`; the CLI collapses `..` by text before it writes.
      const out = `${repo}${sep}a${sep}b${sep}..${sep}x.md`;
      expect(run(["scan", repo, "--output", out], options).code).toBe(0);
      expect(existsSync(join(repo, "a", "x.md"))).toBe(true);
      expect(existsSync(join(dirname(outside), "x.md"))).toBe(false);
      expect(readdirSync(outside)).toEqual([]);
    });

    it("sees a planted link when the folder is spelled differently from the output path", () => {
      const { repo } = repoWithLink();
      const alias = join(dirname(repo), "alias"); // another name for the scanned folder
      symlinkSync(repo, alias, "junction");
      const real = join(repo, "reports", "r.md");
      expect(run(["scan", alias, "--output", real], options).code).toBe(2);
      expect(run(["scan", repo, "--output", join(alias, "reports", "r.md")], options).code).toBe(2);
      expect(readdirSync(join(dirname(repo), "outside"))).toEqual([]);
    });

    it("sees a planted link when /tmp and /private/tmp name the same folder (macOS)", (context) => {
      if (process.platform !== "darwin") context.skip();
      const logical = mkdtempSync("/tmp/neukee-cli-");
      temps.push(logical);
      mkdirSync(join(logical, "repo"));
      mkdirSync(join(logical, "outside"));
      symlinkSync(join(logical, "outside"), join(logical, "repo", "reports"), "junction");
      const physical = realpathSync(logical);
      expect(physical).not.toBe(logical); // /tmp is a link to /private/tmp
      const viaLogical = join(logical, "repo", "reports", "r.md");
      const viaPhysical = join(physical, "repo", "reports", "r.md");
      expect(run(["scan", join(physical, "repo"), "--output", viaLogical], options).code).toBe(2);
      expect(run(["scan", join(logical, "repo"), "--output", viaPhysical], options).code).toBe(2);
      expect(readdirSync(join(logical, "outside"))).toEqual([]);
    });

    it("sees a planted link when the letter case differs on a case-insensitive file system", (context) => {
      const dir = tempDir();
      mkdirSync(join(dir, "Repo"));
      mkdirSync(join(dir, "outside"));
      if (!existsSync(join(dir, "repo"))) context.skip(); // a case-sensitive file system
      symlinkSync(join(dir, "outside"), join(dir, "Repo", "reports"), "junction");
      const out = join(dir, "repo", "reports", "r.md");
      expect(run(["scan", join(dir, "REPO"), "--output", out], options).code).toBe(2);
      expect(readdirSync(join(dir, "outside"))).toEqual([]);
    });

    it("still writes into a real folder inside the scanned folder", () => {
      const { repo } = repoWithLink();
      const out = join(repo, "plain", "report.md");
      expect(run(["scan", repo, "--output", out], options).code).toBe(0);
      expect(readFileSync(out, "utf8")).toContain("Neukee scan report");
    });

    it("checks only the file itself for an output path outside the scanned folder", () => {
      const { repo, outside } = repoWithLink();
      const dir = tempDir();
      const real = join(dir, "real");
      mkdirSync(real);
      symlinkSync(real, join(dir, "linked"), "junction"); // like /tmp on macOS: a link above the output
      const out = join(dir, "linked", "report.md");
      expect(run(["scan", repo, "--output", out], options).code).toBe(0);
      expect(readFileSync(join(real, "report.md"), "utf8")).toContain("Neukee scan report");
      expect(readdirSync(outside)).toEqual([]);
    });
  });

  it("won't write through a symbolic link, which a scanned repo could have planted", (context) => {
    const dir = tempDir();
    const victim = join(dir, "victim.txt");
    const link = join(dir, "neukee-report.md");
    writeFileSync(victim, "precious");
    try {
      symlinkSync(victim, link);
    } catch (error) {
      // Only Windows without the symlink privilege skips; any other setup failure fails the test.
      const denied =
        error instanceof Error &&
        "code" in error &&
        ["EPERM", "EACCES"].includes(String(error.code));
      if (process.platform === "win32" && denied) context.skip();
      throw error;
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
