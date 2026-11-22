import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
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
          "Line 7 of this .gitignore was not applied: it uses a POSIX character class ([:name:]), which isn't supported.",
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
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0];
    if (diagnostic === undefined) throw new Error("Expected an invalid-path diagnostic.");
    expect(diagnostic.level).toBe("warning");
    expect(Object.hasOwn(diagnostic, "file")).toBe(false);
  });

  it("handles malformed POSIX classes without rescanning their suffixes", () => {
    const root = copyFixture();
    writeFileSync(join(root, ".gitignore"), `[${"[:".repeat(200_000)}x]`);
    writeFileSync(join(root, "included.txt"), "included");

    const files = Array.from(discoverFiles(root)).flatMap((event) =>
      event.type === "file" ? [event.file.path] : [],
    );
    expect(files).toContain("included.txt");
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
    expect(diagnosticsOf(events)).toEqual([
      {
        level: "warning",
        message: "This .gitignore is larger than 64 KiB, so its rules were not applied.",
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
        message: "This .gitignore was not applied: it would put more than 2000 rules in force.",
        file: "nested/.gitignore",
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
          message: "This .gitignore could not be read safely, so its rules were not applied.",
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

function paths(events: DiscoveryEvent[]): string[] {
  return events.flatMap((event) => (event.type === "file" ? [event.file.path] : []));
}

function diagnosticsOf(events: DiscoveryEvent[]): Diagnostic[] {
  return events.flatMap((event) => (event.type === "diagnostic" ? [event.diagnostic] : []));
}
