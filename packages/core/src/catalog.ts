import { type Dirent, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import type { Severity, Tool } from "./index.js";
import { byText, describe, isPlainObject, isRuleId, listOf } from "./validate.js";

/** One file in `catalog/<id>.yaml` (docs/ARCHITECTURE.md §6, ADR-014). */
export interface CatalogEntry {
  /** Same grammar as a report's `ruleId`, e.g. "next16/sync-request-apis". */
  id: string;
  title: string;
  /**
   * `introducedIn` gates the rule to upgrades that cross it (SPEC-SCANNER §2.5). Rules that aren't
   * tied to a release, such as `runtime/*`, have none (ADR-020).
   */
  applies: { tool: Tool; introducedIn?: string };
  severity: Severity;
  /** Which code-level detector produces the facts, e.g. "ast/sync-request-api". */
  detector: string;
  message: string;
  fix?: string;
  sourceUrl: string;
  /** Repo-relative folders under fixtures/. Tests check they exist; the npm package omits them. */
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

/** ADR-003, ADR-014: official sources only. Adding a host needs an ADR line. */
const OFFICIAL_HOSTS = ["nextjs.org", "nodejs.org", "react.dev", "www.prisma.io", "docs.npmjs.com"];
const VERSION = /^\d+\.\d+\.\d+$/;
/** Real entries are about 1 KB; anything this big is a mistake, not an entry. */
const MAX_BYTES = 64 * 1024;

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
const APPLIES_FIELDS = { tool: true, introducedIn: false };
const FIXTURE_FIELDS = { positive: true, negative: true };

/**
 * Reads every entry under `dir`, the catalog folder at the repo root. A bad file becomes an error
 * naming it and never stops the others. Entries are sorted by id, errors by file.
 */
export function loadCatalog(dir: string): Catalog {
  const entries: CatalogEntry[] = [];
  const errors: CatalogError[] = [];
  for (const found of catalogFiles(dir, "")) {
    const file = found.path === "" ? "catalog" : `catalog/${found.path}`;
    const result =
      found.problem === undefined
        ? readEntry(join(dir, found.path), found.path, file)
        : `${file} ${found.problem}.`;
    if (typeof result === "string") errors.push({ file, message: result });
    else entries.push(result);
  }
  entries.sort((a, b) => byText(a.id, b.id));
  errors.sort((a, b) => byText(a.file, b.file));
  return { entries, errors };
}

/**
 * Files that look like YAML (paths relative to `dir`, forward slashes), plus every symlink and
 * unreadable folder as a problem, so nothing is dropped silently. Never follows links.
 */
function catalogFiles(dir: string, prefix: string): { path: string; problem?: string }[] {
  let dirents: Dirent[];
  try {
    dirents = readdirSync(join(dir, prefix), { withFileTypes: true });
  } catch (error) {
    return [{ path: prefix, problem: `could not be read (${errorCode(error)})` }];
  }
  return dirents.flatMap((dirent) => {
    const path = prefix === "" ? dirent.name : `${prefix}/${dirent.name}`;
    if (dirent.isSymbolicLink()) {
      return [{ path, problem: "is a symbolic link; the catalog doesn't follow links" }];
    }
    if (dirent.isDirectory()) return catalogFiles(dir, path);
    return /\.ya?ml$/i.test(dirent.name) ? [{ path }] : [];
  });
}

/** The entry, or the first problem found, as a sentence naming the file. */
function readEntry(fullPath: string, path: string, file: string): CatalogEntry | string {
  if (!path.endsWith(".yaml")) return `${file}: catalog entries use the lowercase .yaml extension.`;

  let raw: unknown;
  try {
    const stat = lstatSync(fullPath);
    // A FIFO or device named *.yaml would block or misbehave on read.
    if (!stat.isFile()) return `${file} is not a regular file.`;
    if (stat.size > MAX_BYTES) {
      return `${file} is ${stat.size} bytes; catalog entries must be under 64 KiB.`;
    }
    // Core schema only, and any warning is fatal: an unknown tag (e.g. !!js/function) is only a
    // warning in the yaml library, and its value would otherwise pass as a plain string.
    const doc = parseDocument(readFileSync(fullPath, "utf8"), {
      schema: "core",
      uniqueKeys: true,
      merge: false,
    });
    const problem = doc.errors[0] ?? doc.warnings[0];
    if (problem !== undefined)
      return `${file} is not valid catalog YAML: ${firstLine(problem.message)}.`;
    raw = doc.toJS(); // throws on alias bombs ("Excessive alias count")
  } catch (error) {
    // File-system errors give only their code: their messages hold absolute machine paths.
    // Others (the yaml library's alias guard) are safe to show.
    const code = errorCode(error);
    if (code !== "unknown error") return `${file} could not be read (${code}).`;
    return `${file} could not be read: ${firstLine(error instanceof Error ? error.message : String(error))}.`;
  }
  if (!isPlainObject(raw)) return `${file} must contain one YAML mapping (got ${shape(raw)}).`;

  const unknown =
    unknownField(raw, FIELDS, "") ??
    (isPlainObject(raw.applies)
      ? unknownField(raw.applies, APPLIES_FIELDS, "applies.")
      : undefined) ??
    (isPlainObject(raw.fixtures)
      ? unknownField(raw.fixtures, FIXTURE_FIELDS, "fixtures.")
      : undefined);
  if (unknown !== undefined) return `${file} has unknown field "${unknown}".`;

  const missing = missingField(raw, FIELDS, "");
  if (missing !== undefined) return `${file} is missing required field "${missing}".`;
  const { applies, fixtures } = raw;
  if (!isPlainObject(applies)) return `${file}: applies must be a mapping (tool, introducedIn).`;
  if (!isPlainObject(fixtures)) return `${file}: fixtures must be a mapping (positive, negative).`;
  const nestedMissing =
    missingField(applies, APPLIES_FIELDS, "applies.") ??
    missingField(fixtures, FIXTURE_FIELDS, "fixtures.");
  if (nestedMissing !== undefined) return `${file} is missing required field "${nestedMissing}".`;

  const { id, title, severity, detector, message, fix, sourceUrl } = raw;
  const { tool, introducedIn } = applies;

  if (typeof id !== "string" || !isRuleId(id)) {
    return `${file}: id ${describe(id)} is not a catalog id (lowercase segments joined by "/", like "next16/sync-request-apis").`;
  }
  if (path !== `${id}.yaml`) return `${file}: id "${id}" belongs at catalog/${id}.yaml.`;
  if (!isTool(tool)) {
    return `${file}: applies.tool must be one of ${quotedList(Object.keys(TOOLS))} (got ${describe(tool)}).`;
  }
  if (
    introducedIn !== undefined &&
    (typeof introducedIn !== "string" || !VERSION.test(introducedIn))
  ) {
    return `${file}: applies.introducedIn must be a version like "16.0.0" (got ${describe(introducedIn)}).`;
  }
  if (!isSeverity(severity)) {
    return `${file}: severity must be one of ${quotedList(Object.keys(SEVERITIES))} (got ${describe(severity)}).`;
  }
  if (!isText(title)) return `${file}: title must be a non-empty string.`;
  if (/[\r\n]/.test(title)) return `${file}: title must be a single line of text.`;
  if (!isText(detector)) return `${file}: detector must be a non-empty string.`;
  if (!isText(message)) return `${file}: message must be a non-empty string.`;
  if (fix !== undefined && !isText(fix)) return `${file}: fix must be a non-empty string.`;
  if (!isOfficialSource(sourceUrl)) {
    return `${file}: sourceUrl must be a canonical https URL on an official host (${OFFICIAL_HOSTS.join(", ")}), with no credentials or port (got ${describe(sourceUrl)}).`;
  }
  const { positive, negative } = fixtures;
  if (!isFixturePath(positive)) {
    return `${file}: fixtures.positive must be a folder under fixtures/ (got ${describe(positive)}).`;
  }
  if (!isFixturePath(negative)) {
    return `${file}: fixtures.negative must be a folder under fixtures/ (got ${describe(negative)}).`;
  }

  return {
    id,
    title,
    applies: { tool, ...(introducedIn === undefined ? {} : { introducedIn }) },
    severity,
    detector,
    message,
    ...(fix === undefined ? {} : { fix }),
    sourceUrl,
    fixtures: { positive, negative },
  };
}

/**
 * The URL API, no regex: https, no credentials, no port, hostname exactly an official host. It must
 * already be canonical (`href` unchanged), because the parser silently strips whitespace, drops
 * an explicit :443 and lowercases the host, which would otherwise hide a bad value.
 */
function isOfficialSource(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.href === value &&
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    OFFICIAL_HOSTS.includes(url.hostname)
  );
}

/** Under the top-level fixtures/ folder (CLAUDE.md, Quality bar), forward slashes, no `.`/`..`. */
function isFixturePath(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("\\")) return false;
  const segments = value.split("/");
  return (
    segments[0] === "fixtures" &&
    segments.length > 1 &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function unknownField(
  value: Record<string, unknown>,
  fields: Record<string, boolean>,
  prefix: string,
): string | undefined {
  const key = Object.keys(value)
    .sort(byText)
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

/** A Node file-system error code such as "EACCES", without the message (it holds absolute paths). */
function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "unknown error";
}

function firstLine(text: string): string {
  return (text.split("\n")[0] ?? text).replace(/:$/, "");
}

function quotedList(values: string[]): string {
  return listOf(values.map((value) => JSON.stringify(value)));
}
