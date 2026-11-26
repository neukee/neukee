import type { Diagnostic, Finding, ScanReport, Severity } from "@neukee/core";
import { blockingFindings, type FailOn } from "./fail-on.js";

/**
 * The terminal and markdown renderers (SPEC-SCANNER §3). Pure functions of a report. Every string
 * in a report can come from the scanned repo, so all of it is untrusted: control and bidi
 * characters are shown as visible escapes, and markdown is escaped (ADR-011, T-031).
 */

const SEVERITIES: readonly Severity[] = ["action-required", "warning", "info"];
// Records keyed by the union: a new severity fails to compile until it is listed.
const HEADING: Record<Severity, string> = {
  "action-required": "Action required",
  warning: "Warning",
  info: "Info",
};
const SGR: Record<Severity, string> = {
  "action-required": "1;31",
  warning: "33",
  info: "36",
};

/** ADR-021: every report says plainly what this version does not check. */
function coverageNote(report: ScanReport): string {
  return `Neukee v${report.tool.version} checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26. Rules for those APIs come after launch.`;
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
    lines.push("", paint(`${HEADING[severity].toUpperCase()} (${group.length})`, SGR[severity]));
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
        `  ${d.level}${d.file === undefined ? "" : ` ${clean(d.file)}`}: ${clean(d.message)}`,
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
    `- **Targets:** ${report.targets.map((t) => escapeMarkdown(`${t.tool}@${t.version}`)).join(", ") || "(none)"}`,
    `- **Scanned:** ${escapeMarkdown(report.scannedAt)}; ${filesText(report)}`,
  ];
  if (report.detected.node.length > 0) {
    lines.push(`- **Detected Node.js:** ${report.detected.node.map(escapeMarkdown).join(", ")}`);
  }
  lines.push("", `> **Coverage.** ${escapeMarkdown(coverageNote(report))}`, "", "## Summary", "");
  lines.push("| Severity | Findings |", "| --- | ---: |");
  for (const severity of SEVERITIES) {
    lines.push(
      `| ${HEADING[severity]} | ${report.findings.filter((f) => f.severity === severity).length} |`,
    );
  }
  if (report.findings.length === 0) lines.push("", "No findings.");
  for (const severity of SEVERITIES) {
    const group = report.findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push("", `## ${HEADING[severity]} (${group.length})`, "");
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
  const locations = finding.locations.length > 0 ? finding.locations.map(where) : ["(no location)"];
  return `| ${[
    escapeMarkdown(finding.ruleId),
    locations.map(escapeMarkdown).join("<br>"),
    escapeMarkdown(finding.message),
    finding.fix === undefined ? "" : escapeMarkdown(finding.fix),
    sourceLink(finding.sourceUrl),
  ].join(" | ")} |`;
}

function diagnosticRow(d: Diagnostic): string {
  return `| ${d.level} | ${d.file === undefined ? "" : escapeMarkdown(d.file)} | ${escapeMarkdown(d.message)} |`;
}

/** A link for an https URL, with the characters that end a link destination percent-encoded. */
function sourceLink(url: string): string {
  if (!url.startsWith("https://")) return escapeMarkdown(url);
  let destination = "";
  for (const ch of url) {
    const code = ch.codePointAt(0) ?? 0;
    const breaks = code <= 0x20 || code === 0x7f || '()<>\\"'.includes(ch);
    destination += breaks ? `%${code.toString(16).toUpperCase().padStart(2, "0")}` : ch;
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

/** Characters that can hide or reorder text, or move a terminal's cursor. */
function isHidden(code: number): boolean {
  return (
    code <= 0x1f || // C0 controls, including ESC
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x61c ||
    (code >= 0x200b && code <= 0x200f) || // zero-width characters and direction marks
    (code >= 0x2028 && code <= 0x202e) || // line and paragraph separators, bidi embeddings
    code === 0x2060 ||
    (code >= 0x2066 && code <= 0x2069) || // bidi isolates
    (code >= 0xd800 && code <= 0xdfff) || // lone surrogates
    code === 0xfeff
  );
}

/**
 * One line of safe text: line breaks and tabs become spaces, and every character that can hide
 * or reorder text becomes a visible `\u{…}` escape.
 */
function clean(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x0d || code === 0x09) out += " ";
    else out += isHidden(code) ? `\\u{${code.toString(16)}}` : ch;
  }
  return out;
}

// Markdown punctuation, plus the two ways text becomes a link on its own: `https://…` and `www.…`
// (and `x@y.z`, covered by `@`). Linear: one character class and two short lookarounds.
const MARKDOWN = /[\\`*_[\]<>|&~!#@]|:(?=\/\/)|(?<=www)\./gi;

function escapeMarkdown(text: string): string {
  return clean(text).replace(MARKDOWN, (match) => `\\${match}`);
}
