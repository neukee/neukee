import type { Diagnostic, Location } from "@neukee/core";

/**
 * Runtime sources (T-010, docs/SPEC-SCANNER.md §2.1): every place a repository declares which
 * Node.js version runs it. Each reader turns one file into declarations, each with its exact
 * location, and never throws: anything it can't read becomes a diagnostic that doesn't echo the
 * file's content (scanned files are hostile, ARCHITECTURE §7). T-014 turns declarations into
 * findings; later sources (Dockerfiles in T-011, GitHub Actions in T-012) add readers here.
 */

/** A declared Node.js version, normalized: `v22` → `22`, ranges kept as written. */
type DeclaredVersion =
  /** A full or partial version: "22", "22.11", "22.11.0" (no leading `v`). */
  | { kind: "version"; version: string }
  /** A semver range as written, such as ">=20 <23" (engines.node, or a volta.node range). */
  | { kind: "range"; range: string }
  /** The newest release of one LTS line, by codename ("iron"); T-014 maps it to a major. */
  | { kind: "lts"; codename: string }
  /** No fixed version: "lts/*", "node", "stable" and the other nvm aliases. */
  | { kind: "unpinned"; alias: string };

export interface NodeVersionDeclaration {
  source: "nvmrc" | "node-version" | "engines" | "volta";
  location: Required<Location>;
  version: DeclaredVersion;
}

export interface RuntimeSources {
  declarations: NodeVersionDeclaration[];
  diagnostics: Diagnostic[];
}

/** Reads the Node.js versions one file declares, if it is a runtime source. */
export function readRuntimeSources(file: { path: string; content: string }): RuntimeSources {
  switch (file.path.split("/").at(-1)) {
    case ".nvmrc":
      return readVersionFile(file, "nvmrc");
    case ".node-version":
      return readVersionFile(file, "node-version");
    case "package.json":
      return readPackageJson(file);
    default:
      return { declarations: [], diagnostics: [] };
  }
}

// One to three numeric parts, no leading zeros, an optional leading `v`. Linear: no nesting.
const VERSION = /^v?((?:0|[1-9]\d{0,8})(?:\.(?:0|[1-9]\d{0,8})){0,2})$/;
// nvm's aliases; codenames are lowercase in nvm's README (`lts/argon`, `lts/jod`).
const UNPINNED = new Set(["lts/*", "node", "stable", "current", "unstable", "iojs", "system"]);
const LTS_LINE = /^lts\/([a-z]{1,32})$/;
// One semver comparator token: an optional operator, then a version whose parts may be x, X
// or *, with an optional prerelease and build. Letters appear only as x, X, v, or after `-` or
// `+`, so free text and markup are not ranges. Linear: no nested quantifiers that overlap.
const COMPARATOR =
  /^(?:[<>]=?|=|~|\^)?v?(?:\d{1,9}|[xX*])(?:\.(?:\d{1,9}|[xX*])){0,2}(?:-[0-9A-Za-z.-]{1,64})?(?:\+[0-9A-Za-z.-]{1,64})?$/;
const OPERATOR = /^(?:[<>]=?|=|~|\^)$/;

/**
 * Whether `text` is a semver range (npm's grammar): comparator sets joined by `||`, each a list
 * of comparators, `a - b` hyphen ranges, or an operator separated from its version by a space.
 * Empty means any version, as npm documents for engines.
 */
function isRange(text: string): boolean {
  if (text.length > 256) return false;
  for (const set of text.split("||")) {
    const tokens = set
      .trim()
      .split(/[ \t]+/)
      .filter((token) => token !== "");
    for (const [i, token] of tokens.entries()) {
      if (COMPARATOR.test(token)) continue;
      if (token === "-" && i > 0 && i < tokens.length - 1) continue; // hyphen range
      if (OPERATOR.test(token) && i < tokens.length - 1) continue; // ">= 20"
      return false;
    }
  }
  return true;
}

/** A control character other than tab makes a .nvmrc invalid (nvm's README). */
function hasControlCharacter(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

function toVersion(token: string): DeclaredVersion | undefined {
  const exact = VERSION.exec(token)?.[1];
  if (exact !== undefined) return { kind: "version", version: exact };
  if (UNPINNED.has(token)) return { kind: "unpinned", alias: token };
  const codename = LTS_LINE.exec(token)?.[1];
  if (codename !== undefined) return { kind: "lts", codename };
  return undefined;
}

/**
 * `.nvmrc` (nvm's README): exactly one version line; `#` starts a comment; blank lines, white
 * space and key=value lines are ignored. `.node-version` has no standard and comments aren't
 * widely supported, so there `#` is kept and the one non-blank line must be the version.
 */
function readVersionFile(
  file: { path: string; content: string },
  source: "nvmrc" | "node-version",
): RuntimeSources {
  const name = `.${source}`;
  const fail = (reason: string): RuntimeSources => ({
    declarations: [],
    diagnostics: [
      {
        level: "warning",
        message: `This ${name} ${reason}, so its Node.js version wasn't read.`,
        file: file.path,
      },
    ],
  });
  const text = file.content.startsWith("\uFEFF") ? file.content.slice(1) : file.content;
  const found: { line: number; column: number; token: string }[] = [];
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (source === "nvmrc" && hasControlCharacter(line)) {
      return fail("contains a control character; nvm rejects the file");
    }
    const body = source === "nvmrc" ? (line.split("#")[0] ?? "") : line;
    // Only spaces and tabs are white space here (nvm's); index loops keep long runs linear.
    let start = 0;
    let end = body.length;
    while (start < end && (body[start] === " " || body[start] === "\t")) start++;
    while (end > start && (body[end - 1] === " " || body[end - 1] === "\t")) end--;
    const token = body.slice(start, end);
    if (token === "" || (source === "nvmrc" && token.includes("="))) continue;
    found.push({ line: index + 1, column: start + 1, token });
  }
  const [only, ...rest] = found;
  if (only === undefined) return fail("has no version line");
  if (rest.length > 0) {
    return fail(
      source === "nvmrc"
        ? "has more than one version line; nvm needs exactly one"
        : "has more than one non-blank line",
    );
  }
  const version = toVersion(only.token);
  if (version === undefined) return fail("isn't a version the scanner understands");
  return {
    declarations: [
      {
        source,
        location: { file: file.path, line: only.line, column: only.column },
        version,
      },
    ],
    diagnostics: [],
  };
}

/** `engines.node` is a semver range (npm docs); `volta.node` is usually an exact version. */
function readPackageJson(file: { path: string; content: string }): RuntimeSources {
  const result: RuntimeSources = { declarations: [], diagnostics: [] };
  const problem = (reason: string): Diagnostic => ({
    level: "warning",
    message: `This package.json ${reason}, so its Node.js version wasn't read.`,
    file: file.path,
  });
  const text = file.content.startsWith("\uFEFF") ? file.content.slice(1) : file.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { declarations: [], diagnostics: [problem("isn't valid JSON")] };
  }
  for (const source of ["engines", "volta"] as const) {
    const value = nodeField(parsed, source);
    if (value === undefined) continue;
    const field = source === "engines" ? "an engines.node" : "a volta.node";
    // One bad field never costs a good one: report it and read the next.
    if (typeof value !== "string") {
      result.diagnostics.push(problem(`has ${field} that isn't a string`));
      continue;
    }
    const raw = value.trim();
    const exact = source === "volta" ? VERSION.exec(raw)?.[1] : undefined;
    if (exact === undefined && !isRange(raw)) {
      result.diagnostics.push(
        problem(`has ${field} that isn't a version range the scanner understands`),
      );
      continue;
    }
    const offset = locate(text, source, "node");
    if (offset === undefined) continue; // unreachable for valid JSON; never guess a location
    result.declarations.push({
      source,
      // The version text itself, just inside the opening quote, as for version files.
      location: { file: file.path, ...lineAndColumn(text, offset + 1) },
      version:
        exact === undefined ? { kind: "range", range: raw } : { kind: "version", version: exact },
    });
  }
  return result;
}

/** `parsed[outer].node`, if `parsed` and `parsed[outer]` are plain objects. */
function nodeField(parsed: unknown, outer: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const section: unknown = Object.getOwnPropertyDescriptor(parsed, outer)?.value;
  if (typeof section !== "object" || section === null || Array.isArray(section)) return undefined;
  return Object.getOwnPropertyDescriptor(section, "node")?.value;
}

/**
 * The offset of `text[outer][inner]`'s value in JSON that JSON.parse has already accepted. Like
 * JSON.parse, the last of duplicate keys wins. Values are skipped without recursion, so deep
 * nesting can't overflow the stack.
 */
function locate(text: string, outer: string, inner: string): number | undefined {
  let found: number | undefined;
  for (const member of objectMembers(text, skipSpace(text, 0))) {
    if (member.key !== outer) continue;
    found = undefined;
    if (text[member.value] !== "{") continue;
    for (const nested of objectMembers(text, member.value)) {
      if (nested.key === inner) found = nested.value;
    }
  }
  return found;
}

/** Each member of the object opening at `open`: its decoded key and where its value starts. */
function* objectMembers(text: string, open: number): Generator<{ key: string; value: number }> {
  if (text[open] !== "{") return;
  let i = skipSpace(text, open + 1);
  while (text[i] === '"') {
    const end = stringEnd(text, i);
    const key: unknown = JSON.parse(text.slice(i, end));
    i = skipSpace(text, end) + 1; // past ':'
    const value = skipSpace(text, i);
    if (typeof key === "string") yield { key, value };
    i = skipSpace(text, valueEnd(text, value));
    if (text[i] === ",") i = skipSpace(text, i + 1);
  }
}

function skipSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length && " \t\n\r".includes(text.charAt(i))) i++;
  return i;
}

function stringEnd(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** The end of the value starting at `start`: a string, a nested object or array, or a literal. */
function valueEnd(text: string, start: number): number {
  const first = text[start];
  if (first === '"') return stringEnd(text, start);
  if (first !== "{" && first !== "[") {
    let i = start;
    while (i < text.length && !",}] \t\n\r".includes(text.charAt(i))) i++;
    return i;
  }
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      i = stringEnd(text, i);
      continue;
    }
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    i++;
    if (depth === 0) return i;
  }
  return i;
}

/** 1-based line and column (UTF-16 code units, ARCHITECTURE §5) of an offset. */
function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}
