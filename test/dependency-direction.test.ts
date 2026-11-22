import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * docs/ARCHITECTURE.md §3: `action → cli → scanner → core`. A package may import only packages to
 * its right, so `core` imports nothing internal and nothing imports `cli` or `action`.
 */
const ORDER = ["action", "cli", "scanner", "core"];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface SourceFile {
  /** Repo-relative, forward slashes, e.g. "packages/core/src/index.ts". */
  path: string;
  source: string;
}

/** Package name for a repo-relative path inside packages/, or undefined. */
function packageOf(path: string): string | undefined {
  const [top, name] = path.split("/");
  return top === "packages" ? name : undefined;
}

/**
 * Every import that points left of its package, as "file → package (via specifier)". Covers
 * `import … from`, `export … from`, side-effect `import "…"`, `import()` and `require()`, by
 * package name (`@neukee/x`) or by a relative path that leaves the package.
 */
function forbiddenImports(files: SourceFile[]): string[] {
  const found: string[] = [];
  const specifier =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;
  for (const file of files) {
    const own = packageOf(file.path);
    if (own === undefined) continue;
    for (const match of file.source.matchAll(specifier)) {
      const spec = match[1] ?? "";
      const target = spec.startsWith("@neukee/")
        ? spec.slice("@neukee/".length).split("/")[0]
        : spec.startsWith(".")
          ? packageOf(join(dirname(file.path), spec).split(sep).join("/"))
          : undefined;
      if (target === undefined || target === own) continue;
      const allowed = ORDER.indexOf(target) > ORDER.indexOf(own) && ORDER.includes(target);
      if (!allowed) found.push(`${file.path} → ${target} (via "${spec}")`);
    }
  }
  return found;
}

/** All .ts files under packages/<name>/src, tests included: tests must respect the rule too. */
function packageSources(): SourceFile[] {
  return readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .flatMap((dirent) => {
      const src = join(repoRoot, "packages", dirent.name, "src");
      return readdirSync(src, { recursive: true, encoding: "utf8" })
        .filter((path) => path.endsWith(".ts"))
        .map((path) => {
          const full = join(src, path);
          return {
            path: relative(repoRoot, full).split(sep).join("/"),
            source: readFileSync(full, "utf8"),
          };
        });
    });
}

describe("dependency direction (ARCHITECTURE §3)", () => {
  it("holds for every package in the repo", () => {
    const files = packageSources();
    expect(files.length).toBeGreaterThan(5);
    expect(forbiddenImports(files)).toEqual([]);
  });

  it("allows imports to the right and within a package", () => {
    const files = [
      { path: "packages/scanner/src/a.ts", source: 'import { x } from "@neukee/core";' },
      {
        path: "packages/cli/src/b.ts",
        source: 'import { y } from "@neukee/scanner";\nimport "@neukee/core";',
      },
      {
        path: "packages/core/src/c.ts",
        source: 'import { z } from "./validate.js";\nimport fs from "node:fs";',
      },
      { path: "packages/action/src/d.ts", source: 'const m = await import("@neukee/cli");' },
    ];
    expect(forbiddenImports(files)).toEqual([]);
  });

  it("catches a forbidden import in every form", () => {
    const files = [
      { path: "packages/core/src/a.ts", source: 'import { scan } from "@neukee/scanner";' },
      { path: "packages/core/src/b.ts", source: 'export { run } from "@neukee/cli/run";' },
      { path: "packages/scanner/src/c.ts", source: 'const cli = await import("@neukee/cli");' },
      { path: "packages/scanner/src/d.ts", source: 'const x = require("@neukee/action");' },
      { path: "packages/core/src/e.ts", source: 'import "../../scanner/src/index.js";' },
      { path: "packages/cli/src/f.ts", source: 'import { act } from "../../action/src/main.js";' },
    ];
    expect(forbiddenImports(files)).toEqual([
      'packages/core/src/a.ts → scanner (via "@neukee/scanner")',
      'packages/core/src/b.ts → cli (via "@neukee/cli/run")',
      'packages/scanner/src/c.ts → cli (via "@neukee/cli")',
      'packages/scanner/src/d.ts → action (via "@neukee/action")',
      'packages/core/src/e.ts → scanner (via "../../scanner/src/index.js")',
      'packages/cli/src/f.ts → action (via "../../action/src/main.js")',
    ]);
  });

  it("flags an import of a package that isn't in the chain", () => {
    const files = [{ path: "packages/core/src/a.ts", source: 'import x from "@neukee/engine";' }];
    expect(forbiddenImports(files)).toEqual([
      'packages/core/src/a.ts → engine (via "@neukee/engine")',
    ]);
  });
});
