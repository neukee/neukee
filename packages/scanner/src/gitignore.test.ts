import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isIgnored, MAX_RULE_BYTES, parseIgnoreFile, type ScopedRule } from "./gitignore.js";

interface GitCase {
  name: string;
  files: Record<string, string>;
  path: string;
  isDirectory: boolean;
  ignored: boolean;
}

// Generated from real git by fixtures/gitignore/generate.mjs (ADR-015).
const table: { gitVersion: string; cases: GitCase[] } = JSON.parse(
  readFileSync(new URL("../../../fixtures/gitignore/cases.json", import.meta.url), "utf8"),
);

/** Rules from every file, parent folders first, as the walker stacks them. */
function rulesFrom(files: Record<string, string>): ScopedRule[] {
  return Object.entries(files)
    .sort(([a], [b]) => (a === "" ? 0 : a.split("/").length) - (b === "" ? 0 : b.split("/").length))
    .flatMap(([base, text]) => parseIgnoreFile(text).rules.map((rule) => ({ base, rule })));
}

/** Git's full answer: a path is ignored if it, or any folder above it, is ignored. */
function ignoredLikeGit(path: string, isDirectory: boolean, rules: ScopedRule[]): boolean {
  const parts = path.split("/");
  for (let depth = 1; depth < parts.length; depth++) {
    if (isIgnored(parts.slice(0, depth).join("/"), true, rules)) return true;
  }
  return isIgnored(path, isDirectory, rules);
}

describe(`gitignore matching agrees with real git (${table.gitVersion})`, () => {
  it("has the full table", () => {
    expect(table.cases.length).toBeGreaterThan(70);
  });

  it.each(table.cases)("$name: $path", ({ files, path, isDirectory, ignored }) => {
    expect(ignoredLikeGit(path, isDirectory, rulesFrom(files))).toBe(ignored);
  });
});

describe("parseIgnoreFile: lines the scanner drops on purpose, with a reason", () => {
  it("reads an empty file as no rules and no problems", () => {
    expect(parseIgnoreFile("")).toEqual({ rules: [], problems: [] });
  });

  it("drops a rule longer than the cap, keeps the rest, and says which line", () => {
    const long = `${"a".repeat(MAX_RULE_BYTES)}b`;
    const { rules, problems } = parseIgnoreFile(`*.log\n${long}\n*.tmp\n`);
    expect(rules).toHaveLength(2);
    expect(problems).toEqual([{ line: 2, reason: `is longer than ${MAX_RULE_BYTES} bytes` }]);
  });

  it("counts the cap in bytes, not characters", () => {
    const nearCap = "é".repeat(MAX_RULE_BYTES / 2); // exactly the cap in UTF-8
    expect(parseIgnoreFile(nearCap).problems).toEqual([]);
    expect(parseIgnoreFile(`${nearCap}x`).problems).toEqual([
      { line: 1, reason: `is longer than ${MAX_RULE_BYTES} bytes` },
    ]);
  });

  // Git supports POSIX classes; the scanner doesn't (ADR-015), so the rule is dropped and the
  // file stays in the scan (fail open) instead of being matched wrongly.
  it("drops a POSIX character class rule, so the file is still scanned", () => {
    const { rules, problems } = parseIgnoreFile("[[:digit:]].c\n");
    expect(rules).toEqual([]);
    expect(problems).toEqual([
      { line: 1, reason: "uses a POSIX character class ([:name:]), which isn't supported" },
    ]);
  });

  it("drops an unclosed class, which git never matches either", () => {
    expect(parseIgnoreFile("ok\n[ab\n")).toMatchObject({
      problems: [{ line: 2, reason: "has an unclosed [ and never matches" }],
    });
    expect(parseIgnoreFile("ok\n[ab\n").rules).toHaveLength(1);
  });

  it("drops a rule ending in a lone backslash, which git never matches", () => {
    expect(parseIgnoreFile("foo\\").problems).toEqual([
      { line: 1, reason: "ends with a backslash and never matches" },
    ]);
  });

  it("numbers lines the same with CRLF endings and a byte order mark", () => {
    const { problems } = parseIgnoreFile(`﻿*.log\r\n[ab\r\n`);
    expect(problems).toEqual([{ line: 2, reason: "has an unclosed [ and never matches" }]);
  });
});

describe("matching stays fast on hostile rules within the caps", () => {
  // Shapes from the T-005 review. Each rule is at most MAX_RULE_BYTES; 2,000 rules is the cap
  // on rules in force (ADR-015). Generous bound: this guards against a quadratic regression,
  // not a micro-benchmark.
  const cap = MAX_RULE_BYTES - 1;
  const shapes: [string, string][] = [
    ["a globstar chain", `${"**/".repeat(Math.floor(cap / 3))}a`],
    ["a long class", `*[${"b".repeat(cap - 4)}]z`],
    ["many question marks", `/*${"?".repeat(cap - 3)}x`],
    ["star and question mark runs", `*${"?".repeat(120)}x`],
    ["alternating stars", `${"*a".repeat(Math.floor(cap / 2))}b`],
    [
      "a class of alternating bytes",
      `*[${"acegikmoqsuwyACEGIKMOQSUWY02468".repeat(40).slice(0, cap - 4)}]z`,
    ],
  ];
  const deepPath = Array.from({ length: 200 }, () => "aaaaaaaaaa").join("/");

  it.each(shapes)("2,000 rules of %s against a 2,200-byte path", (_, rule) => {
    const rules = rulesFrom({ "": `${`${rule}\n`.repeat(2000)}` });
    expect(rules).toHaveLength(2000);
    const start = performance.now();
    isIgnored(deepPath, false, rules);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
