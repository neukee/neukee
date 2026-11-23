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

// Generated from real git by fixtures/gitignore/generate.mjs (ADR-015). Read at runtime, so its
// shape is checked before use.
const parsed: unknown = JSON.parse(
  readFileSync(new URL("../../../fixtures/gitignore/cases.json", import.meta.url), "utf8"),
);
if (!isTable(parsed)) {
  throw new Error("fixtures/gitignore/cases.json has an unexpected shape. Regenerate it.");
}
const table = parsed;

function isTable(value: unknown): value is { gitVersion: string; cases: GitCase[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "gitVersion" in value &&
    typeof value.gitVersion === "string" &&
    "cases" in value &&
    Array.isArray(value.cases) &&
    value.cases.every(isGitCase)
  );
}

function isGitCase(value: unknown): value is GitCase {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "path" in value &&
    typeof value.path === "string" &&
    "isDirectory" in value &&
    typeof value.isDirectory === "boolean" &&
    "ignored" in value &&
    typeof value.ignored === "boolean" &&
    "files" in value &&
    typeof value.files === "object" &&
    value.files !== null &&
    Object.values(value.files).every((text) => typeof text === "string")
  );
}

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
    if (isIgnored(parts.slice(0, depth).join("/"), true, rules) === "ignored") return true;
  }
  return isIgnored(path, isDirectory, rules) === "ignored";
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
    expect(problems).toEqual([{ line: 1, reason: POSIX }]);
  });

  // Git reads `[[:x]` as a plain class; the scanner drops any `[:` inside a class (fail open).
  it("drops any [: inside a class, even one git reads as plain", () => {
    expect(parseIgnoreFile("[[:x]\n").problems).toEqual([{ line: 1, reason: POSIX }]);
  });

  it("drops an unclosed class, which git never matches either", () => {
    expect(parseIgnoreFile("ok\n[ab\n")).toMatchObject({
      problems: [{ line: 2, reason: UNCLOSED }],
    });
    expect(parseIgnoreFile("ok\n[ab\n").rules).toHaveLength(1);
  });

  // Git accepts a / inside a class (it can never match one); the scanner splits the rule into
  // folders first, so the class reads as unclosed and the rule is dropped (fail open, ADR-015).
  it.each(["a[!/]b", "[a/]b"])("drops %s, a class with a / inside", (rule) => {
    expect(parseIgnoreFile(rule).problems).toEqual([{ line: 1, reason: UNCLOSED }]);
  });

  it("drops a rule ending in a lone backslash, which git never matches", () => {
    expect(parseIgnoreFile("foo\\").problems).toEqual([
      { line: 1, reason: "ends with a backslash and never matches" },
    ]);
  });

  it("numbers lines the same with CRLF endings and a byte order mark", () => {
    const { problems } = parseIgnoreFile(`\uFEFF*.log\r\n[ab\r\n`);
    expect(problems).toEqual([{ line: 2, reason: UNCLOSED }]);
  });
});

describe("matching work per path is bounded on hostile rules within the caps", () => {
  // Each rule is at most MAX_RULE_BYTES and 2,000 rules is the cap on rules in force (ADR-015).
  // A path either gets an answer or runs out of its step budget ("too-costly"), so the cost per
  // path is bounded whatever the rules (about 10 ms at worst, ADR-015). The time bound is generous
  // for slow CI machines and mutation testing; before the budget, these shapes took 3–19 s.
  const cap = MAX_RULE_BYTES - 1;
  const deepPath = Array.from({ length: 200 }, () => "aaaaaaaaaa").join("/");
  const oneLetterPath = Array.from({ length: 1100 }, () => "a").join("/"); // 2,199 bytes
  const longName = `${"a".repeat(254)}c`;
  const longNames = Array.from({ length: 8 }, () => longName).join("/");
  const starChunk = `*${"a".repeat(120)}b`;
  const shapes: [string, string, string][] = [
    ["a globstar chain", `${"**/".repeat(Math.floor(cap / 3))}a`, deepPath],
    ["a long class", `*[${"b".repeat(cap - 4)}]z`, deepPath],
    ["many question marks", `/*${"?".repeat(cap - 3)}x`, deepPath],
    ["star and question mark runs", `*${"?".repeat(120)}x`, deepPath],
    ["alternating stars", `${"*a".repeat(Math.floor(cap / 2))}b`, deepPath],
    [
      "a class of alternating bytes",
      `*[${"acegikmoqsuwyACEGIKMOQSUWY02468".repeat(40).slice(0, cap - 4)}]z`,
      deepPath,
    ],
    ["512 literal segments", `a${"/a".repeat(511)}`, deepPath],
    ["512 literal segments, path as deep", `a${"/a".repeat(511)}`, oneLetterPath.slice(0, 1023)],
    ["512 star segments", `*${"/*".repeat(511)}`, deepPath],
    ["512 star segments, one-letter path", `*${"/*".repeat(511)}`, oneLetterPath],
    ["a globstar then star segments", `**/${"*/".repeat(509)}*`, deepPath],
    ["a globstar then star segments, one-letter path", `**/${"*/".repeat(509)}*`, oneLetterPath],
    ["question mark segments, one-letter path", `?${"/?".repeat(511)}`, oneLetterPath],
    [
      "globstars between star chunks, long names",
      Array.from({ length: 8 }, () => `**/${starChunk}`).join("/"),
      longNames,
    ],
    ["a star chunk against a 255-byte name", `*${"a".repeat(127)}b`, longName],
  ];

  it.each(shapes)("2,000 rules of %s", (_, rule, path) => {
    const rules = rulesFrom({ "": `${rule}\n`.repeat(2000) });
    expect(rules).toHaveLength(2000);
    const start = performance.now();
    const answers = [isIgnored(path, false, rules), isIgnored(path, true, rules)];
    expect(performance.now() - start).toBeLessThan(2000);
    for (const answer of answers) expect(["ignored", "included", "too-costly"]).toContain(answer);
  });

  it("answers too-costly when the budget runs out, rather than guessing", () => {
    const rules = rulesFrom({ "": `*${"a".repeat(127)}b\n`.repeat(2000) });
    expect(isIgnored(longName, false, rules)).toBe("too-costly");
  });

  // The budget must leave real repositories alone: a large, varied .gitignore at the rules cap,
  // against ordinary paths and a 255-byte name, always gets an answer.
  it("decides every path for a heavy real-world .gitignore", () => {
    const lines = Array.from({ length: 400 }, (_, i) => [
      `*.ext${i}`,
      `build${i}/`,
      `/generated/out${i}`,
      `**/cache${i}`,
      `src/**/gen${i}.js`,
    ]).flat();
    const rules = rulesFrom({ "": `${lines.join("\n")}\n` });
    expect(rules).toHaveLength(2000);
    const paths = [
      "src/components/some-long-component-name/index.test.tsx",
      "packages/app/src/deep/er/still/deeper/file.ts",
      `docs/${longName}`,
      "src/a/b/gen7.js",
    ];
    for (const path of paths) {
      expect(isIgnored(path, false, rules)).not.toBe("too-costly");
    }
    expect(isIgnored("src/a/b/gen7.js", false, rules)).toBe("ignored");
  });
});

const POSIX = "uses [: inside a class, which isn't supported (POSIX classes such as [:digit:])";
const UNCLOSED = "has a [ that isn't closed before the next / or the end";
