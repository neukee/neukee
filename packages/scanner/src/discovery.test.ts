import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { repoPathPattern } from "@neukee/core";
import { afterEach, describe, expect, it } from "vitest";
import { discoverFiles } from "./discover.js";
import { scan } from "./scan.js";

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
    expect(diagnostics).toEqual([]);
  });

  it("skips a path rejected by the core RepoPath pattern without reporting that path", () => {
    const root = copyFixture();
    const invalidName = "bad\u202ename.txt";
    writeFileSync(join(root, invalidName), "hostile path");
    expect(new RegExp(repoPathPattern(), "u").test(invalidName)).toBe(false);

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

  it("adds discovered diagnostics and counts to the report", () => {
    const root = copyFixture();
    const report = scan(root, [], { name: "neukee", version: "1.2.3" });
    expect(report.stats).toEqual({ filesScanned: 8, filesSkipped: 0 });
    expect(report.diagnostics).toEqual([]);
  });
});
