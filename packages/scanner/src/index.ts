import type { Diagnostic } from "@neukee/core";
import { parseSync } from "oxc-parser";

export { blockingFindings, type FailOn } from "./fail-on.js";
export { renderMarkdown, renderTerminal } from "./render.js";
export { missingRuleIds } from "./runtime-findings.js";
export { type ScanOptions, scan } from "./scan.js";

export interface SyntaxCheck {
  ok: boolean;
  diagnostics: Diagnostic[];
}

/**
 * Parse one source file without running it. Never throws: parse problems become diagnostics,
 * so one broken file never stops a scan (docs/ARCHITECTURE.md §4).
 */
export function checkSyntax(file: string, source: string): SyntaxCheck {
  try {
    const result = parseSync(file, source);
    const diagnostics: Diagnostic[] = result.errors.map((error) => ({
      level: "warning",
      message: `Could not fully parse: ${error.message}`,
      file,
    }));
    return { ok: diagnostics.length === 0, diagnostics };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      diagnostics: [{ level: "error", message: `Parser failed: ${reason}`, file }],
    };
  }
}
