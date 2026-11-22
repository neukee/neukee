import type { Dirent } from "node:fs";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { type Diagnostic, repoPathPattern } from "@neukee/core";

const MAX_FILE_BYTES = 1024 * 1024;
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "dist", "build", "coverage"]);
const repoPath = new RegExp(repoPathPattern(), "u");
const noFollow = constants.O_NOFOLLOW;
const hasNoFollow = typeof noFollow === "number" && noFollow !== 0;
const openFlags =
  constants.O_RDONLY |
  (hasNoFollow ? noFollow : 0) |
  (typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0);

interface DiscoveredFile {
  path: string;
  content: string;
}

export type DiscoveryEvent =
  | { type: "file"; file: DiscoveredFile }
  | { type: "skipped" }
  | { type: "diagnostic"; diagnostic: Diagnostic };

interface IgnoreRule {
  base: string;
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function parseIgnoreRules(contents: string, basePath: string): IgnoreRule[] {
  const text = contents.startsWith("\uFEFF") ? contents.slice(1) : contents;
  const rules: IgnoreRule[] = [];

  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    let end = rawLine.length;
    while (end > 0 && rawLine[end - 1] === " ") {
      let backslashes = 0;
      for (let index = end - 2; index >= 0 && rawLine[index] === "\\"; index--) backslashes++;
      if (backslashes % 2 === 1) break;
      end--;
    }
    let pattern = rawLine.slice(0, end);
    if (pattern === "") continue;

    let negated = false;
    if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
      pattern = pattern.slice(1);
    } else if (pattern.startsWith("#")) {
      continue;
    } else if (pattern.startsWith("!")) {
      negated = true;
      pattern = pattern.slice(1);
    }

    const anchored = pattern.startsWith("/");
    if (anchored) pattern = pattern.replace(/^\/+/, "");
    const directoryOnly = pattern.endsWith("/");
    if (directoryOnly) pattern = pattern.slice(0, -1);
    pattern = pattern.replace(/\/+/g, "/");
    if (pattern === "") continue;

    rules.push({ base: basePath, pattern, negated, directoryOnly, anchored });
  }
  return rules;
}

function classMatch(
  pattern: string,
  start: number,
  value: string,
): { end: number; matches: boolean } | undefined {
  const end = pattern.indexOf("]", start + 1);
  if (end < 0) return undefined;
  let index = start + 1;
  const negated = pattern[index] === "!" || pattern[index] === "^";
  if (negated) index++;
  let matched = false;

  while (index < end) {
    const first = pattern[index] ?? "";
    if (pattern[index + 1] === "-" && index + 2 < end) {
      const last = pattern[index + 2] ?? "";
      if (first <= value && value <= last) matched = true;
      index += 3;
    } else if (first === value) {
      matched = true;
      index++;
    } else {
      index++;
    }
  }
  return { end, matches: negated ? !matched : matched };
}

function matchesSegment(pattern: string, value: string): boolean {
  let patternIndex = 0;
  let valueIndex = 0;
  let starPattern = -1;
  let starValue = -1;

  while (valueIndex < value.length) {
    const character = pattern[patternIndex];
    if (character === "*") {
      starPattern = patternIndex + 1;
      while (pattern[starPattern] === "*") starPattern++;
      starValue = valueIndex;
      patternIndex = starPattern;
      continue;
    }
    if (character === "?") {
      patternIndex++;
      valueIndex++;
      continue;
    }
    if (character === "[") {
      const result = classMatch(pattern, patternIndex, value[valueIndex] ?? "");
      if (result !== undefined) {
        if (result.matches) {
          patternIndex = result.end + 1;
          valueIndex++;
          continue;
        }
        if (starPattern >= 0 && starValue < value.length) {
          starValue++;
          valueIndex = starValue;
          patternIndex = starPattern;
          continue;
        }
        return false;
      }
    }

    const escaped = character === "\\" ? pattern[patternIndex + 1] : undefined;
    const literal = escaped ?? character;
    if (literal !== undefined && literal === value[valueIndex]) {
      patternIndex += escaped === undefined ? 1 : 2;
      valueIndex++;
      continue;
    }
    if (starPattern >= 0 && starValue < value.length) {
      starValue++;
      valueIndex = starValue;
      patternIndex = starPattern;
      continue;
    }
    return false;
  }

  while (pattern[patternIndex] === "*") patternIndex++;
  return patternIndex === pattern.length;
}

function matchesPathPattern(pattern: string, candidate: string): boolean {
  const patternSegments = pattern.split("/");
  const pathSegments = candidate.split("/");
  let previous = new Uint8Array(pathSegments.length + 1);
  previous[0] = 1;

  for (const segment of patternSegments) {
    const next = new Uint8Array(pathSegments.length + 1);
    if (segment === "**") {
      next[0] = previous[0] ?? 0;
      for (let index = 1; index <= pathSegments.length; index++) {
        next[index] = previous[index] === 1 || next[index - 1] === 1 ? 1 : 0;
      }
    } else {
      for (let index = 1; index <= pathSegments.length; index++) {
        if (previous[index - 1] === 1 && matchesSegment(segment, pathSegments[index - 1] ?? "")) {
          next[index] = 1;
        }
      }
    }
    previous = next;
  }
  return previous[pathSegments.length] === 1;
}

function matchesRule(path: string, isDirectory: boolean, rule: IgnoreRule): boolean {
  if (rule.directoryOnly && !isDirectory) return false;
  const prefix = rule.base === "" ? "" : `${rule.base}/`;
  if (!path.startsWith(prefix) || path === rule.base) return false;
  const candidate = path.slice(prefix.length);
  if (rule.pattern.includes("/")) {
    const basePattern = rule.pattern.replace(/(?:\/\*\*)+$/, "");
    if (basePattern !== rule.pattern && matchesPathPattern(basePattern, candidate)) return false;
    return matchesPathPattern(rule.pattern, candidate);
  }
  const segments = candidate.split("/");
  if (rule.anchored) return matchesSegment(rule.pattern, segments[0] ?? "");
  return segments.some((segment) => matchesSegment(rule.pattern, segment));
}

function isIgnored(path: string, isDirectory: boolean, rules: readonly IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesRule(path, isDirectory, rule)) ignored = !rule.negated;
  }
  return ignored;
}

function* readFileOnce(
  root: string,
  absolutePath: string,
  path: string,
): Generator<DiscoveryEvent, DiscoveredFile | undefined> {
  let descriptor: number | undefined;
  let file: DiscoveredFile | undefined;
  let skipped = false;
  let failed = false;

  try {
    if (!hasNoFollow) {
      const metadata = lstatSync(absolutePath);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        skipped = true;
      } else if (!isWithin(root, realpathSync(absolutePath))) {
        skipped = true;
      }
    }

    if (!skipped) {
      descriptor = openSync(absolutePath, openFlags);
      const metadata = fstatSync(descriptor);
      if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
        skipped = true;
      } else if (hasNoFollow && !isWithin(root, realpathSync(absolutePath))) {
        skipped = true;
      } else {
        const size = Math.min(metadata.size, MAX_FILE_BYTES);
        const buffer = Buffer.alloc(size);
        let bytesRead = 0;
        while (bytesRead < size) {
          const count = readSync(descriptor, buffer, bytesRead, size - bytesRead, bytesRead);
          if (count === 0) break;
          bytesRead += count;
        }
        file = { path, content: buffer.subarray(0, bytesRead).toString("utf8") };
      }
    }
  } catch {
    failed = true;
  }

  if (descriptor !== undefined) {
    try {
      closeSync(descriptor);
    } catch {
      failed = true;
    }
  }

  if (failed) {
    yield { type: "skipped" };
    yield {
      type: "diagnostic",
      diagnostic: { level: "warning", message: "Could not read file.", file: path },
    };
    return undefined;
  }
  if (skipped) {
    yield { type: "skipped" };
    return undefined;
  }
  return file;
}

function* walk(
  root: string,
  absoluteDirectory: string,
  relativeDirectory: string,
  inheritedRules: readonly IgnoreRule[],
): Generator<DiscoveryEvent> {
  let entries: Dirent[];
  try {
    entries = readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  } catch {
    yield {
      type: "diagnostic",
      diagnostic:
        relativeDirectory === ""
          ? { level: "error", message: "Could not read scan root." }
          : { level: "warning", message: "Could not read directory.", file: relativeDirectory },
    };
    return;
  }

  const ignoreEntry = entries.find((entry) => entry.name === ".gitignore" && entry.isFile());
  let ignoreFilePath: string | undefined;
  let ignoreFile: DiscoveredFile | undefined;
  const ignoreFileProcessed = ignoreEntry !== undefined;
  if (ignoreEntry !== undefined) {
    ignoreFilePath = relativeDirectory === "" ? ".gitignore" : `${relativeDirectory}/.gitignore`;
    if (!repoPath.test(ignoreFilePath)) {
      yield { type: "skipped" };
      yield {
        type: "diagnostic",
        diagnostic: { level: "warning", message: "Skipped a path invalid for report output." },
      };
    } else {
      ignoreFile = yield* readFileOnce(
        root,
        join(absoluteDirectory, ignoreEntry.name),
        ignoreFilePath,
      );
    }
  }

  const rules =
    ignoreFile === undefined
      ? inheritedRules
      : [...inheritedRules, ...parseIgnoreRules(ignoreFile.content, relativeDirectory)];
  if (
    ignoreFile !== undefined &&
    ignoreFilePath !== undefined &&
    !isIgnored(ignoreFilePath, false, rules)
  ) {
    yield { type: "file", file: ignoreFile };
  }

  for (const entry of entries) {
    if (ignoreFileProcessed && entry.name === ".gitignore") continue;
    const absolutePath = join(absoluteDirectory, entry.name);
    const path = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (!repoPath.test(path)) {
      yield { type: "skipped" };
      yield {
        type: "diagnostic",
        diagnostic: { level: "warning", message: "Skipped a path invalid for report output." },
      };
      continue;
    }
    if (entry.name === ".git" || (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name))) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      yield { type: "skipped" };
      continue;
    }
    if (entry.isDirectory()) {
      if (!isIgnored(path, true, rules)) yield* walk(root, absolutePath, path, rules);
      continue;
    }
    if (entry.isFile()) {
      if (isIgnored(path, false, rules)) continue;
      const file = yield* readFileOnce(root, absolutePath, path);
      if (file !== undefined) yield { type: "file", file };
      continue;
    }
    yield { type: "skipped" };
  }
}

/** Walks a repo and yields bounded file contents one at a time for the detector pipeline. */
export function discoverFiles(root: string): Generator<DiscoveryEvent> {
  const canonicalRoot = realpathSync(root);
  return walk(canonicalRoot, canonicalRoot, "", []);
}
