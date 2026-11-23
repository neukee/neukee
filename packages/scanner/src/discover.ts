import {
  closeSync,
  constants,
  type Dirent,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { type Diagnostic, isRepoPath } from "@neukee/core";
import {
  isIgnored,
  MAX_SCAN_MATCH_STEPS,
  type MatchBudget,
  parseIgnoreFile,
  type ScopedRule,
} from "./gitignore.js";

/**
 * File discovery (T-005b). Scanned repositories are hostile (ARCHITECTURE §7): every file is read
 * through one checked handle, symlinks are never followed, and .gitignore input is capped
 * (ADR-015). Anything unusual is skipped and counted, with a diagnostic when it needs explaining.
 */

const MAX_FILE_BYTES = 1024 * 1024;
/** ADR-015 caps. Over a cap, a .gitignore's rules are skipped (fail open), never the scan. */
const MAX_IGNORE_FILE_BYTES = 64 * 1024;
const MAX_RULES_IN_FORCE = 2000;
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "dist", "build", "coverage"]);
const INVALID_PATH = "Skipped a path invalid for report output.";
const TOO_COSTLY =
  "Checking this path against .gitignore rules ran out of its work budget, so it was scanned.";
const OUT_OF_BUDGET =
  "The scan ran out of its .gitignore matching budget here, so this path and every later one were scanned without .gitignore rules.";

// O_NOFOLLOW makes open() refuse a symlink as the last path component. O_NONBLOCK keeps open()
// from hanging on a FIFO swapped in under a file's name; fstat then rejects it as not regular.
const noFollow = constants.O_NOFOLLOW;
const hasNoFollow = typeof noFollow === "number" && noFollow !== 0;
const OPEN_FLAGS =
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

type ReadResult =
  | { kind: "file"; content: string }
  | { kind: "too-large" }
  | { kind: "unsafe" }
  | { kind: "failed" };

/** Walks a repo and yields bounded file contents one at a time for the detector pipeline. */
export function discoverFiles(root: string): Generator<DiscoveryEvent> {
  const canonicalRoot = realpathSync(root);
  return walk(canonicalRoot, canonicalRoot, "", [], { steps: MAX_SCAN_MATCH_STEPS });
}

function* walk(
  root: string,
  absoluteDirectory: string,
  relativeDirectory: string,
  inheritedRules: readonly ScopedRule[],
  scan: MatchBudget,
): Generator<DiscoveryEvent> {
  const where = relativeDirectory === "" ? undefined : relativeDirectory;
  let entries: Dirent[];
  try {
    // Re-check right before reading: the folder may have been swapped for a link since its parent
    // was listed. Node has no openat/fdopendir, so this narrows the window rather than closing it.
    const metadata = lstatSync(absoluteDirectory);
    const resolved = realpathSync(absoluteDirectory);
    const safe =
      metadata.isDirectory() &&
      (where === undefined ? resolved === root : isWithin(root, resolved));
    if (!safe) {
      yield { type: "skipped" };
      yield warning("Skipped a directory that is not safely inside the scan root.", where);
      return;
    }
    // Code-unit order, never locale order, so output is the same everywhere. Names in one folder
    // are unique, so no two compare equal.
    entries = readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
  } catch {
    if (where === undefined) {
      yield {
        type: "diagnostic",
        diagnostic: { level: "error", message: "Could not read scan root." },
      };
      return;
    }
    yield { type: "skipped" };
    yield warning("Could not read directory.", where);
    return;
  }

  let rules = inheritedRules;
  const ignoreEntry = entries.find((entry) => entry.name === ".gitignore" && entry.isFile());
  if (ignoreEntry !== undefined) {
    const path = where === undefined ? ".gitignore" : `${where}/.gitignore`;
    const result = readFileOnce(root, join(absoluteDirectory, ".gitignore"), MAX_IGNORE_FILE_BYTES);
    if (result.kind === "file") {
      const parsed = parseIgnoreFile(result.content);
      // One diagnostic per file, however many lines were dropped: a hostile .gitignore must not
      // flood the report.
      const [first] = parsed.problems;
      if (first !== undefined) {
        const count = parsed.problems.length;
        yield warning(
          count === 1
            ? `Line ${first.line} of this .gitignore was not applied: it ${first.reason}.`
            : `${count} lines of this .gitignore were not applied; the first is line ${first.line}: it ${first.reason}.`,
          path,
        );
      }
      if (inheritedRules.length + parsed.rules.length > MAX_RULES_IN_FORCE) {
        yield warning(
          `This .gitignore was not applied: it would put more than ${MAX_RULES_IN_FORCE} rules in force.`,
          path,
        );
      } else {
        rules = [
          ...inheritedRules,
          ...parsed.rules.map((rule) => ({ base: relativeDirectory, rule })),
        ];
      }
      if (!(yield* ignored(path, false, rules, scan))) {
        yield { type: "file", file: { path, content: result.content } };
      }
    } else {
      yield { type: "skipped" };
      yield warning(
        result.kind === "too-large"
          ? "This .gitignore is larger than 64 KiB, so its rules were not applied."
          : "This .gitignore could not be read safely, so its rules were not applied.",
        path,
      );
    }
  }

  for (const entry of entries) {
    if (entry === ignoreEntry) continue;
    const path = where === undefined ? entry.name : `${where}/${entry.name}`;
    if (!isRepoPath(path)) {
      // The path itself can't go in a report, so the diagnostic doesn't name it.
      yield { type: "skipped" };
      yield { type: "diagnostic", diagnostic: { level: "warning", message: INVALID_PATH } };
      continue;
    }
    if (entry.name === ".git" || (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)))
      continue;
    if (entry.isSymbolicLink()) {
      yield { type: "skipped" };
      yield warning("Skipped a symbolic link: the scanner never follows links.", path);
      continue;
    }
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!(yield* ignored(path, true, rules, scan))) {
        yield* walk(root, absolutePath, path, rules, scan);
      }
      continue;
    }
    if (!entry.isFile()) {
      yield { type: "skipped" }; // FIFOs, sockets, devices
      continue;
    }
    if (yield* ignored(path, false, rules, scan)) continue;
    const result = readFileOnce(root, absolutePath, MAX_FILE_BYTES);
    if (result.kind === "file") {
      yield { type: "file", file: { path, content: result.content } };
    } else {
      yield { type: "skipped" };
      if (result.kind === "failed") yield warning("Could not read file.", path);
    }
  }
}

/**
 * Whether .gitignore rules leave `path` out. Too costly to decide: kept, and reported. Once the
 * scan's budget is spent, no rule applies and one diagnostic says where that happened (ADR-015).
 */
function* ignored(
  path: string,
  isDirectory: boolean,
  rules: readonly ScopedRule[],
  scan: MatchBudget,
): Generator<DiscoveryEvent, boolean> {
  if (scan.steps <= 0) return false;
  const decision = isIgnored(path, isDirectory, rules, scan);
  if (scan.steps <= 0) yield warning(OUT_OF_BUDGET, path);
  else if (decision === "too-costly") yield warning(TOO_COSTLY, path);
  return decision === "ignored";
}

/**
 * Reads one file through a single handle: open it, fstat that handle, read at most `maxBytes`
 * from it. Without O_NOFOLLOW (Windows), lstat first refuses a link as the last component.
 */
function readFileOnce(root: string, absolutePath: string, maxBytes: number): ReadResult {
  let descriptor: number | undefined;
  try {
    if (!hasNoFollow) {
      const before = lstatSync(absolutePath);
      if (before.isSymbolicLink() || !before.isFile()) return { kind: "unsafe" };
    }
    descriptor = openSync(absolutePath, OPEN_FLAGS);
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) return { kind: "unsafe" };
    if (opened.size > maxBytes) return { kind: "too-large" };
    // O_NOFOLLOW only covers the last path component: a parent folder swapped for a link after
    // the walk checked it would still be followed. So the open file must still be the one at this
    // path, and the path must still resolve inside the root.
    const current = statSync(absolutePath);
    if (opened.dev !== current.dev || opened.ino !== current.ino) return { kind: "unsafe" };
    if (!isWithin(root, realpathSync(absolutePath))) return { kind: "unsafe" };
    const buffer = Buffer.alloc(opened.size);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
    return { kind: "file", content: buffer.subarray(0, bytesRead).toString("utf8") };
  } catch {
    return { kind: "failed" };
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // A failed close on a read-only handle loses nothing; the content is already read.
      }
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function warning(message: string, file?: string): DiscoveryEvent {
  return {
    type: "diagnostic",
    diagnostic: { level: "warning", message, ...(file === undefined ? {} : { file }) },
  };
}
