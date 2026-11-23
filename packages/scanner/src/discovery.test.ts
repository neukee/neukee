import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Diagnostic, isRepoPath } from "@neukee/core";
import { afterEach, describe, expect, it } from "vitest";
import { type DiscoveryEvent, discoverFiles } from "./discover.js";

const fixture = fileURLToPath(new URL("../../../fixtures/repos/discovery/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copyFixture(): string {
  const parent = mkdtempSync(join(tmpdir(), "neukee-discovery-"));
  roots.push(parent);
  const root = join(parent, "repo");
  cpSync(fixture, root, { recursive: true });
  return root;
}

describe("file discovery", () => {
  it("respects nested ignore rules and skips generated directories", () => {
    const root = copyFixture();
    writeFileSync(
      join(root, ".gitignore"),
      "# Root ignore rules\r\n\r\nignored-root.txt\r\n*.log\r\n*.tmp\r\n/root-only/\r\n[[:digit:]].cache\r\n[a\\]].class\r\nignored-tree/**\r\n!ignored-tree/keep.txt\r\n!nested\r\n!/nested\r\n",
    );
    writeFileSync(join(root, "ignored-root.txt"), "ignored");
    writeFileSync(join(root, "visible.log"), "ignored");
    writeFileSync(join(root, "7.cache"), "ignored");
    writeFileSync(join(root, "x.cache"), "included");
    writeFileSync(join(root, "a.class"), "ignored");
    writeFileSync(join(root, "].class"), "ignored");
    writeFileSync(join(root, "x.class"), "included");
    writeFileSync(join(root, "empty.txt"), "");
    mkdirSync(join(root, "root-only"));
    writeFileSync(join(root, "root-only/hidden.txt"), "ignored");
    writeFileSync(join(root, "nested/drop.tmp"), "ignored");
    writeFileSync(join(root, "nested/keep.tmp"), "included");
    writeFileSync(join(root, "nested/deeper/drop.tmp"), "ignored");
    writeFileSync(join(root, "nested/deeper/keep.tmp"), "included");
    writeFileSync(join(root, "nested/error.log"), "ignored");
    mkdirSync(join(root, "ignored-tree"));
    writeFileSync(join(root, "ignored-tree/drop.txt"), "ignored");
    writeFileSync(join(root, "ignored-tree/keep.txt"), "included");

    for (const directory of ["node_modules/pkg", ".git", ".next", "dist", "build", "coverage"]) {
      mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, directory, "ignored.txt"), "ignored");
    }

    const outside = join(root, "..", "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(root, "external-link"), "junction");

    writeFileSync(join(root, "at-limit.bin"), Buffer.alloc(1024 * 1024, 0x61));
    writeFileSync(join(root, "over-limit.bin"), Buffer.alloc(2 * 1024 * 1024, 0x61));

    const events = Array.from(discoverFiles(root));
    const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
    const skipped = events.filter((event) => event.type === "skipped").length;
    const diagnostics = events.flatMap((event) =>
      event.type === "diagnostic" ? [event.diagnostic] : [],
    );
    expect(files.map((file) => file.path)).toEqual([
      ".gitignore",
      "7.cache",
      "at-limit.bin",
      "empty.txt",
      "ignored-tree/keep.txt",
      "nested/.gitignore",
      "nested/deeper/keep.tmp",
      "nested/deeper/keep.txt",
      "nested/keep.tmp",
      "nested/keep.txt",
      "nested/root-only/included.txt",
      "readme.md",
      "root-only.txt",
      "root.txt",
      "x.cache",
      "x.class",
    ]);
    expect(files.find((file) => file.path === "at-limit.bin")?.content).toHaveLength(1024 * 1024);
    expect(files.find((file) => file.path === "empty.txt")?.content).toBe("");
    expect(skipped).toBe(2);
    // The POSIX class rule is dropped (ADR-015), so 7.cache stays in the scan; the external
    // symlink is skipped and reported, never followed.
    expect(diagnostics).toEqual([
      {
        level: "warning",
        message:
          "Line 7 of this .gitignore was not applied: it uses [: inside a class, which isn't supported (POSIX classes such as [:digit:]).",
        file: ".gitignore",
      },
      {
        level: "warning",
        message: "Skipped a symbolic link: the scanner never follows links.",
        file: "external-link",
      },
    ]);
  });

  it("skips a path rejected by the core RepoPath pattern without reporting that path", () => {
    const root = copyFixture();
    const invalidName = "bad\u202ename.txt";
    writeFileSync(join(root, invalidName), "hostile path");
    expect(isRepoPath(invalidName)).toBe(false);

    const events = Array.from(discoverFiles(root));
    const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
    const skipped = events.filter((event) => event.type === "skipped").length;
    const diagnostics = events.flatMap((event) =>
      event.type === "diagnostic" ? [event.diagnostic] : [],
    );
    expect(files.some((file) => file.path === invalidName)).toBe(false);
    expect(skipped).toBe(1);
    // Strict: the diagnostic must not carry a `file` key at all, not even an undefined one.
    expect(diagnostics).toStrictEqual([
      { level: "warning", message: "Skipped a path invalid for report output." },
    ]);
  });

  it("reports many dropped rule lines as one diagnostic, not one per line", () => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), "[[:x]\n".repeat(10_000)); // 60,000 bytes
    writeFileSync(join(root, "included.txt"), "included");

    const events = Array.from(discoverFiles(root));
    expect(paths(events)).toContain("included.txt");
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message:
          "10000 lines of this .gitignore were not applied; the first is line 1: it uses [: inside a class, which isn't supported (POSIX classes such as [:digit:]).",
        file: ".gitignore",
      },
    ]);
  });

  it("drops an over-long rule line with a diagnostic and applies the rest", () => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), `${"a".repeat(2000)}\n*.tmp\n`);
    writeFileSync(join(root, "drop.tmp"), "ignored");
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).not.toContain("drop.tmp");
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message: "Line 1 of this .gitignore was not applied: it is longer than 1024 bytes.",
        file: ".gitignore",
      },
    ]);
  });

  it("skips a .gitignore over 64 KiB with a diagnostic and scans as if it weren't there", () => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), `*.txt\n${"#".repeat(64 * 1024)}\n`);
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).toContain("root.txt"); // *.txt was not applied (fail open)
    expect(paths(events)).not.toContain(".gitignore");
    expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message:
          "This .gitignore is larger than 64 KiB, so rules from parent folders no longer apply here or below.",
        file: ".gitignore",
      },
    ]);
  });

  it("skips a .gitignore that would put more than 2,000 rules in force", () => {
    const root = copyFixture();
    const many = Array.from({ length: 1995 }, (_, i) => `unused-${i}`).join("\n");
    writeFileSync(join(root, ".gitignore"), `${many}\n`);
    writeFileSync(
      join(root, "nested/.gitignore"),
      Array.from({ length: 6 }, () => "*.txt").join("\n"),
    );
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).toContain("nested/keep.txt"); // nested rules were not applied
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message:
          "This .gitignore was not applied: it would put more than 2000 rules in force, so rules from parent folders no longer apply here or below.",
        file: "nested/.gitignore",
      },
    ]);
  });

  it("applies a .gitignore that brings the rules in force to exactly 2,000", () => {
    const root = copyFixture();
    // 1,999 rules at the root; nested/.gitignore (`!keep.tmp`) makes exactly 2,000.
    const many = Array.from({ length: 1998 }, (_, i) => `unused-${i}`).join("\n");
    writeFileSync(join(root, ".gitignore"), `${many}\n*.tmp\n`);
    writeFileSync(join(root, "drop.tmp"), "ignored");
    writeFileSync(join(root, "nested/keep.tmp"), "re-included by nested/.gitignore");
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).not.toContain("drop.tmp");
    expect(paths(events)).toContain("nested/keep.tmp");
    expect(diagnosticsOf(events)).toEqual([]);
  });

  // ADR-015: past the matching budget the answer is "too-costly", and the path stays in the scan.
  it("scans and reports a path whose .gitignore check runs out of its work budget", () => {
    const root = copyFixture();
    // Each check against a 255-byte name costs over 16,000 steps; 480 rules stay under 64 KiB.
    const costly = `*${"a".repeat(127)}b`;
    writeFileSync(join(root, ".gitignore"), `${costly}\n`.repeat(480));
    const longName = `${"a".repeat(254)}c`;
    writeFileSync(join(root, longName), "scanned anyway");
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).toContain(longName);
    expect(paths(events)).toContain("root.txt");
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message:
          "Checking this path against .gitignore rules ran out of its work budget, so it was scanned.",
        file: longName,
      },
    ]);
  });

  // T-005c: once the scan's matching budget is spent, one diagnostic says where, and every later
  // path is scanned without .gitignore rules (fail open). Each long name below costs a full
  // per-path budget, so about 200 of them spend the scan's budget.
  it("reports once when the scan's matching budget runs out, then scans without rules", () => {
    const root = copyFixture();
    const costly = `*${"a".repeat(60)}b`; // 63 bytes; 1,000 rules stay under 64 KiB
    writeFileSync(join(root, ".gitignore"), `*.ignored\n${`${costly}\n`.repeat(1000)}`);
    for (let i = 0; i < 230; i++) {
      writeFileSync(join(root, `${String(i).padStart(3, "0")}${"a".repeat(118)}c`), "");
    }
    writeFileSync(join(root, "zzz.ignored"), "ignored until the budget runs out");

    const events = Array.from(discoverFiles(root));
    const messages = diagnosticsOf(events).map((diagnostic) => diagnostic.message);
    const outOfBudget = diagnosticsOf(events).filter((diagnostic) =>
      diagnostic.message.startsWith("The scan ran out of its .gitignore matching budget"),
    );
    expect(outOfBudget).toHaveLength(1);
    expect(messages.at(-1)).toBe(outOfBudget[0]?.message);
    expect(paths(events)).toContain("zzz.ignored");
    expect(paths(events)).toContain(`229${"a".repeat(118)}c`);
  }, 60_000);

  // Parsing is paid from the scan's budget too: 70 folders, each with a 64 KiB .gitignore of
  // one-character rules, spend it on parsing alone. One diagnostic names the .gitignore where
  // that happened, and later .gitignore files are scanned as plain files, not parsed.
  // Charged per UTF-8 byte, not per UTF-16 code unit: "中\n" is 4 bytes but 2 code units, so
  // a code-unit charge would let these files spend only half the budget.
  it.each([
    ["one-byte", "a\n".repeat(32_768)],
    ["three-byte", "中\n".repeat(16_384)],
  ])(
    "pays for parsing %s .gitignore files from the scan's budget, and stops once it is spent",
    (_, text) => {
      const root = copyFixture();
      for (let i = 0; i < 70; i++) {
        const folder = join(root, `d${String(i).padStart(2, "0")}`);
        mkdirSync(folder);
        writeFileSync(join(folder, ".gitignore"), text);
        writeFileSync(join(folder, "kept.txt"), "kept");
      }
      const events = Array.from(discoverFiles(root));
      const outOfBudget = diagnosticsOf(events).filter((diagnostic) =>
        diagnostic.message.startsWith("The scan ran out of its .gitignore matching budget"),
      );
      expect(outOfBudget).toHaveLength(1);
      expect(outOfBudget[0]?.file).toMatch(/^d\d\d\/\.gitignore$/);
      expect(paths(events)).toContain("d69/.gitignore");
      expect(paths(events)).toContain("d69/kept.txt");
    },
    60_000,
  );

  // A .gitignore that can't be applied might have re-included files: its subtree then applies no
  // inherited rules either, so a parent rule can't wrongly exclude them (fail open).
  it.each([
    ["over 64 KiB", `!important.js\n${"#".repeat(64 * 1024)}\n`],
    ["past the rules-in-force cap", `!important.js\n${"x\n".repeat(2000)}`],
  ])("turns off inherited rules below a .gitignore %s", (_, nested) => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), "*.js\n");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/.gitignore"), nested);
    writeFileSync(join(root, "src/important.js"), "kept");
    writeFileSync(join(root, "dropped.js"), "ignored by the root rule");
    const files = paths(Array.from(discoverFiles(root)));
    expect(files).toContain("src/important.js");
    expect(files).not.toContain("dropped.js");
  });

  it("matches a .gitignore against itself as a file, and folder-only rules never match files", () => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), "/.gitignore\n");
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub/.gitignore"), ".gitignore/\ndata/\n");
    writeFileSync(join(root, "sub/data"), "a file, not a folder");
    const files = paths(Array.from(discoverFiles(root)));
    expect(files).not.toContain(".gitignore");
    expect(files).toContain("sub/.gitignore");
    expect(files).toContain("sub/data");
  });

  // A root whose path is redirected after the scan started (a parent folder swapped for a link)
  // must not be read: its real location is no longer the root the scan resolved.
  it("refuses a scan root redirected after the scan started", () => {
    const base = mkdtempSync(join(tmpdir(), "neukee-discovery-"));
    roots.push(base);
    const parent = join(base, "p");
    const root = join(parent, "repo");
    cpSync(fixture, root, { recursive: true });
    mkdirSync(join(base, "elsewhere/repo"), { recursive: true });
    writeFileSync(join(base, "elsewhere/repo/planted.txt"), "planted");

    const scan = discoverFiles(root);
    renameSync(parent, join(base, "p-moved"));
    symlinkSync(join(base, "elsewhere"), parent, "junction");

    expect(Array.from(scan)).toStrictEqual([
      { type: "skipped" },
      {
        type: "diagnostic",
        diagnostic: {
          level: "warning",
          message: "Skipped a directory that is not safely inside the scan root.",
        },
      },
    ]);
  });

  it("reports a .git or generated folder that is a symlink, like any other link", () => {
    const root = copyFixture();
    symlinkSync(join(root, "nested"), join(root, ".git"), "junction");
    symlinkSync(join(root, "nested"), join(root, "node_modules"), "junction");
    const events = Array.from(discoverFiles(root));
    expect(events.filter((event) => event.type === "skipped")).toHaveLength(2);
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message: "Skipped a symbolic link: the scanner never follows links.",
        file: ".git",
      },
      {
        level: "warning",
        message: "Skipped a symbolic link: the scanner never follows links.",
        file: "node_modules",
      },
    ]);
  });

  it("skips and reports a symlink even when it points inside the repo", () => {
    const root = copyFixture();
    symlinkSync(join(root, "nested"), join(root, "inside-link"), "junction");
    const events = Array.from(discoverFiles(root));
    expect(paths(events).some((path) => path.startsWith("inside-link"))).toBe(false);
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message: "Skipped a symbolic link: the scanner never follows links.",
        file: "inside-link",
      },
    ]);
  });
});

// Permissions don't apply on Windows or to root, so these run elsewhere. Each restores the mode
// so the temp folder can be removed.
const canDenyRead = process.platform !== "win32" && process.getuid?.() !== 0;

describe.skipIf(!canDenyRead)("file discovery: unreadable input becomes a diagnostic", () => {
  function denied(root: string, path: string, run: () => void): void {
    chmodSync(join(root, path), 0o000);
    try {
      run();
    } finally {
      chmodSync(join(root, path), 0o755);
    }
  }

  it("reports an unreadable folder and scans the rest", () => {
    const root = copyFixture();
    denied(root, "nested", () => {
      const events = Array.from(discoverFiles(root));
      expect(paths(events)).toContain("root.txt");
      expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
      expect(diagnosticsOf(events)).toEqual([
        { level: "warning", message: "Could not read directory.", file: "nested" },
      ]);
    });
  });

  it("skips and reports an unreadable file", () => {
    const root = copyFixture();
    denied(root, "root.txt", () => {
      const events = Array.from(discoverFiles(root));
      expect(paths(events)).not.toContain("root.txt");
      expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
      expect(diagnosticsOf(events)).toEqual([
        { level: "warning", message: "Could not read file.", file: "root.txt" },
      ]);
    });
  });

  it("scans as if an unreadable .gitignore weren't there, and says so", () => {
    const root = copyFixture();
    writeFileSync(join(root, "keep.log"), "would be ignored by *.log");
    denied(root, ".gitignore", () => {
      const events = Array.from(discoverFiles(root));
      expect(paths(events)).toContain("keep.log");
      expect(diagnosticsOf(events)).toEqual([
        {
          level: "warning",
          message:
            "This .gitignore could not be read safely, so rules from parent folders no longer apply here or below.",
          file: ".gitignore",
        },
      ]);
    });
  });

  it("reports an unreadable scan root as an error", () => {
    const root = copyFixture();
    chmodSync(root, 0o000);
    try {
      expect(diagnosticsOf(Array.from(discoverFiles(root)))).toEqual([
        { level: "error", message: "Could not read scan root." },
      ]);
    } finally {
      chmodSync(root, 0o755);
    }
  });
});

// FIFOs and open file handles are POSIX notions here: Windows has neither mkfifo nor /dev/fd.
describe.skipIf(process.platform === "win32")("file discovery: special files and handles", () => {
  it("skips a FIFO without opening it", () => {
    const root = copyFixture();
    // Node has no mkfifo API; the system tool creates the test's own FIFO.
    execFileSync("mkfifo", [join(root, "pipe")]);
    const events = Array.from(discoverFiles(root));
    expect(paths(events)).not.toContain("pipe");
    expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
    expect(diagnosticsOf(events)).toEqual([]);
  });

  // A scan of a big repo opens thousands of files; one leaked handle per file runs out of them.
  it("closes every file it opens, including ones it skips", () => {
    const root = copyFixture();
    writeFileSync(join(root, "over-limit.bin"), Buffer.alloc(2 * 1024 * 1024, 0x61));
    writeFileSync(join(root, ".gitignore"), `*.log\n${"#".repeat(64 * 1024)}\n`);
    // Counted synchronously around a synchronous scan, so nothing else can open a handle between.
    const before = readdirSync("/dev/fd").length;
    const events = Array.from(discoverFiles(root));
    const after = readdirSync("/dev/fd").length;
    expect(paths(events)).toContain("root.txt");
    expect(after).toBe(before);
  });
});

function paths(events: DiscoveryEvent[]): string[] {
  return events.flatMap((event) => (event.type === "file" ? [event.file.path] : []));
}

function diagnosticsOf(events: DiscoveryEvent[]): Diagnostic[] {
  return events.flatMap((event) => (event.type === "diagnostic" ? [event.diagnostic] : []));
}
