import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { parseDocument } from "yaml";
import type { Severity, Tool } from "./index.js";
import { isRuleId } from "./validate.js";

/** One file in `catalog/<tool>/<name>.yaml` (docs/ARCHITECTURE.md §6). */
export interface CatalogEntry {
  /** Same grammar as a report's `ruleId`, e.g. "next16/sync-request-apis". */
  id: string;
  title: string;
  applies: { tool: Tool; introducedIn: string };
  severity: Severity;
  /** Which code-level detector produces the facts, e.g. "ast/sync-request-api". */
  detector: string;
  message: string;
  fix?: string;
  sourceUrl: string;
  /** Repo-relative folders under fixtures/. */
  fixtures: { positive: string; negative: string };
}

export interface CatalogError {
  /** The entry's path relative to the repo root, with forward slashes. */
  file: string;
  message: string;
}

export interface Catalog {
  entries: CatalogEntry[];
  errors: CatalogError[];
}

// Records keyed by the union: adding a severity or tool to the type fails to compile here.
const SEVERITIES: Record<Severity, true> = { "action-required": true, warning: true, info: true };
const TOOLS: Record<Tool, true> = { node: true, next: true, react: true, prisma: true };

/** ADR-003: sources must be official. Extend only when an entry needs another official site. */
const OFFICIAL_HOSTS = ["nextjs.org", "nodejs.org", "react.dev", "www.prisma.io"];
const OFFICIAL_SOURCE = new RegExp(
  `^https://(?:${OFFICIAL_HOSTS.map((host) => host.replaceAll(".", "\\.")).join("|")})/\\S*$`,
);
const VERSION = /^\d+\.\d+\.\d+$/;

// Field name → required?
const FIELDS = {
  id: true,
  title: true,
  applies: true,
  severity: true,
  detector: true,
  message: true,
  fix: false,
  sourceUrl: true,
  fixtures: true,
};
const APPLIES_FIELDS = { tool: true, introducedIn: true };
const FIXTURE_FIELDS = { positive: true, negative: true };

/**
 * Reads every entry under `dir` (the catalog folder at the repo root). A bad file becomes an
 * error naming it and never stops the others. Entries are sorted by id, errors by file.
 */
export function loadCatalog(dir: string): Catalog {
  const root = dirname(dir);
  const entries: CatalogEntry[] = [];
  const errors: CatalogError[] = [];
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".yaml") || path.endsWith(".yml"))
    .sort();
  for (const path of files) {
    const file = relative(root, join(dir, path)).split(sep).join("/");
    const result = readEntry(join(dir, path), file, root, basename(dir));
    if (typeof result === "string") errors.push({ file, message: result });
    else entries.push(result);
  }
  entries.sort((a, b) => byText(a.id, b.id));
  errors.sort((a, b) => byText(a.file, b.file));
  return { entries, errors };
}

/** The entry, or the first problem found, as a sentence naming the file. */
function readEntry(
  path: string,
  file: string,
  root: string,
  catalogFolder: string,
): CatalogEntry | string {
  if (path.endsWith(".yml")) return `${file}: catalog entries use the .yaml extension.`;

  // Core schema only, and any warning is fatal: an unknown tag (e.g. !!js/function) is only a
  // warning in the yaml library, and its value would otherwise pass as a plain string.
  const doc = parseDocument(readFileSync(path, "utf8"), {
    schema: "core",
    uniqueKeys: true,
    merge: false,
  });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) {
    const firstLine = problem.message.split("\n")[0]?.replace(/:$/, "") ?? problem.message;
    return `${file} is not valid catalog YAML: ${firstLine}.`;
  }

  const raw: unknown = doc.toJS();
  if (!isMapping(raw)) return `${file} must contain one YAML mapping (got ${shape(raw)}).`;

  const unknown =
    unknownField(raw, FIELDS, "") ??
    (isMapping(raw.applies) ? unknownField(raw.applies, APPLIES_FIELDS, "applies.") : undefined) ??
    (isMapping(raw.fixtures) ? unknownField(raw.fixtures, FIXTURE_FIELDS, "fixtures.") : undefined);
  if (unknown !== undefined) return `${file} has unknown field "${unknown}".`;

  const missing = missingField(raw, FIELDS, "");
  if (missing !== undefined) return `${file} is missing required field "${missing}".`;
  const { applies, fixtures } = raw;
  if (!isMapping(applies)) return `${file}: applies must be a mapping (tool, introducedIn).`;
  if (!isMapping(fixtures)) return `${file}: fixtures must be a mapping (positive, negative).`;
  const nestedMissing =
    missingField(applies, APPLIES_FIELDS, "applies.") ??
    missingField(fixtures, FIXTURE_FIELDS, "fixtures.");
  if (nestedMissing !== undefined) return `${file} is missing required field "${nestedMissing}".`;

  const { id, title, severity, detector, message, fix, sourceUrl } = raw;
  const { tool, introducedIn } = applies;

  if (typeof id !== "string" || !isRuleId(id)) {
    return `${file}: id ${shown(id)} is not a catalog id (lowercase segments joined by "/", like "next16/sync-request-apis").`;
  }
  if (!isTool(tool)) {
    return `${file}: applies.tool must be one of ${oneOf(Object.keys(TOOLS))} (got ${shown(tool)}).`;
  }
  if (typeof introducedIn !== "string" || !VERSION.test(introducedIn)) {
    return `${file}: applies.introducedIn must be a version like "16.0.0" (got ${shown(introducedIn)}).`;
  }
  if (!isSeverity(severity)) {
    return `${file}: severity must be one of ${oneOf(Object.keys(SEVERITIES))} (got ${shown(severity)}).`;
  }
  if (!isText(title)) return `${file}: title must be a non-empty string.`;
  if (/[\r\n]/.test(title)) return `${file}: title must be a single line of text.`;
  if (!isText(detector)) return `${file}: detector must be a non-empty string.`;
  if (!isText(message)) return `${file}: message must be a non-empty string.`;
  if (fix !== undefined && !isText(fix)) return `${file}: fix must be a non-empty string.`;
  if (typeof sourceUrl !== "string" || !OFFICIAL_SOURCE.test(sourceUrl)) {
    return `${file}: sourceUrl must be an https URL on an official source (${OFFICIAL_HOSTS.join(", ")}) (got ${shown(sourceUrl)}).`;
  }

  const expected = `${catalogFolder}/${tool}/${id.slice(id.indexOf("/") + 1)}.yaml`;
  if (file !== expected) {
    return `${file}: id "${id}" with applies.tool "${tool}" belongs at ${expected}.`;
  }

  const positive = fixtureFolder(fixtures.positive, "positive", root);
  if ("problem" in positive) return `${file}: ${positive.problem}`;
  const negative = fixtureFolder(fixtures.negative, "negative", root);
  if ("problem" in negative) return `${file}: ${negative.problem}`;

  return {
    id,
    title,
    applies: { tool, introducedIn },
    severity,
    detector,
    message,
    ...(fix === undefined ? {} : { fix }),
    sourceUrl,
    fixtures: { positive: positive.path, negative: negative.path },
  };
}

/** Fixtures live only under the top-level fixtures/ folder (CLAUDE.md, Quality bar). */
function fixtureFolder(
  value: unknown,
  kind: string,
  root: string,
): { path: string } | { problem: string } {
  const outside = {
    problem: `fixtures.${kind} must be a folder under fixtures/ (got ${shown(value)}).`,
  };
  if (typeof value !== "string" || value.includes("\\")) return outside;
  const segments = value.split("/");
  const badSegment = segments.some(
    (segment) => segment === "" || segment === "." || segment === "..",
  );
  if (segments[0] !== "fixtures" || segments.length < 2 || badSegment) return outside;
  const stat = statSync(join(root, value), { throwIfNoEntry: false });
  if (stat === undefined)
    return { problem: `fixtures.${kind} points to ${value}, which does not exist.` };
  if (!stat.isDirectory())
    return { problem: `fixtures.${kind} points to ${value}, which is not a folder.` };
  return { path: value };
}

function unknownField(
  value: Record<string, unknown>,
  fields: Record<string, boolean>,
  prefix: string,
): string | undefined {
  const key = Object.keys(value)
    .sort()
    .find((name) => !Object.hasOwn(fields, name));
  return key === undefined ? undefined : `${prefix}${key}`;
}

function missingField(
  value: Record<string, unknown>,
  fields: Record<string, boolean>,
  prefix: string,
): string | undefined {
  const key = Object.entries(fields).find(
    ([name, required]) => required && !Object.hasOwn(value, name),
  )?.[0];
  return key === undefined ? undefined : `${prefix}${key}`;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTool(value: unknown): value is Tool {
  return typeof value === "string" && Object.hasOwn(TOOLS, value);
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && Object.hasOwn(SEVERITIES, value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function shape(value: unknown): string {
  if (value === null || value === undefined) return "an empty file";
  if (Array.isArray(value)) return "a list";
  return `a ${typeof value}`;
}

function shown(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** ["a", "b", "c"] → `"a", "b" or "c"` */
function oneOf(values: string[]): string {
  const quoted = values.map((value) => JSON.stringify(value));
  return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

/** Code-unit order, never locale (same as compareFindings). */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
