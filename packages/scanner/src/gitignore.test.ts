import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isIgnored,
  MAX_RULE_BYTES,
  MAX_SCAN_MATCH_STEPS,
  type MatchBudget,
  PARSE_STEPS_PER_BYTE,
  parseIgnoreFile,
  type ScopedRule,
} from "./gitignore.js";

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

/** A scan budget that never runs out, so each call gets its full per-path share. */
function unlimited(): MatchBudget {
  return { steps: Number.POSITIVE_INFINITY };
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
    if (isIgnored(parts.slice(0, depth).join("/"), true, rules, unlimited()) === "ignored") {
      return true;
    }
  }
  return isIgnored(path, isDirectory, rules, unlimited()) === "ignored";
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
    ["short anchored x/**", "x/**", "a/b"],
    ["short anchored */*", "*/*", "a/b"],
    ["short anchored **/x", "**/x", "a/b"],
  ];

  it.each(shapes)("2,000 rules of %s", (_, rule, path) => {
    const rules = rulesFrom({ "": `${rule}\n`.repeat(2000) });
    expect(rules).toHaveLength(2000);
    const start = performance.now();
    const answers = [
      isIgnored(path, false, rules, unlimited()),
      isIgnored(path, true, rules, unlimited()),
    ];
    expect(performance.now() - start).toBeLessThan(2000);
    for (const answer of answers) expect(["ignored", "included", "too-costly"]).toContain(answer);
  });

  // T-005c: a whole scan shares one budget. For every hostile shape, a full scan budget's worth of
  // work must take under 10 s; this measures a slice and scales it up, so the test stays quick.
  it.each(shapes)(
    "a whole scan's budget of %s takes under 10 s",
    (_, rule, path) => {
      const rules = rulesFrom({ "": `${rule}\n`.repeat(2000) });
      const slice = MAX_SCAN_MATCH_STEPS / 15;
      const scan = { steps: slice };
      const start = performance.now();
      while (scan.steps > 0) isIgnored(path, false, rules, scan);
      const scaled = ((performance.now() - start) * MAX_SCAN_MATCH_STEPS) / (slice - scan.steps);
      expect(scaled).toBeLessThan(10_000);
    },
    60_000,
  );

  // One .gitignore per folder, each with one rule: every rule needs its own base resolved.
  it("a whole scan's budget with a .gitignore in each of 400 nested folders takes under 10 s", () => {
    const rules: ScopedRule[] = Array.from({ length: 400 }, (_, depth) => ({
      base: Array.from({ length: depth }, () => "a").join("/"),
      rule: parseIgnoreFile("x/\n").rules[0] ?? fail(),
    }));
    const path = `${"a/".repeat(400)}f`;
    const slice = MAX_SCAN_MATCH_STEPS / 15;
    const scan = { steps: slice };
    const start = performance.now();
    while (scan.steps > 0) isIgnored(path, false, rules, scan);
    const scaled = ((performance.now() - start) * MAX_SCAN_MATCH_STEPS) / (slice - scan.steps);
    expect(scaled).toBeLessThan(10_000);
  }, 60_000);

  it("answers too-costly when the budget runs out, rather than guessing", () => {
    const rules = rulesFrom({ "": `*${"a".repeat(127)}b\n`.repeat(2000) });
    expect(isIgnored(longName, false, rules, unlimited())).toBe("too-costly");
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
      expect(isIgnored(path, false, rules, unlimited())).not.toBe("too-costly");
    }
    expect(isIgnored("src/a/b/gen7.js", false, rules, unlimited())).toBe("ignored");
  });
});

function fail(): never {
  throw new Error("expected a rule");
}

describe("parsing is paid from the scan's budget", () => {
  // Parsing a 64 KiB .gitignore is charged PARSE_STEPS_PER_BYTE per byte. For every hostile
  // shape, parsing the files it takes to spend the whole budget must take under 10 s.
  const fill = (line: string) => `${line}\n`.repeat(Math.floor(65_536 / (line.length + 1)));
  const parseShapes: [string, string][] = [
    ["one-character rules", fill("a")],
    ["unsupported class lines", fill("[[:x]")],
    ["slash runs", fill(`a${"/".repeat(1000)}a`)],
    ["short segments", fill(`${"a/".repeat(500)}a`)],
    ["star segments", fill(`${"*/".repeat(500)}*`)],
    ["class segments", fill(`${"[a]/".repeat(250)}a`)],
    ["escaped slashes", fill(`${"a\\/".repeat(300)}a`)],
    ["globstar segments", fill(`${"**/a/".repeat(200)}a`)],
    ["class ranges", fill(`[${"\u0001-\u00ff".repeat(300)}]`)],
  ];
  it.each(parseShapes)("a whole scan's budget of %s takes under 10 s to parse", (_, text) => {
    parseIgnoreFile(text); // warm up
    const runs = 3;
    const start = performance.now();
    for (let i = 0; i < runs; i++) parseIgnoreFile(text);
    const perFile = (performance.now() - start) / runs;
    const files = MAX_SCAN_MATCH_STEPS / (PARSE_STEPS_PER_BYTE * text.length);
    expect(perFile * files).toBeLessThan(10_000);
  });
});

describe("the scan-wide budget", () => {
  it("never answers with the scan's last steps: spending them means too-costly", () => {
    const rules = rulesFrom({ "": "*.log\n" });
    const probe = { steps: 1_000_000 };
    expect(isIgnored("a.log", false, rules, probe)).toBe("ignored");
    const cost = 1_000_000 - probe.steps;
    expect(isIgnored("a.log", false, rules, { steps: cost })).toBe("too-costly");
  });

  it("charges nothing when no .gitignore applies", () => {
    const scan = { steps: 10 };
    expect(isIgnored("a/b/c.txt", false, [], scan)).toBe("included");
    expect(scan.steps).toBe(10);
  });

  // Sreeram, 2026-11-23: a large real-world .gitignore (300 varied rules) on a 25,000-path
  // repository never runs out. Bigger ones fail open with one diagnostic.
  it("never runs out for 300 varied rules on a 25,000-path repository", () => {
    const lines = Array.from({ length: 60 }, (_, i) => [
      `*.ext${i}`,
      `build${i}/`,
      `/generated/out${i}`,
      `**/cache${i}`,
      `src/**/gen${i}.js`,
    ]).flat();
    const rules = rulesFrom({ "": `${lines.join("\n")}\n` });
    expect(rules).toHaveLength(300);
    const scan = { steps: MAX_SCAN_MATCH_STEPS };
    for (let i = 0; i < 25_000; i++) {
      const path = `packages/pkg${i % 50}/src/components/feature${i % 37}/Component${i}.test.tsx`;
      expect(isIgnored(path, false, rules, scan)).not.toBe("too-costly");
    }
    expect(scan.steps).toBeGreaterThan(0);
  });

  it("is paid by every call, and answers too-costly once the scan has no budget left", () => {
    const rules = rulesFrom({ "": "*.log\n" });
    const scan = { steps: 1000 };
    expect(isIgnored("src/a.txt", false, rules, scan)).toBe("included");
    expect(scan.steps).toBeLessThan(1000);
    scan.steps = 3;
    expect(isIgnored("src/a.txt", false, rules, scan)).toBe("too-costly");
    expect(scan.steps).toBeLessThanOrEqual(0);
  });

  it("never runs out for a typical .gitignore on a 100,000-path repository", () => {
    const rules = rulesFrom({
      "": "node_modules/\ndist/\n*.log\n.env\n.env.*\ncoverage/\n.next/\nout/\n*.tsbuildinfo\n.DS_Store\nbuild/\n.turbo\n*.pem\nnpm-debug.log*\n.vercel\n",
    });
    const scan = { steps: MAX_SCAN_MATCH_STEPS };
    for (let i = 0; i < 100_000; i++) {
      const path = `packages/pkg${i % 50}/src/feature${i % 37}/Component${i}.test.tsx`;
      expect(isIgnored(path, false, rules, scan)).toBe("included");
    }
    expect(scan.steps).toBeGreaterThan(MAX_SCAN_MATCH_STEPS / 2);
  });
});

const POSIX = "uses [: inside a class, which isn't supported (POSIX classes such as [:digit:])";
const UNCLOSED = "has a [ that isn't closed before the next / or the end";
