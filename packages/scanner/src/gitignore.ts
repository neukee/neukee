/**
 * .gitignore parsing and matching (ADR-015). Scanned repositories are hostile, so this never
 * builds a regular expression from rule text: rules are parsed once into tokens and matched on
 * bytes, and every call is paid from the scan's budget of matching work, at most a fixed
 * share per path. Past it the answer is "too-costly" and the caller keeps the path in the scan
 * (fail open). Semantics follow git's own
 * matcher (wildmatch), checked against a table generated from real git
 * (fixtures/gitignore/cases.json). Deliberate differences are listed in ADR-015.
 */

/** Real rules are short; a longer line is dropped with a problem (ADR-015). */
export const MAX_RULE_BYTES = 1024;

/**
 * Matching work allowed for one path: name bytes compared plus path positions tried (ADR-015).
 * 2,000 `*.ext` rules against a 255-byte name, the costliest realistic case, need about half.
 */
const MAX_MATCH_STEPS = 1_000_000;

/**
 * Matching work allowed for a whole scan (ADR-015, T-005c): at most about 2.3 s on a development
 * Mac for every tested shape, so under 10 s on slower CI machines. Once it is spent, the caller
 * applies no more .gitignore rules (fail open).
 */
export const MAX_SCAN_MATCH_STEPS = 200_000_000;

/**
 * Parsing a .gitignore is paid from the scan's budget at this many steps per byte. That covers
 * the costliest shape measured (about 250 ns per `/` in long segment runs), so many hostile
 * .gitignore files can't add unbounded time.
 */
export const PARSE_STEPS_PER_BYTE = 48;

/** Allocating a DP row costs about as much as this many byte comparisons (measured). */
const ALLOCATION_STEPS = 8;

/** A scan's remaining matching work, shared by every `isIgnored` call in that scan. */
export interface MatchBudget {
  steps: number;
}

type Token =
  | { kind: "byte"; value: number }
  | { kind: "any" }
  | { kind: "star" }
  /** `members`: a 256-bit set, one bit per byte value. */
  | { kind: "class"; negated: boolean; members: Uint8Array };

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
  /** Fewest path segments an anchored rule can match; with no `**`, the only count it can match. */
  minDepth: number;
  hasGlobstar: boolean;
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

/** "too-costly": the budget ran out before a rule decided; the caller keeps the path (fail open). */
export type IgnoreDecision = "ignored" | "included" | "too-costly";

const encoder = new TextEncoder();

// Tokens are shared, so a long rule costs one pointer per byte rather than one object.
const BYTE_TOKENS: Token[] = Array.from({ length: 256 }, (_, value) => ({ kind: "byte", value }));
const ANY: Token = { kind: "any" };
const STAR: Token = { kind: "star" };

/** Parses one .gitignore. Lines the scanner can't use become problems; the rest still apply. */
export function parseIgnoreFile(text: string): { rules: IgnoreRule[]; problems: IgnoreProblem[] } {
  const rules: IgnoreRule[] = [];
  const problems: IgnoreProblem[] = [];
  // Git skips a UTF-8 byte order mark and splits on \n only, dropping one trailing \r.
  const lines = (text.startsWith("\uFEFF") ? text.slice(1) : text).split("\n");
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
  let minDepth = 0;
  const parts = anchored ? splitSegments(pattern) : [{ text: pattern, escapedSlashAfter: false }];
  for (const [index, { text, escapedSlashAfter }] of parts.entries()) {
    // A whole segment of two or more stars is a globstar; inside a name (a**b) it's a plain *.
    if (anchored && text.length >= 2 && [...text].every((char) => char === "*")) {
      // Git lets ** match zero folders only when a plain `/` follows it, so a trailing ** or one
      // before an escaped `\/` needs at least one. A run of them adds up: a/**/**\/b needs one.
      const min = index === parts.length - 1 || escapedSlashAfter ? 1 : 0;
      minDepth += min;
      const previous = segments.at(-1);
      if (previous?.kind === "globstar") previous.min += min;
      else segments.push({ kind: "globstar", min });
      continue;
    }
    const tokens = tokenize(encoder.encode(text));
    if (typeof tokens === "string") return tokens;
    segments.push({ kind: "name", tokens });
    minDepth++;
  }
  const hasGlobstar = segments.some((segment) => segment.kind === "globstar");
  return { negated, directoryOnly, anchored, segments, minDepth, hasGlobstar };
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
const STAR_BYTE = 0x2a;
const QUESTION = 0x3f;
const OPEN = 0x5b;
const CLOSE = 0x5d;
const DASH = 0x2d;
const BANG = 0x21;
const CARET = 0x5e;
const COLON = 0x3a;

/** One segment's tokens, or the reason the rule is dropped. */
function tokenize(bytes: Uint8Array): Token[] | string {
  const tokens: Token[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    if (byte === BACKSLASH) {
      i++;
      if (i >= bytes.length) return "ends with a backslash and never matches";
      tokens.push(byteToken(bytes[i] ?? 0));
    } else if (byte === QUESTION) {
      tokens.push(ANY);
    } else if (byte === STAR_BYTE) {
      if (tokens.at(-1) !== STAR) tokens.push(STAR); // ** inside a name is *
    } else if (byte === OPEN) {
      const parsed = parseClass(bytes, i);
      if (typeof parsed === "string") return parsed;
      tokens.push(parsed.token);
      i = parsed.end;
    } else {
      tokens.push(byteToken(byte));
    }
  }
  return tokens;
}

function byteToken(value: number): Token {
  return BYTE_TOKENS[value] ?? { kind: "byte", value };
}

/**
 * A bracket expression starting at `start`, as wildmatch reads it: every member matches itself,
 * `x-y` also matches the range (so a reversed range still matches its first byte), a leading `]`
 * is a member, and a trailing `-` is literal. A class must close within its segment: git also
 * accepts a `/` inside one (`a[!/]b`), which the scanner drops instead (ADR-015).
 */
function parseClass(bytes: Uint8Array, start: number): { token: Token; end: number } | string {
  const unclosed = "has a [ that isn't closed before the next / or the end";
  let i = start + 1;
  const negated = bytes[i] === BANG || bytes[i] === CARET;
  if (negated) i++;
  const members = new Uint8Array(32);
  const add = (low: number, high: number): void => {
    for (let byte = low; byte <= high; byte++) {
      members[byte >> 3] = (members[byte >> 3] ?? 0) | (1 << (byte & 7));
    }
  };
  let previous = -1;
  for (let first = true; ; first = false, i++) {
    if (i >= bytes.length) return unclosed;
    let byte = bytes[i] ?? 0;
    if (byte === CLOSE && !first) return { token: { kind: "class", negated, members }, end: i };
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
      add(previous, end);
      previous = -1;
      continue;
    } else if (byte === OPEN && bytes[i + 1] === COLON) {
      return "uses [: inside a class, which isn't supported (POSIX classes such as [:digit:])";
    }
    add(byte, byte);
    previous = byte;
  }
}

/**
 * Whether `path` (repo-relative, forward slashes) is ignored by the rules, which come parent
 * folders first, each folder's rules in file order. The last matching rule decides, so rules are
 * tried from the end and the first match wins. The caller stops descending into an ignored
 * folder, as git does, so nothing below it can be re-included. The work is paid from `scan`, at
 * most MAX_MATCH_STEPS for this path; "too-costly" means this path's share ran out.
 */
export function isIgnored(
  path: string,
  isDirectory: boolean,
  rules: readonly ScopedRule[],
  scan: MatchBudget,
): IgnoreDecision {
  if (rules.length === 0) return "included";
  const budget = { steps: Math.min(MAX_MATCH_STEPS, scan.steps) };
  const before = budget.steps;
  const decision = decide(path, isDirectory, rules, budget);
  scan.steps -= before - budget.steps;
  // An answer that spent the scan's last steps is not trusted: the caller keeps the path.
  return scan.steps <= 0 ? "too-costly" : decision;
}

function decide(
  path: string,
  isDirectory: boolean,
  rules: readonly ScopedRule[],
  budget: { steps: number },
): IgnoreDecision {
  const names = path.split("/").map((part) => encoder.encode(part));
  // Reading the path, resolving a base and trying a rule are work too, charged at about their
  // real cost (measured: a path segment costs about as much as 16 byte comparisons, a rule about
  // 4), so no call is free.
  const pathCost = path.length + 16 * names.length;
  budget.steps -= pathCost;
  // Rules from one .gitignore are adjacent and share a base, so each base is resolved once.
  let lastBase: string | undefined;
  let below: Uint8Array[] | undefined;
  for (let k = rules.length - 1; k >= 0; k--) {
    const scoped = rules[k];
    if (scoped === undefined) continue;
    const { base, rule } = scoped;
    if (base !== lastBase) {
      lastBase = base;
      budget.steps -= pathCost;
      if (base === "") below = names;
      else below = path.startsWith(`${base}/`) ? names.slice(base.split("/").length) : undefined;
    }
    if (below === undefined) continue;
    budget.steps -= 4;
    const matched = matches(rule, below, isDirectory, budget);
    if (budget.steps < 0) return "too-costly";
    if (matched) return rule.negated ? "included" : "ignored";
  }
  return "included";
}

function matches(
  rule: IgnoreRule,
  path: Uint8Array[],
  isDirectory: boolean,
  budget: { steps: number },
): boolean {
  if (rule.directoryOnly && !isDirectory) return false;
  if (!rule.anchored) {
    const name = path.at(-1);
    const segment = rule.segments[0];
    return (
      name !== undefined && segment?.kind === "name" && matchSegment(segment.tokens, name, budget)
    );
  }
  if (path.length < rule.minDepth || (!rule.hasGlobstar && path.length !== rule.minDepth)) {
    return false;
  }
  // reach[j]: the rule's segments so far can match the first j path segments.
  budget.steps -= ALLOCATION_STEPS;
  let reach = new Uint8Array(path.length + 1);
  reach[0] = 1;
  for (const segment of rule.segments) {
    budget.steps -= ALLOCATION_STEPS;
    const next = new Uint8Array(path.length + 1);
    let alive = false;
    let reachedBefore = false;
    for (let j = 0; j <= path.length; j++) {
      budget.steps--;
      if (segment.kind === "globstar") {
        // `min` or more segments: true from the first j with some reach[i], i <= j - min.
        reachedBefore ||= reach[j - segment.min] === 1;
        next[j] = reachedBefore ? 1 : 0;
      } else {
        const name = path[j - 1];
        const hit =
          reach[j - 1] === 1 && name !== undefined && matchSegment(segment.tokens, name, budget);
        next[j] = hit ? 1 : 0;
      }
      alive ||= next[j] === 1;
    }
    if (!alive || budget.steps < 0) return false;
    reach = next;
  }
  return reach[path.length] === 1;
}

/** Glob match within one segment; backtracks only to the last `*`, each step paid from `budget`. */
function matchSegment(tokens: Token[], name: Uint8Array, budget: { steps: number }): boolean {
  let t = 0;
  let n = 0;
  let starToken = -1;
  let starName = 0;
  while (n < name.length) {
    if (--budget.steps < 0) return false;
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

function matchesByte(token: Token, byte: number): boolean {
  switch (token.kind) {
    case "byte":
      return token.value === byte;
    case "any":
      return true;
    case "star":
      return false;
    case "class":
      return ((((token.members[byte >> 3] ?? 0) >> (byte & 7)) & 1) === 1) !== token.negated;
  }
}
