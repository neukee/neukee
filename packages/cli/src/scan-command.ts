import { existsSync, lstatSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, type ReportTarget, type Target } from "@neukee/core";
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
  if (args.output !== undefined && writesThroughLink(root, args.output)) {
    return usageError(
      `Won't write the report to ${args.output}: it is, or is inside, a symbolic link.`,
    );
  }

  const catalog = loadCatalog(options.catalogDir ?? defaultCatalogDir());
  if (catalog.errors.length > 0 || catalog.entries.length === 0) {
    return catalogFailure(catalog.errors);
  }
  const missing = missingRuleIds(catalog.entries);
  if (missing.length > 0) return catalogFailure([], missing);
  const report = scan(
    root,
    parsed,
    { name: "neukee", version },
    {
      entries: catalog.entries,
      ...(options.scannedAt === undefined ? {} : { scannedAt: options.scannedAt }),
    },
  );
  const code = blockingFindings(report.findings, failOn).length > 0 ? 1 : 0;
  // A file never gets color codes; the terminal gets them only when it can show them.
  const text =
    format === "markdown"
      ? renderMarkdown(report)
      : renderTerminal(report, {
          color: options.color && args.output === undefined,
          failOn,
        });
  if (args.output === undefined) return { code, stdout: text, stderr: "" };
  try {
    writeFileSync(resolve(args.output), text); // the path the guard checked, `..` already collapsed
  } catch (error) {
    return usageError(`Could not write the report to ${args.output} (${errorCode(error)}).`, false);
  }
  return { code, stdout: "", stderr: `Wrote the ${format} report to ${args.output}.\n` };
}

/**
 * Named targets replace the default for their own tool only (SPEC §1): without a Node.js target
 * the default `node@26` is added, and softens below-target (ADR-021). One target per tool.
 */
function parseTargets(given: readonly string[]): ReportTarget[] | string {
  const supported = SUPPORTED_TARGETS.map(label).join(", ");
  const targets: ReportTarget[] = [];
  for (const text of given) {
    const target = SUPPORTED_TARGETS.find((t) => label(t) === text);
    if (target === undefined) return `Unknown target "${text}". Supported targets: ${supported}.`;
    const same = targets.find((t) => t.tool === target.tool);
    if (same !== undefined) {
      return `Use one ${target.tool} target per run, not ${label(same)} and ${text}: run once per target.`;
    }
    targets.push({ ...target, source: "flag" });
  }
  if (!targets.some((t) => t.tool === DEFAULT_TARGET.tool)) {
    targets.push({ ...DEFAULT_TARGET, source: "default" });
  }
  // Sorted, so the same targets give the same report in any flag order (ARCHITECTURE §4).
  return targets.sort((a, b) => (label(a) < label(b) ? -1 : 1));
}

const label = (target: Target): string => `${target.tool}@${target.version}`;

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false; // missing, unreadable or not a valid path
  }
}

/**
 * Whether writing `output` would follow a symbolic link a scanned repository could have planted,
 * at a predictable name such as `neukee-report.md` or as a folder such as `reports`. The file
 * itself is never followed. A link on the way counts when it sits inside the scanned folder;
 * links above it are the user's own (`/tmp` is one on macOS) and are followed. Everything is judged
 * on real paths (`realpath.native` also fixes the letter case), so another spelling of the same
 * folder, such as a logical path against the physical one, can't hide a planted link.
 */
function writesThroughLink(root: string, output: string): boolean {
  try {
    const realRoot = realpathSync.native(root);
    const target = resolve(output);
    const top = parse(target).root;
    const parts = relative(top, target).split(sep);
    let dir = top;
    for (const [index, part] of parts.entries()) {
      const here = join(dir, part);
      if (
        lstatSync(here).isSymbolicLink() &&
        (index === parts.length - 1 || isInside(realRoot, here))
      ) {
        return true;
      }
      dir = realpathSync.native(here);
    }
    return false;
  } catch {
    return false; // nothing exists from here on, or it can't be read: the write reports it
  }
}

function isInside(folder: string, path: string): boolean {
  const inside = relative(folder, path);
  return inside !== "" && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
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
