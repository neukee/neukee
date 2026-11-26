import type { Diagnostic, Finding, ScanReport, Severity } from "@neukee/core";
import { blockingFindings, type FailOn } from "./fail-on.js";

/**
 * The terminal and markdown renderers (SPEC-SCANNER §3). Pure functions of a report. Every string
 * in a report can come from the scanned repo, so all of it is untrusted: control and bidi
 * characters are shown as visible escapes, and markdown is escaped (ADR-011, T-031).
 */

// One record keyed by the union: a new severity fails to compile until it is listed here, and its
// key order is the order the severities are printed in.
const STYLE: Record<Severity, { heading: string; sgr: string }> = {
  "action-required": { heading: "Action required", sgr: "1;31" },
  warning: { heading: "Warning", sgr: "33" },
  info: { heading: "Info", sgr: "36" },
};
const isSeverity = (key: string): key is Severity => Object.hasOwn(STYLE, key);
const SEVERITIES = Object.keys(STYLE).filter(isSeverity);

/** ADR-021: every report says plainly what this version does not check. */
function coverageNote(report: ScanReport): string {
  return `Neukee v${clean(report.tool.version)} checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26. Rules for those APIs come after launch.`;
}

export function renderTerminal(
  report: ScanReport,
  options: { color: boolean; failOn: FailOn },
): string {
  const paint = (text: string, code: string) =>
    options.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const lines = [
    paint(`Neukee scan report (scanned ${clean(report.scannedAt)})`, "1"),
    `Targets: ${report.targets.map((t) => clean(`${t.tool}@${t.version}`)).join(", ") || "(none)"}`,
  ];
  if (report.detected.node.length > 0) {
    lines.push(`Detected Node.js: ${report.detected.node.map(clean).join(", ")}`);
  }
  if (report.findings.length === 0) lines.push("", "No findings.");
  for (const severity of SEVERITIES) {
    const group = report.findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push(
      "",
      paint(`${STYLE[severity].heading.toUpperCase()} (${group.length})`, STYLE[severity].sgr),
    );
    for (const finding of group) {
      lines.push("", `  ${clean(finding.ruleId)}: ${clean(finding.title)}`);
      for (const location of finding.locations.length > 0
        ? finding.locations.map(where)
        : ["(no location)"]) {
        lines.push(`    ${clean(location)}`);
      }
      lines.push(`    ${clean(finding.message)}`);
      if (finding.fix !== undefined) lines.push(`    Fix: ${clean(finding.fix)}`);
      lines.push(`    Source: ${clean(finding.sourceUrl)}`);
    }
  }
  if (report.diagnostics.length > 0) {
    lines.push("", `Diagnostics (${report.diagnostics.length})`);
    for (const d of report.diagnostics)
      lines.push(
        `  ${clean(d.level)}${d.file === undefined ? "" : ` ${clean(d.file)}`}: ${clean(d.message)}`,
      );
  }
  const blocking = blockingFindings(report.findings, options.failOn).length;
  lines.push("", coverageNote(report), "", summary(report), exitReason(blocking, options.failOn));
  return `${lines.join("\n")}\n`;
}

export function renderMarkdown(report: ScanReport): string {
  const lines = [
    "# Neukee scan report",
    "",
    `- **Targets:** ${report.targets.map((target) => codeSpan(`${target.tool}@${target.version}`)).join(", ") || "(none)"}`,
    `- **Scanned:** ${codeSpan(report.scannedAt)}; ${filesText(report)}`,
  ];
  if (report.detected.node.length > 0) {
    lines.push(
      `- **Detected Node.js:** ${report.detected.node.map((v) => codeSpan(v)).join(", ")}`,
    );
  }
  lines.push("", `> **Coverage.** ${escapeMarkdown(coverageNote(report))}`, "", "## Summary", "");
  lines.push("| Severity | Findings |", "| --- | ---: |");
  for (const severity of SEVERITIES) {
    lines.push(
      `| ${STYLE[severity].heading} | ${report.findings.filter((f) => f.severity === severity).length} |`,
    );
  }
  if (report.findings.length === 0) lines.push("", "No findings.");
  for (const severity of SEVERITIES) {
    const group = report.findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push("", `## ${STYLE[severity].heading} (${group.length})`, "");
    lines.push(
      "| Rule | Where | What was found | Fix | Source |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const finding of group) lines.push(markdownRow(finding));
  }
  if (report.diagnostics.length > 0) {
    lines.push("", `## Diagnostics (${report.diagnostics.length})`, "");
    lines.push("| Level | File | Message |", "| --- | --- | --- |");
    for (const d of report.diagnostics) lines.push(diagnosticRow(d));
  }
  return `${lines.join("\n")}\n`;
}

function markdownRow(finding: Finding): string {
  const locations =
    finding.locations.length > 0
      ? finding.locations.map((location) => codeSpan(where(location), true))
      : ["(no location)"];
  return `| ${[
    codeSpan(finding.ruleId, true),
    locations.join("<br>"),
    escapeMarkdown(finding.message),
    finding.fix === undefined ? "" : escapeMarkdown(finding.fix),
    sourceLink(finding.sourceUrl),
  ].join(" | ")} |`;
}

function diagnosticRow(d: Diagnostic): string {
  const file = d.file === undefined ? "" : codeSpan(d.file, true);
  return `| ${escapeMarkdown(d.level)} | ${file} | ${escapeMarkdown(d.message)} |`;
}

/**
 * A link for an https URL. Everything that ends a link destination or a table cell, and every
 * non-ASCII character, is percent-encoded, so the destination stays one safe ASCII token.
 */
function sourceLink(url: string): string {
  const safe = clean(url);
  if (!safe.startsWith("https://")) return escapeMarkdown(safe);
  let destination = "";
  for (const ch of safe) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x7f) destination += encodeURIComponent(ch);
    else if (code <= 0x20 || code === 0x7f || '()<>\\"|'.includes(ch)) {
      destination += `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    } else destination += ch;
  }
  return `[Source](${destination})`;
}

function where(location: Finding["locations"][number]): string {
  const { file, line, column } = location;
  if (line === undefined) return file;
  return column === undefined ? `${file}:${line}` : `${file}:${line}:${column}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function filesText(report: ScanReport): string {
  return `${plural(report.stats.filesScanned, "file")} scanned, ${report.stats.filesSkipped} skipped`;
}

function summary(report: ScanReport): string {
  const count = (severity: Severity) =>
    report.findings.filter((f) => f.severity === severity).length;
  const split = SEVERITIES.map((severity) => `${count(severity)} ${severity}`).join(", ");
  return `Summary: ${plural(report.findings.length, "finding")} (${split}); ${filesText(report)}.`;
}

function exitReason(blocking: number, failOn: FailOn): string {
  if (failOn === "never") return "Exit code 0: --fail-on never.";
  if (blocking === 0)
    return `Exit code 0: no findings at or above ${failOn} (--fail-on ${failOn}).`;
  return `Exit code 1: ${plural(blocking, "finding")} at or above ${failOn} (--fail-on ${failOn}).`;
}

// Everything invisible or that reorders text: controls, format characters (soft hyphen, zero-width,
// bidi, invisible operators, tag characters), line and paragraph separators, surrogates,
// private-use and unassigned code points, and the default-ignorable ones the categories miss
// (variation selectors, the combining grapheme joiner, Hangul and Khmer fillers). Linear: one
// character class.
const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * One line of safe text: line breaks and tabs become spaces, and every hidden character becomes a
 * visible `\u{…}` escape.
 */
function clean(text: string): string {
  return text.replace(HIDDEN, (ch) =>
    ch === "\n" || ch === "\r" || ch === "\t"
      ? " "
      : `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}`,
  );
}

// Markdown punctuation, plus the two ways text becomes a link on its own: `https://…` and `www.…`.
// Linear: one character class and two short lookarounds.
const MARKDOWN = /[\\`*_[\]<>|&~!]|:(?=\/\/)|(?<=www)\./gi;
// GitHub turns `@name`, `#1` and `:+1:` into a mention, an issue link and an emoji even after a
// backslash escape or an HTML entity. An empty HTML comment right after the `@`, the `#` or the
// colon of an emoji name stops that, shows the text unchanged and hides no character.
const GITHUB_LINKS = /[@#]|:(?=[\w+-]+:)/g;

/** Prose from the repo or the catalog (a message, a fix): escaped so it can't format or link. */
function escapeMarkdown(text: string): string {
  return clean(text)
    .replace(MARKDOWN, (match) => `\\${match}`)
    .replace(GITHUB_LINKS, (match) => `${match}<!-- -->`);
}

/**
 * A value (a path, a version, a rule id) as a code span, where nothing formats, links or
 * mentions. The fence is one backtick longer than any run inside, and a value that starts or ends
 * with a backtick gets a space on both sides. In a table cell a pipe stays escaped, even here.
 */
function codeSpan(value: string, inTable = false): string {
  const text = clean(value);
  if (text === "") return "";
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${inTable ? text.replaceAll("|", "\\|") : text}${pad}${fence}`;
}
