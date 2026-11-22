// Generates fixtures/gitignore/cases.json from real git, so the scanner's .gitignore matcher is
// tested against git's own behavior (ADR-015). Run by hand, never in tests or CI:
//   node fixtures/gitignore/generate.mjs
// Each case builds a throwaway repo with the given .gitignore files and path, then asks
// `git check-ignore`. core.ignorecase is off: the scanner matches case-sensitively.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** [name, { ignore-file folder ("" = root): contents }, path, isDirectory] */
const CASES = [
  ["star matches a basename", { "": "*.log\n" }, "a.log", false],
  ["star matches at any depth", { "": "*.log\n" }, "src/deep/a.log", false],
  ["star needs the whole name", { "": "*.log\n" }, "a.log.txt", false],
  ["question mark is one character", { "": "a?c\n" }, "abc", false],
  ["question mark needs a character", { "": "a?c\n" }, "ac", false],
  ["class member", { "": "[abc].txt\n" }, "b.txt", false],
  ["class non-member", { "": "[abc].txt\n" }, "d.txt", false],
  ["class range", { "": "[a-c].txt\n" }, "b.txt", false],
  ["negated class with !", { "": "[!a-c].txt\n" }, "d.txt", false],
  ["negated class excludes members", { "": "[!a-c].txt\n" }, "b.txt", false],
  ["negated class with ^", { "": "[^a-c].txt\n" }, "d.txt", false],
  ["leading ] is a member", { "": "[]a].txt\n" }, "].txt", false],
  ["leading ] class still has a", { "": "[]a].txt\n" }, "a.txt", false],
  ["range starting at ]", { "": "[]-a].txt\n" }, "^.txt", false],
  ["range starting at ] excludes b", { "": "[]-a].txt\n" }, "b.txt", false],
  ["reversed range keeps its first char", { "": "[z-a].txt\n" }, "z.txt", false],
  ["reversed range matches nothing else", { "": "[z-a].txt\n" }, "m.txt", false],
  ["trailing dash is literal", { "": "[a-].txt\n" }, "-.txt", false],
  ["escaped ] inside a class", { "": "[\\]].txt\n" }, "].txt", false],
  ["escaped dash inside a class is literal", { "": "[a\\-z].txt\n" }, "-.txt", false],
  ["escaped dash inside a class is no range", { "": "[a\\-z].txt\n" }, "m.txt", false],
  ["escaped range end", { "": "[a-\\z].txt\n" }, "m.txt", false],
  ["negated class with a leading ]", { "": "[!]a].txt\n" }, "b.txt", false],
  ["negated class with a leading ] excludes ]", { "": "[!]a].txt\n" }, "].txt", false],
  ["escape at the end of a class is unclosed", { "": "[a\\\n" }, "a", false],
  ["trailing backslash keeps trailing spaces", { "": "foo \\\n" }, "foo ", false],
  ["unclosed class matches nothing", { "": "[ab\n" }, "[ab", false],
  ["unclosed class is not a prefix", { "": "[ab\n" }, "a", false],
  ["escaped star is literal", { "": "\\*.txt\n" }, "*.txt", false],
  ["escaped star needs a star", { "": "\\*.txt\n" }, "a.txt", false],
  ["escaped bracket is literal", { "": "\\[a]\n" }, "[a]", false],
  ["trailing spaces are trimmed", { "": "foo  \n" }, "foo", false],
  ["escaped trailing space is kept", { "": "foo\\ \n" }, "foo ", false],
  ["comment line", { "": "#foo\n" }, "#foo", false],
  ["escaped hash", { "": "\\#foo\n" }, "#foo", false],
  ["negation re-includes", { "": "*.log\n!keep.log\n" }, "keep.log", false],
  ["negation leaves others", { "": "*.log\n!keep.log\n" }, "a.log", false],
  ["escaped bang is literal", { "": "\\!x\n" }, "!x", false],
  ["directory-only rule on a directory", { "": "build/\n" }, "build", true],
  ["directory-only rule skips a file", { "": "build/\n" }, "build", false],
  ["directory-only rule at any depth", { "": "build/\n" }, "src/build", true],
  ["anchored rule at root", { "": "/a\n" }, "a", false],
  ["anchored rule not below root", { "": "/a\n" }, "b/a", false],
  ["anchored ? does not cross /", { "": "/a?b\n" }, "a/b", false],
  ["anchored star at root", { "": "/*.js\n" }, "b.js", false],
  ["anchored star does not cross /", { "": "/*.js\n" }, "src/b.js", false],
  ["whitelist: re-included folder", { "": "/*\n!/src\n" }, "src/x.js", false],
  ["whitelist: everything else", { "": "/*\n!/src\n" }, "other.txt", false],
  ["middle slash anchors", { "": "a/b\n" }, "a/b", false],
  ["middle slash is not at any depth", { "": "a/b\n" }, "x/a/b", false],
  ["leading globstar at root", { "": "**/a\n" }, "a", false],
  ["leading globstar at depth", { "": "**/a\n" }, "x/y/a", false],
  ["trailing globstar inside", { "": "a/**\n" }, "a/x", false],
  ["trailing globstar deep inside", { "": "a/**\n" }, "a/x/y", false],
  ["trailing globstar not the folder itself", { "": "a/**\n" }, "a", true],
  ["middle globstar zero folders", { "": "a/**/b\n" }, "a/b", false],
  ["middle globstar many folders", { "": "a/**/b\n" }, "a/x/y/b", false],
  ["double globstar matches everything", { "": "**/**\n" }, "x/y", false],
  ["double globstar at top level", { "": "**/**\n" }, "x", false],
  ["triple star is a star", { "": "***\n" }, "a", false],
  ["double star mid-name is a star", { "": "a**b\n" }, "axxb", false],
  ["empty segment matches nothing", { "": "a//b\n" }, "a/b", false],
  ["? matches one byte, not one character", { "": "a?b\n" }, "aéb", false],
  ["?? matches a two-byte character", { "": "a??b\n" }, "aéb", false],
  ["nested negation wins", { "": "*.log\n", sub: "!keep.log\n" }, "sub/keep.log", false],
  ["nested file does not reach the root", { "": "*.log\n", sub: "!keep.log\n" }, "keep.log", false],
  ["nested anchored rule", { sub: "/x.js\n" }, "sub/x.js", false],
  ["nested anchored rule not deeper", { sub: "/x.js\n" }, "sub/y/x.js", false],
  ["nested rule stays in its folder", { sub: "*.tmp\n" }, "other/a.tmp", false],
  ["nested rule reaches deeper", { sub: "*.tmp\n" }, "sub/deep/a.tmp", false],
  ["excluded parent cannot be re-included", { "": "dir/\n!dir/keep.txt\n" }, "dir/keep.txt", false],
  ["children of a parent can be re-included", { "": "dir/*\n!dir/keep.txt\n" }, "dir/keep.txt", false],
  ["star excludes folders, so their files stay out", { "": "*\n!*.js\n" }, "dir/x.js", false],
  ["star and re-include at top level", { "": "*\n!*.js\n" }, "x.js", false],
  ["CRLF line endings", { "": "a.txt\r\nb.txt\r\n" }, "b.txt", false],
  ["lone CR does not split lines (first)", { "": "a.txt\rb.txt\n" }, "a.txt", false],
  ["lone CR does not split lines (second)", { "": "a.txt\rb.txt\n" }, "b.txt", false],
  ["byte order mark is skipped", { "": "\uFEFFa.txt\n" }, "a.txt", false],
  ["blank and whitespace lines", { "": "\n   \n\t\n" }, "x", false],
  ["slash alone matches nothing", { "": "/\n" }, "x", false],
  ["case-sensitive", { "": "*.LOG\n" }, "a.log", false],
  ["last match wins", { "": "!a.txt\na.txt\n" }, "a.txt", false],
  ["no rules", { "": "" }, "a.txt", false],
];

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

function ask(files, path, isDirectory) {
  const repo = mkdtempSync(join(tmpdir(), "neukee-gitignore-"));
  try {
    git(repo, "init", "-q");
    git(repo, "config", "core.ignorecase", "false");
    for (const [folder, text] of Object.entries(files)) {
      mkdirSync(join(repo, folder), { recursive: true });
      writeFileSync(join(repo, folder, ".gitignore"), text);
    }
    mkdirSync(join(repo, dirname(path)), { recursive: true });
    if (isDirectory) mkdirSync(join(repo, path), { recursive: true });
    else writeFileSync(join(repo, path), "");
    try {
      git(repo, "check-ignore", "-q", "--no-index", "--", path);
      return true;
    } catch (error) {
      if (error.status === 1) return false;
      throw error;
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const cases = CASES.map(([name, files, path, isDirectory]) => ({
  name,
  files,
  path,
  isDirectory,
  ignored: ask(files, path, isDirectory),
}));
const out = join(dirname(fileURLToPath(import.meta.url)), "cases.json");
writeFileSync(out, `${JSON.stringify({ gitVersion: git(".", "--version").toString().trim(), cases }, null, 2)}\n`);
console.log(`wrote ${cases.length} cases to ${out}`);
