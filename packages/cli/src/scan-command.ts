import { existsSync, lstatSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCatalog, type Target } from "@neukee/core";
import {
  blockingFindings,
  type FailOn,
  missingRuleIds,
  renderMarkdown,
  renderTerminal,
  scan,
} from "@neukee/scanner";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Whether the terminal can show color; the bin decides from the TTY and `NO_COLOR`. */
  color: boolean;
  /** The scan date; the clock when absent. Tests fix it so dated findings stay stable. */
  scannedAt?: string;
  /** Where the catalog is; this package's own copy when absent. Tests point it elsewhere. */
  catalogDir?: string;
}

/** What `neukee scan` was given, as `parseArgs` read it. */
export interface ScanArgs {
  path: string | undefined;
  extra: number;
  targets: string[];
  format: string | undefined;
  output: string | undefined;
  failOn: string | undefined;
}

const SUPPORTED_TARGETS: readonly Target[] = [
  { tool: "node", version: "24" },
  { tool: "node", version: "26" },
  { tool: "next", version: "15" },
  { tool: "next", version: "16" },
];
const DEFAULT_TARGET: Target = { tool: "node", version: "26" };
const FAIL_ON: readonly FailOn[] = ["action-required", "warning", "never"];
export const ISSUES = "https://github.com/neukee/neukee/issues";

/** A usage error, exit code 2. `hint` points at --help; a failed write isn't a usage mistake. */
const usageError = (message: string, hint = true): RunResult => ({
  code: 2,
  stdout: "",
  stderr: `${message}\n${hint ? "Run neukee --help for usage.\n" : ""}`,
});

/** `neukee scan` (SPEC-SCANNER §1): check the arguments, scan, render, and pick the exit code. */
export function scanCommand(args: ScanArgs, options: RunOptions, version: string): RunResult {
  if (args.extra > 0) return usageError("Scan one folder at a time: neukee scan [path].");
  const format = args.format ?? "terminal";
  if (format === "json" || format === "sarif") {
    return usageError(`--format ${format} isn't available yet. Use terminal or markdown.`);
  }
  if (format !== "terminal" && format !== "markdown") {
    return usageError(`Unknown format "${format}". Use terminal or markdown.`);
  }
  const failOn = FAIL_ON.find((value) => value === (args.failOn ?? "action-required"));
  if (failOn === undefined) {
    return usageError(
      `Unknown --fail-on value "${args.failOn}". Use ${FAIL_ON.slice(0, -1).join(", ")} or ${FAIL_ON.at(-1)}.`,
    );
  }
  const parsed = parseTargets(args.targets);
  if (typeof parsed === "string") return usageError(parsed);
  const root = args.path ?? ".";
  if (!isFolder(root)) {
    return usageError(`${root} is not a folder. Pass the path of the project to scan.`);
  }
  // A scanned repo could plant a link at a predictable name such as neukee-report.md.
  if (args.output !== undefined && isSymbolicLink(args.output)) {
    return usageError(`Won't write the report to ${args.output}: it is a symbolic link.`);
  }

  const catalog = loadCatalog(options.catalogDir ?? defaultCatalogDir());
  if (catalog.errors.length > 0 || catalog.entries.length === 0) {
    return catalogFailure(catalog.errors);
  }
  const missing = missingRuleIds(catalog.entries);
  if (missing.length > 0) return catalogFailure([], missing);
  const report = scan(
    root,
    parsed.targets,
    { name: "neukee", version },
    {
      entries: catalog.entries,
      defaultTarget: parsed.defaults.length > 0,
      ...(options.scannedAt === undefined ? {} : { scannedAt: options.scannedAt }),
    },
  );
  const code = blockingFindings(report.findings, failOn).length > 0 ? 1 : 0;
  // A file never gets color codes; the terminal gets them only when it can show them.
  const text =
    format === "markdown"
      ? renderMarkdown(report, { defaultTargets: parsed.defaults })
      : renderTerminal(report, {
          color: options.color && args.output === undefined,
          failOn,
          defaultTargets: parsed.defaults,
        });
  if (args.output === undefined) return { code, stdout: text, stderr: "" };
  try {
    writeFileSync(args.output, text);
  } catch (error) {
    return usageError(`Could not write the report to ${args.output} (${errorCode(error)}).`, false);
  }
  return { code, stdout: "", stderr: `Wrote the ${format} report to ${args.output}.\n` };
}

/**
 * Named targets replace the default for their own tool only (SPEC §1): without a Node.js target
 * the default `node@26` is added, and softens below-target (ADR-021). One target per tool.
 */
function parseTargets(
  given: readonly string[],
): { targets: Target[]; defaults: Target[] } | string {
  const supported = SUPPORTED_TARGETS.map((t) => `${t.tool}@${t.version}`).join(", ");
  const targets: Target[] = [];
  for (const text of given) {
    const target = SUPPORTED_TARGETS.find((t) => `${t.tool}@${t.version}` === text);
    if (target === undefined) return `Unknown target "${text}". Supported targets: ${supported}.`;
    const same = targets.find((t) => t.tool === target.tool);
    if (same !== undefined) {
      return `Use one ${target.tool} target per run, not ${same.tool}@${same.version} and ${text}: run once per target.`;
    }
    targets.push(target);
  }
  const defaults = targets.some((t) => t.tool === DEFAULT_TARGET.tool) ? [] : [DEFAULT_TARGET];
  return { targets: [...targets, ...defaults], defaults };
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false; // missing, unreadable or not a valid path
  }
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false; // nothing there yet, or not a valid path: the write reports it
  }
}

/**
 * This package's own `catalog` folder when it ships one. The repository's catalog is used only in
 * a checkout (the pnpm workspace file is three folders up): in an install, three folders up is
 * `node_modules`, where any package named `catalog` could sit.
 */
function defaultCatalogDir(): string {
  const shipped = fileURLToPath(new URL("../catalog", import.meta.url));
  const workspaceFile = fileURLToPath(new URL("../../../pnpm-workspace.yaml", import.meta.url));
  if (!existsSync(shipped) && existsSync(workspaceFile)) {
    return fileURLToPath(new URL("../../../catalog", import.meta.url));
  }
  return shipped;
}

/** A broken, missing or incomplete catalog is a packaging bug: scanning would look clean. */
function catalogFailure(
  errors: readonly { file: string; message: string }[],
  missingRules: readonly string[] = [],
): RunResult {
  const lines = errors.map((error) => `  ${error.file}: ${error.message}`);
  if (missingRules.length > 0) lines.push(`  no entry for: ${missingRules.join(", ")}`);
  const detail = lines.length > 0 ? `\n${lines.join("\n")}` : " It has no entries.";
  return {
    code: 3,
    stdout: "",
    stderr: `The catalog can't be used, so nothing was scanned.${detail}\nThis is a bug in this install of Neukee: please report it at ${ISSUES}.\n`,
  };
}

function errorCode(error: unknown): string {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : "unknown error";
}
