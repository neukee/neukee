import { compareFindings, type Diagnostic, type Finding } from "@neukee/core";

/**
 * Stage 4 of the pipeline (docs/ARCHITECTURE.md §4): findings in the total order of
 * `compareFindings`, with every repeat dropped. Two findings compare equal only when they are
 * equal in every field, so repeats are always adjacent after sorting.
 */
export function sortAndDedupe(findings: readonly Finding[]): Finding[] {
  const result: Finding[] = [];
  for (const finding of [...findings].sort(compareFindings)) {
    const last = result.at(-1);
    if (last === undefined || compareFindings(last, finding) !== 0) result.push(finding);
  }
  return result;
}

/** Text compares by UTF-16 code unit, never by locale, so output is the same on every machine. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * By file, then level, then message: discovery order never shows in a report. A diagnostic
 * without a file sorts first (a file name is never empty).
 */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      byText(a.file ?? "", b.file ?? "") ||
      byText(a.level, b.level) ||
      byText(a.message, b.message),
  );
}
