/**
 * .gitignore parsing and matching (ADR-015). Scanned repositories are hostile, so this never
 * builds a regular expression from rule text: rules are parsed once into tokens, matching walks
 * bytes with no backtracking beyond the last `*`, and repeated `**` segments collapse at parse
 * time. Semantics follow git's own matcher (wildmatch), checked against a table generated from
 * real git (fixtures/gitignore/cases.json). Deliberate differences: POSIX classes such as
 * `[[:digit:]]` aren't supported (the rule is dropped, so files stay in the scan), and matching
 * is case-sensitive.
 */

/** Real rules are short; a longer line is dropped with a problem (ADR-015). */
export const MAX_RULE_BYTES = 1024;

type Token =
  | { kind: "byte"; value: number }
  | { kind: "any" }
  | { kind: "star" }
  /** `ranges`: sorted, merged [low, high] pairs, flattened; searched by bisection. */
  | { kind: "class"; negated: boolean; ranges: number[] };

/** One path segment of a rule: a name's tokens, or a run of `**` matching `min` or more segments. */
type Segment = { kind: "name"; tokens: Token[] } | { kind: "globstar"; min: number };

export interface IgnoreRule {
  negated: boolean;
  /** Ends in `/`: matches folders only. */
  directoryOnly: boolean;
  /**
   * Contains a `/` before the end: matched against the whole path below the .gitignore's folder.
   * Otherwise matched against the last segment, at any depth.
   */
  anchored: boolean;
  segments: Segment[];
}

export interface IgnoreProblem {
  /** 1-based line in the .gitignore. */
  line: number;
  reason: string;
}

/** A rule and the repo-relative folder of the .gitignore it came from ("" for the root). */
export interface ScopedRule {
  base: string;
  rule: IgnoreRule;
}

const encoder = new TextEncoder();

/** Parses one .gitignore. Lines the scanner can't use become problems; the rest still apply. */
export function parseIgnoreFile(text: string): { rules: IgnoreRule[]; problems: IgnoreProblem[] } {
  const rules: IgnoreRule[] = [];
  const problems: IgnoreProblem[] = [];
  // Git skips a UTF-8 byte order mark and splits on \n only, dropping one trailing \r.
  const lines = text.replace(/^﻿/, "").split("\n");
  lines.forEach((raw, index) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line === "" || line.startsWith("#")) return;
    if (encoder.encode(line).length > MAX_RULE_BYTES) {
      problems.push({ line: index + 1, reason: `is longer than ${MAX_RULE_BYTES} bytes` });
      return;
    }
    const result = parseRule(trimTrailingSpaces(line));
    if (typeof result === "string") problems.push({ line: index + 1, reason: result });
    else if (result !== undefined) rules.push(result);
  });
  return { rules, problems };
}

/** Git's trim_trailing_spaces: drop unescaped trailing spaces. */
function trimTrailingSpaces(line: string): string {
  let lastSpace = -1;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === " ") {
      if (lastSpace < 0) lastSpace = i;
    } else if (char === "\\") {
      i++;
      if (i >= line.length) return line;
      lastSpace = -1;
    } else {
      lastSpace = -1;
    }
  }
  return lastSpace < 0 ? line : line.slice(0, lastSpace);
}

/** The rule, a problem reason, or undefined for a line that is no rule at all. */
function parseRule(line: string): IgnoreRule | string | undefined {
  let pattern = line;
  const negated = pattern.startsWith("!");
  if (negated) pattern = pattern.slice(1);
  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) pattern = pattern.slice(0, -1);
  if (pattern === "") return undefined;
  const anchored = pattern.includes("/");
  if (pattern.startsWith("/")) pattern = pattern.slice(1);

  const segments: Segment[] = [];
  const parts = anchored ? splitSegments(pattern) : [{ text: pattern, escapedSlashAfter: false }];
  for (const [index, { text, escapedSlashAfter }] of parts.entries()) {
    // A whole segment of two or more stars is a globstar; inside a name (a**b) it's a plain *.
    if (anchored && text.length >= 2 && [...text].every((char) => char === "*")) {
      // Git lets ** match zero folders only when a plain `/` follows it, so a trailing ** or one
      // before an escaped `\/` needs at least one. A run of them adds up: a/**/**\/b needs one.
      const min = index === parts.length - 1 || escapedSlashAfter ? 1 : 0;
      const previous = segments.at(-1);
      if (previous?.kind === "globstar") previous.min += min;
      else segments.push({ kind: "globstar", min });
      continue;
    }
    const tokens = tokenize(encoder.encode(text));
    if (typeof tokens === "string") return tokens;
    segments.push({ kind: "name", tokens });
  }
  return { negated, directoryOnly, anchored, segments };
}

/**
 * Splits on `/`. Git reads an escaped `\\/` as a separator too, but notes it: a `**` before it
 * can't match zero folders. Other escapes stay in the segment.
 */
function splitSegments(pattern: string): { text: string; escapedSlashAfter: boolean }[] {
  const parts: { text: string; escapedSlashAfter: boolean }[] = [];
  let current = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "/" || (char === "\\" && next === "/")) {
      parts.push({ text: current, escapedSlashAfter: char === "\\" });
      current = "";
      if (char === "\\") i++;
    } else if (char === "\\" && next !== undefined) {
      current += char + next;
      i++;
    } else {
      current += char;
    }
  }
  parts.push({ text: current, escapedSlashAfter: false });
  return parts;
}

const BACKSLASH = 0x5c;
const STAR = 0x2a;
const QUESTION = 0x3f;
const OPEN = 0x5b;
const CLOSE = 0x5d;
const DASH = 0x2d;
const BANG = 0x21;
const CARET = 0x5e;
const COLON = 0x3a;

/** One segment's tokens, or the reason the rule can never match. */
function tokenize(bytes: Uint8Array): Token[] | string {
  const tokens: Token[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    if (byte === BACKSLASH) {
      i++;
      if (i >= bytes.length) return "ends with a backslash and never matches";
      tokens.push({ kind: "byte", value: bytes[i] ?? 0 });
    } else if (byte === QUESTION) {
      tokens.push({ kind: "any" });
    } else if (byte === STAR) {
      if (tokens.at(-1)?.kind !== "star") tokens.push({ kind: "star" }); // ** inside a name is *
    } else if (byte === OPEN) {
      const parsed = parseClass(bytes, i);
      if (typeof parsed === "string") return parsed;
      tokens.push(parsed.token);
      i = parsed.end;
    } else {
      tokens.push({ kind: "byte", value: byte });
    }
  }
  return tokens;
}

/**
 * A bracket expression starting at `start`, as wildmatch reads it: every member matches itself,
 * `x-y` also matches the range (so a reversed range still matches its first byte), a leading `]`
 * is a member, and a trailing `-` is literal.
 */
function parseClass(bytes: Uint8Array, start: number): { token: Token; end: number } | string {
  const unclosed = "has an unclosed [ and never matches";
  let i = start + 1;
  const negated = bytes[i] === BANG || bytes[i] === CARET;
  if (negated) i++;
  const ranges: [number, number][] = [];
  let previous = -1;
  for (let first = true; ; first = false, i++) {
    if (i >= bytes.length) return unclosed;
    let byte = bytes[i] ?? 0;
    if (byte === CLOSE && !first) {
      return { token: { kind: "class", negated, ranges: mergeRanges(ranges) }, end: i };
    }
    if (byte === BACKSLASH) {
      i++;
      if (i >= bytes.length) return unclosed;
      byte = bytes[i] ?? 0;
    } else if (byte === DASH && previous >= 0 && i + 1 < bytes.length && bytes[i + 1] !== CLOSE) {
      i++;
      let end = bytes[i] ?? 0;
      if (end === BACKSLASH) {
        i++;
        if (i >= bytes.length) return unclosed;
        end = bytes[i] ?? 0;
      }
      ranges.push([previous, end]);
      previous = -1;
      continue;
    } else if (byte === OPEN && bytes[i + 1] === COLON) {
      return "uses a POSIX character class ([:name:]), which isn't supported";
    }
    ranges.push([byte, byte]);
    previous = byte;
  }
}

/**
 * Whether `path` (repo-relative, forward slashes) is ignored by the rules, which come parent
 * folders first, each folder's rules in file order. The last matching rule decides. The caller
 * stops descending into an ignored folder, as git does, so nothing below it can be re-included.
 */
export function isIgnored(
  path: string,
  isDirectory: boolean,
  rules: readonly ScopedRule[],
): boolean {
  const parts = path.split("/");
  const bytes = parts.map((part) => encoder.encode(part));
  let ignored = false;
  for (const { base, rule } of rules) {
    const baseParts = base === "" ? [] : base.split("/");
    if (baseParts.length >= parts.length || baseParts.some((part, i) => parts[i] !== part))
      continue;
    if (matches(rule, bytes.slice(baseParts.length), isDirectory)) ignored = !rule.negated;
  }
  return ignored;
}

function matches(rule: IgnoreRule, path: Uint8Array[], isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) return false;
  if (!rule.anchored) {
    const name = path.at(-1);
    const segment = rule.segments[0];
    return name !== undefined && segment?.kind === "name" && matchSegment(segment.tokens, name);
  }
  // reach[j]: the rule's segments so far can match the first j path segments.
  let reach = path.map(() => false).concat(false);
  reach[0] = true;
  for (const segment of rule.segments) {
    const next = path.map(() => false).concat(false);
    let reachedBefore = false;
    for (let j = 0; j <= path.length; j++) {
      if (segment.kind === "globstar") {
        // `min` or more segments: true from the first j with some reach[i], i <= j - min.
        reachedBefore ||= reach[j - segment.min] === true;
        next[j] = reachedBefore;
      } else {
        const name = path[j - 1];
        next[j] = reach[j - 1] === true && name !== undefined && matchSegment(segment.tokens, name);
      }
    }
    reach = next;
  }
  return reach[path.length] === true;
}

/** Glob match within one segment; backtracks only to the last `*`, so O(name × tokens). */
function matchSegment(tokens: Token[], name: Uint8Array): boolean {
  let t = 0;
  let n = 0;
  let starToken = -1;
  let starName = 0;
  while (n < name.length) {
    const token = tokens[t];
    if (token?.kind === "star") {
      starToken = t++;
      starName = n;
    } else if (token !== undefined && matchesByte(token, name[n] ?? 0)) {
      t++;
      n++;
    } else if (starToken >= 0) {
      t = starToken + 1;
      n = ++starName;
    } else {
      return false;
    }
  }
  while (tokens[t]?.kind === "star") t++;
  return t === tokens.length;
}

/** Sorts and merges ranges, dropping reversed ones (a reversed range matches nothing extra). */
function mergeRanges(ranges: [number, number][]): number[] {
  const merged: number[] = [];
  for (const [low, high] of ranges.filter(([l, h]) => l <= h).sort((x, y) => x[0] - y[0])) {
    const lastHigh = merged.at(-1);
    if (lastHigh !== undefined && low <= lastHigh + 1)
      merged[merged.length - 1] = Math.max(lastHigh, high);
    else merged.push(low, high);
  }
  return merged;
}

/** Bisection over flattened [low, high] pairs: at most 8 steps for 256 byte values. */
function inRanges(ranges: number[], byte: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const low = ranges[mid * 2] ?? 0;
    const high = ranges[mid * 2 + 1] ?? 0;
    if (byte < low) hi = mid - 1;
    else if (byte > high) lo = mid + 1;
    else return true;
  }
  return false;
}

function matchesByte(token: Token, byte: number): boolean {
  switch (token.kind) {
    case "byte":
      return token.value === byte;
    case "any":
      return true;
    case "star":
      return false;
    case "class":
      return inRanges(token.ranges, byte) !== token.negated;
  }
}
