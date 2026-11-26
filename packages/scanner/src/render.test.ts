import type { Diagnostic, Finding, ScanReport } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { renderMarkdown, renderTerminal } from "./render.js";
import { matchGoldenText, scanFixture } from "./testing/scan-fixture.js";

const ESC = String.fromCharCode(27);
const RLO = String.fromCodePoint(0x202e); // right-to-left override

const base: ScanReport = {
  schemaVersion: 1,
  tool: { name: "neukee", version: "0.1.0" },
  scannedAt: "2026-11-26T12:00:00.000Z",
  root: ".",
  targets: [{ tool: "node", version: "26", source: "flag" }],
  detected: { node: ["22"], frameworks: {} },
  findings: [],
  diagnostics: [],
  stats: { filesScanned: 3, filesSkipped: 1 },
};

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "runtime/below-target",
    severity: "warning",
    title: "Declared Node.js version is below the upgrade target",
    message: ".nvmrc pins Node.js 22, below the target Node.js 26.",
    fix: "Update this declaration to the target's major version.",
    sourceUrl: "https://nodejs.org/en/about/previous-releases",
    locations: [{ file: ".nvmrc", line: 1, column: 1 }],
    target: { tool: "node", version: "26" },
    ...over,
  };
}

const report = (over: Partial<ScanReport> = {}): ScanReport => ({ ...base, ...over });
const withoutFix = (f: Finding): Finding => {
  const { fix: _fix, ...rest } = f;
  return rest;
};
const plain = { color: false, failOn: "action-required" as const };

describe("renderTerminal", () => {
  it("says there are no findings, and why the exit code is 0", () => {
    const text = renderTerminal(report(), plain);
    expect(text).toContain("No findings.");
    expect(text).toContain("Summary: 0 findings (0 action-required, 0 warning, 0 info)");
    expect(text).toContain("3 files scanned, 1 skipped");
    expect(text).toContain("Exit code 0: no findings at or above action-required");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("groups findings by severity, most severe first, each with where, fix and source", () => {
    const text = renderTerminal(
      report({
        findings: [
          finding({ severity: "action-required", title: "Blocker" }),
          finding({ title: "Careful" }),
          finding({ severity: "info", title: "Fyi" }),
        ],
      }),
      plain,
    );
    const at = (needle: string) => text.indexOf(needle);
    expect(at("ACTION REQUIRED (1)")).toBeGreaterThan(-1);
    expect(at("ACTION REQUIRED (1)")).toBeLessThan(at("WARNING (1)"));
    expect(at("WARNING (1)")).toBeLessThan(at("INFO (1)"));
    expect(text).toContain("runtime/below-target: Careful");
    expect(text).toContain(".nvmrc:1:1");
    expect(text).toContain(".nvmrc pins Node.js 22, below the target Node.js 26.");
    expect(text).toContain("Fix: Update this declaration to the target's major version.");
    expect(text).toContain("Source: https://nodejs.org/en/about/previous-releases");
  });

  it("lists every location of a finding, and says so when it has none", () => {
    const text = renderTerminal(
      report({
        findings: [
          finding({ locations: [{ file: "a/.nvmrc", line: 2 }, { file: "package.json" }] }),
          withoutFix(finding({ title: "Repo-wide", locations: [] })),
        ],
      }),
      plain,
    );
    expect(text).toContain("a/.nvmrc:2\n");
    expect(text).toContain("package.json\n");
    expect(text).toContain("(no location)");
    expect(text.split("Fix:").length).toBe(2); // the finding without a fix prints no Fix line
  });

  it("explains the exit code for each --fail-on value", () => {
    const findings = [finding({ severity: "action-required" }), finding()];
    const reason = (failOn: "action-required" | "warning" | "never") =>
      renderTerminal(report({ findings }), { color: false, failOn });
    expect(reason("action-required")).toContain(
      "Exit code 1: 1 finding at or above action-required",
    );
    expect(reason("warning")).toContain("Exit code 1: 2 findings at or above warning");
    expect(reason("never")).toContain("Exit code 0: --fail-on never");
  });

  it("says plainly what v0.1.0 does not check (ADR-021)", () => {
    const text = renderTerminal(report(), plain);
    expect(text).toContain("Neukee v0.1.0 checks which Node.js version runs where");
    expect(text).toContain("not your code for APIs removed in Node 23 to 26");
    expect(text).toContain("come after launch");
  });

  it("lists the targets, detected Node.js versions and diagnostics", () => {
    const diagnostics: Diagnostic[] = [
      { level: "warning", message: "Could not read it.", file: "package.json" },
    ];
    const text = renderTerminal(report({ diagnostics }), plain);
    expect(text).toContain("Targets: node@26");
    expect(text).toContain("Detected Node.js: 22");
    expect(text).toContain("Diagnostics (1)");
    expect(text).toContain("warning package.json: Could not read it.");
  });

  it("uses color only when asked, and only its own", () => {
    const withFinding = report({ findings: [finding()] });
    expect(renderTerminal(withFinding, plain)).not.toContain(ESC);
    const colored = renderTerminal(withFinding, { color: true, failOn: "action-required" });
    expect(colored).toContain(ESC);
    expect(colored.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "")).toBe(
      renderTerminal(withFinding, plain),
    );
  });

  it("shows control and bidi characters from the repo as visible escapes, never raw", () => {
    const hostile = `evil${ESC}[2J${RLO}fdp.exe\nforged: line\t.`;
    const text = renderTerminal(
      report({
        findings: [finding({ message: hostile, locations: [{ file: `a${RLO}b` }] })],
        diagnostics: [{ level: "error", message: hostile, file: "x" }],
      }),
      { color: true, failOn: "never" },
    );
    expect(text).not.toContain(`${ESC}[2J`);
    expect(text).not.toContain(RLO);
    expect(text).toContain("evil\\u{1b}[2J\\u{202e}fdp.exe forged: line .");
    expect(text).toContain("a\\u{202e}b");
  });
});

describe("marking default targets", () => {
  const named = { tool: "next" as const, version: "16", source: "flag" as const };
  const added = { tool: "node" as const, version: "26", source: "default" as const };

  it("marks only the targets whose source is a default, in both formats", () => {
    const mixed = report({ targets: [named, added] });
    expect(renderTerminal(mixed, plain)).toContain("Targets: next@16, node@26 (default)");
    expect(renderMarkdown(mixed)).toContain("- **Targets:** `next@16`, `node@26` (default)");
  });

  it("marks nothing when every target was named", () => {
    const named26 = { ...added, source: "flag" as const };
    expect(renderTerminal(report({ targets: [named, named26] }), plain)).toContain(
      "Targets: next@16, node@26\n",
    );
    expect(renderMarkdown(report({ targets: [named, named26] }))).toContain(
      "- **Targets:** `next@16`, `node@26`\n",
    );
  });
});

describe("renderMarkdown", () => {
  it("has a summary table, a table per severity, diagnostics and the coverage note", () => {
    const md = renderMarkdown(
      report({
        findings: [
          finding({ severity: "action-required" }),
          finding(),
          finding({ severity: "info" }),
        ],
        diagnostics: [{ level: "error", message: "Parser failed.", file: "a.js" }],
      }),
    );
    expect(md.startsWith("# Neukee scan report\n")).toBe(true);
    expect(md).toContain("| Action required | 1 |");
    expect(md).toContain("| Warning | 1 |");
    expect(md).toContain("| Info | 1 |");
    expect(md).toContain("## Warning (1)");
    expect(md).toContain("| Rule | Where | What was found | Fix | Source |");
    expect(md).toContain("[Source](https://nodejs.org/en/about/previous-releases)");
    expect(md).toContain("## Diagnostics (1)");
    expect(md).toContain("| error | `a.js` | Parser failed. |");
    expect(md).toContain("> **Coverage.** Neukee v0.1.0 checks which Node.js version runs where");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("says there are no findings", () => {
    expect(renderMarkdown(report())).toContain("No findings.");
  });

  it("puts every location in the Where cell, each as a code span", () => {
    const md = renderMarkdown(
      report({
        findings: [finding({ locations: [{ file: "a", line: 2, column: 3 }, { file: "b" }] })],
      }),
    );
    expect(md).toContain("`a:2:3`<br>`b`");
  });

  it("escapes markdown, HTML and autolinks in prose, and keeps paths in code spans", () => {
    const hostile =
      "[click](https://evil.example) <img src=x onerror=1> a|b *bold* _it_ `code` x@y.z";
    const md = renderMarkdown(
      report({ findings: [finding({ message: hostile, locations: [{ file: "p|q.json" }] })] }),
    );
    const rows = md.split("\n").filter((line) => line.startsWith("| `runtime/below-target`"));
    expect(rows).toHaveLength(1);
    const row = rows[0] ?? "";
    expect(row).toContain("\\[click\\]");
    expect(row).toContain("https\\://evil.example");
    expect(row).toContain("\\<img src=x onerror=1\\>");
    expect(row).toContain("a\\|b \\*bold\\* \\_it\\_ \\`code\\` x@<span></span>y.z");
    expect(row).toContain("`p\\|q.json`"); // a pipe stays escaped inside a cell, even in a code span
    // Every "<" is escaped, or is part of exactly our own empty span.
    expect(row).not.toMatch(/(?<!\\|<span>)<(?!span><\/span>)/);
  });

  it("keeps a multi-line message in one table row and neutralises control and bidi characters", () => {
    const md = renderMarkdown(
      report({ findings: [finding({ message: `one\r\ntwo${ESC}${RLO}three` })] }),
    );
    // In prose the visible escape's own backslash is escaped too, so it renders as \u{1b}.
    expect(md).toContain("one  two\\\\u{1b}\\\\u{202e}three");
    expect(md).not.toContain(ESC);
    expect(md).not.toContain(RLO);
  });

  it("links only https sources, with link-breaking characters percent-encoded", () => {
    const tricky = finding({ sourceUrl: "https://nodejs.org/a(b)c d>e" });
    expect(renderMarkdown(report({ findings: [tricky] }))).toContain(
      "[Source](https://nodejs.org/a%28b%29c%20d%3Ee)",
    );
    const notHttps = finding({ sourceUrl: "javascript:alert(1)" });
    const md = renderMarkdown(report({ findings: [notHttps] }));
    expect(md).not.toContain("](javascript");
    expect(md).toContain("javascript:alert(1)");
  });

  it("shows targets, detected versions and diagnostic files as code spans", () => {
    const md = renderMarkdown(
      report({
        detected: { node: ["<b>x</b>"], frameworks: {} },
        diagnostics: [{ level: "warning", message: "[x](y)", file: "f|g" }],
      }),
    );
    expect(md).toContain("- **Targets:** `node@26`\n");
    expect(md).toContain("- **Detected Node.js:** `<b>x</b>`\n");
    expect(md).toContain("| warning | `f\\|g` | \\[x\\](y) |");
  });

  it("fences a value with backticks by a longer run, padded when it starts or ends with one", () => {
    const md = (file: string) =>
      renderMarkdown(report({ findings: [finding({ locations: [{ file }] })] }));
    expect(md("odd`name``x.js")).toContain("```odd`name``x.js```");
    expect(md("`lead.js")).toContain("`` `lead.js ``");
    expect(md("trail.js`")).toContain("`` trail.js` ``");
    expect(md("`")).toContain("`` ` ``");
  });

  it("keeps a value's own enclosing spaces, which markdown would otherwise strip", () => {
    const md = (file: string) =>
      renderMarkdown(report({ findings: [finding({ locations: [{ file }] })] }));
    // CommonMark removes one space from each end of a code span that begins and ends with one,
    // unless it is all spaces, so a value with enclosing spaces gets one more on each side.
    expect(md(" name ")).toContain("`  name  `");
    expect(md("name ")).toContain("` name  `");
    expect(md(" name")).toContain("`  name `");
    expect(md("   ")).toContain("`   `");
    expect(md(" ` ")).toContain("``  `  ``");
  });

  it("keeps mentions, issue references, emoji and emails from linking in prose", () => {
    const message =
      "@Venu2328 @next/swc-linux-x64-gnu #1 neukee/neukee#1 :+1: x@y.z https://example.com www.example.com";
    const md = renderMarkdown(report({ findings: [finding({ message })] }));
    expect(md).toContain("@<span></span>Venu2328 @<span></span>next/swc-linux-x64-gnu");
    expect(md).toContain("#<span></span>1 neukee/neukee#<span></span>1");
    expect(md).toContain(":<span></span>+1:");
    expect(md).toContain("x@<span></span>y.z");
    expect(md).toContain("https\\://example.com www\\.example.com");
  });
});

// Every string field the renderers print, with the report built around one value. In markdown a
// value (a path, a version, a rule id) goes in a code span, in a table cell or on a line of its
// own; prose (a message) is escaped. `prefix` is the text the renderer puts in front inside the span.
type Field = {
  name: string;
  kind: "prose" | "cell" | "line";
  prefix?: string;
  build: (value: string) => ScanReport;
};
const FIELDS: Field[] = [
  {
    name: "tool version",
    kind: "prose",
    build: (v) => report({ tool: { name: "neukee", version: v } }),
  },
  { name: "scannedAt", kind: "line", build: (v) => report({ scannedAt: v }) },
  {
    name: "target version",
    kind: "line",
    prefix: "node@",
    build: (v) => report({ targets: [{ tool: "node", version: v, source: "flag" }] }),
  },
  {
    name: "detected.node",
    kind: "line",
    build: (v) => report({ detected: { node: [v], frameworks: {} } }),
  },
  { name: "ruleId", kind: "cell", build: (v) => report({ findings: [finding({ ruleId: v })] }) },
  { name: "message", kind: "prose", build: (v) => report({ findings: [finding({ message: v })] }) },
  { name: "fix", kind: "prose", build: (v) => report({ findings: [finding({ fix: v })] }) },
  {
    name: "sourceUrl",
    kind: "prose",
    build: (v) => report({ findings: [finding({ sourceUrl: v })] }),
  },
  {
    name: "location file",
    kind: "cell",
    build: (v) => report({ findings: [finding({ locations: [{ file: v }] })] }),
  },
  {
    name: "diagnostic file",
    kind: "cell",
    build: (v) => report({ diagnostics: [{ level: "warning", message: "m", file: v }] }),
  },
  {
    name: "diagnostic message",
    kind: "prose",
    build: (v) => report({ diagnostics: [{ level: "warning", message: v }] }),
  },
];

// Characters that hide or reorder text, one or more per class, as code points: controls, format
// characters, tags, variation selectors, fillers, separators, private use, unassigned and a lone
// surrogate. Numbers, not literals, so no invisible character sits in this source.
const HIDDEN_CODE_POINTS = [
  0x1b, // ESC
  0x85, // C1 next line
  0xad, // soft hyphen
  0x378, // unassigned
  0x34f, // combining grapheme joiner
  0x115f, // Hangul choseong filler
  0x1160, // Hangul jungseong filler
  0x17b4, // Khmer inherent vowel
  0x180e, // Mongolian vowel separator
  0x200b, // zero-width space
  0x2028, // line separator
  0x2029, // paragraph separator
  0x202e, // right-to-left override
  0x2063, // invisible separator
  0x3164, // Hangul filler
  0xe000, // private use
  0xfe0f, // variation selector
  0xffa0, // halfwidth Hangul filler
  0xfff9, // interlinear annotation anchor
  0xe0041, // tag character: "ASCII smuggling"
  0xd800, // lone surrogate
];
const HIDDEN: [string, string][] = HIDDEN_CODE_POINTS.map((codePoint) => [
  codePoint.toString(16),
  String.fromCodePoint(codePoint),
]);

// Prose that would format, link, mention or embed if it reached markdown as written, with its
// neutralised form. Backslash escapes work for formatting, but GitHub still links an escaped
// `\@name` or `\#1`, so those get an empty `<span></span>` after them instead. (An empty HTML
// comment does the same in a paragraph but not in a table cell, where the prose lives.)
const PROSE_ESCAPES: [string, string][] = [
  ["`", "\\`"],
  ["*", "\\*"],
  ["_", "\\_"],
  ["[", "\\["],
  ["]", "\\]"],
  ["<", "\\<"],
  [">", "\\>"],
  ["|", "\\|"],
  ["\\", "\\\\"],
  ["&lt;", "\\&lt;"],
  ["~~", "\\~\\~"],
  ["![", "\\!\\["],
  ["#1", "#<span></span>1"],
  ["@octocat", "@<span></span>octocat"],
  ["x@y.z", "x@<span></span>y.z"],
  [":+1:", ":<span></span>+1:"],
  [":white_check_mark:", ":<span></span>white\\_check\\_mark:"],
  [":+1://x", ":<span></span>+1\\://x"],
  ["https://x.example", "https\\://x.example"],
  ["www.x.example", "www\\.x.example"],
  ["WWW.x.example", "WWW\\.x.example"],
];

// The same kinds of input in a value: a code span shows them as written. Only a pipe, which would
// end a table cell, stays escaped (in a cell), and a backtick makes the fence longer.
const CODE_SPAN_INPUTS = ["`", "|", "@octocat", "#1", "*_[]<>&~!", "https://x.example", ":+1:"];

function expectedSpan(field: Field, raw: string): string {
  const shown = raw === "|" && field.kind === "cell" ? "\\|" : raw;
  const inner = `${field.prefix ?? ""}a${shown}b`;
  return raw === "`" ? `\`\`${inner}\`\`` : `\`${inner}\``;
}

describe.each(FIELDS)("hostile text in $name", (field) => {
  it.each(HIDDEN)("shows U+%s as a visible escape in both formats", (hex, raw) => {
    const value = `a${raw}b`;
    const terminal = renderTerminal(field.build(value), plain);
    const markdown = renderMarkdown(field.build(value));
    expect(terminal).not.toContain(raw);
    expect(markdown).not.toContain(raw);
    expect(terminal).toContain(`a\\u{${hex}}b`);
    // In prose the escape's own backslash is escaped too; a code span shows it as it is.
    expect(markdown).toContain(field.kind === "prose" ? `a\\\\u{${hex}}b` : `a\\u{${hex}}b`);
  });

  if (field.kind === "prose") {
    it.each(PROSE_ESCAPES)("neutralises %j in markdown prose", (raw, escaped) => {
      expect(renderMarkdown(field.build(`a${raw}b`))).toContain(`a${escaped}b`);
    });
  } else {
    it.each(CODE_SPAN_INPUTS)("shows %j in a markdown code span", (raw) => {
      expect(renderMarkdown(field.build(`a${raw}b`))).toContain(expectedSpan(field, raw));
    });
  }
});

describe("hostile text elsewhere", () => {
  it("neutralises a finding's title in the terminal, where it is printed", () => {
    const text = renderTerminal(report({ findings: [finding({ title: `t${ESC}[2J` })] }), plain);
    expect(text).not.toContain(ESC);
    expect(text).toContain("t\\u{1b}[2J");
  });

  it("handles a million characters of markdown punctuation and link starts", () => {
    const bracket = "[".repeat(1_000_000);
    const www = "www.".repeat(250_000);
    const at = "@".repeat(250_000);
    const ticks = "`".repeat(1_000_000);
    const md = renderMarkdown(
      report({
        findings: [finding({ message: `${bracket}${www}${at}`, locations: [{ file: ticks }] })],
      }),
    );
    expect(md).toContain("\\[".repeat(1_000_000));
    expect(md).toContain("www\\.".repeat(250_000));
    expect(md).toContain("@<span></span>".repeat(250_000));
    expect(md).toContain(`${"`".repeat(1_000_001)} ${ticks} ${"`".repeat(1_000_001)}`);
  });

  it("handles two hundred thousand separate runs of backticks without throwing", () => {
    const file = "` ".repeat(200_000);
    const md = renderMarkdown(report({ findings: [finding({ locations: [{ file }] })] }));
    expect(md).toContain("`` ` ` ` ");
  });

  it("does not let a link destination split a table cell or smuggle characters", () => {
    const link = (sourceUrl: string) =>
      renderMarkdown(report({ findings: [finding({ sourceUrl })] }));
    expect(link("https://x.example/a|b")).toContain("[Source](https://x.example/a%7Cb)");
    expect(link("https://x.example/é")).toContain("[Source](https://x.example/%C3%A9)");
    expect(link(`https://x.example/${RLO}`)).not.toContain(RLO);
    expect(link("https://x.example/\ud800")).toContain("%5Cu{d800}");
    expect(link("http://x.example/a")).not.toContain("](http");
    expect(link("http://x.example/a")).toContain("http\\://x.example/a");
  });
});

// Golden renderings of three fixture repos: no findings, every runtime rule, and an info finding
// with a diagnostic. Changing one needs a reason in the commit message and PROGRESS.
describe.each(["empty", "runtime-sources", "render-mixed"])("rendering the %s fixture", (name) => {
  const scanned = () =>
    scanFixture(name, [{ tool: "node", version: "26", source: "default" }], {
      scannedAt: "2026-11-26T12:00:00.000Z",
    });

  it("matches the golden terminal output", async () => {
    await matchGoldenText(`${name}.terminal`, ".txt", renderTerminal(scanned(), plain));
  });

  it("matches the golden markdown", async () => {
    await matchGoldenText(name, ".md", renderMarkdown(scanned()));
  });
});

// The cases that broke on GitHub when backslash escapes were used (Sreeram's paste test, 2026-11-27):
// mentions, scoped package names, issue references, emoji, emails and values with backticks.
// These tests pin the string only. What GitHub does with it shows only in its renderer, and in a
// table cell differently from a paragraph, so after changing `fixtures/expected/hostile.md` render
// it once: `gh api markdown -F text=@fixtures/expected/hostile.md -f mode=gfm -f context=owner/repo`
// (without a context a bare `#1` never becomes an issue link, so the check would pass for nothing)
// must show no user-mention, issue-link or mailto element and no emoji character.
describe("rendering hostile text", () => {
  const hostile = report({
    detected: { node: ["22", "`x` || >=20"], frameworks: {} },
    findings: [
      finding({
        message:
          "@Venu2328 @next/swc-linux-x64-gnu #1 neukee/neukee#1 :+1: x@y.z https://example.com www.example.com",
        fix: "Ask @maintainer about #2, then rerun.",
        locations: [
          { file: "packages/@scope/a#b/.nvmrc", line: 1, column: 1 },
          { file: "odd`name``x.js", line: 2 },
          { file: "`lead.js" },
        ],
      }),
    ],
    diagnostics: [
      {
        level: "warning",
        file: "packages/@scope/a#b/package.json",
        message: "Could not read @scope/pkg#3 :tada:",
      },
    ],
  });

  it("matches the golden markdown", async () => {
    await matchGoldenText("hostile", ".md", renderMarkdown(hostile));
  });
});
