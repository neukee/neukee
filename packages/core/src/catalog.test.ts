import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { type CatalogEntry, loadCatalog } from "./index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const VALID = `id: next16/sync-request-apis
title: Synchronous request APIs are removed
applies:
  tool: next
  introducedIn: "16.0.0"
severity: action-required
detector: ast/sync-request-api
message: cookies() and friends must be awaited.
fix: Await the call.
sourceUrl: https://nextjs.org/docs/app/guides/upgrading/version-16
fixtures:
  positive: fixtures/rules/next16-sync-request-apis/positive
  negative: fixtures/rules/next16-sync-request-apis/negative
`;

const EXPECTED: CatalogEntry = {
  id: "next16/sync-request-apis",
  title: "Synchronous request APIs are removed",
  applies: { tool: "next", introducedIn: "16.0.0" },
  severity: "action-required",
  detector: "ast/sync-request-api",
  message: "cookies() and friends must be awaited.",
  fix: "Await the call.",
  sourceUrl: "https://nextjs.org/docs/app/guides/upgrading/version-16",
  fixtures: {
    positive: "fixtures/rules/next16-sync-request-apis/positive",
    negative: "fixtures/rules/next16-sync-request-apis/negative",
  },
};

const HUGE = `${VALID}# ${"x".repeat(70_000)}\n`;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway repo; `files` maps repo-relative paths to contents. Returns the catalog folder. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "neukee-catalog-"));
  roots.push(root);
  mkdirSync(join(root, "catalog"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return join(root, "catalog");
}

// The file path is the id: catalog/<id>.yaml (ADR-014).
const at = "catalog/next16/sync-request-apis.yaml";
const one = (yaml: string) => loadCatalog(repo({ [at]: yaml }));

describe("loadCatalog: valid entries", () => {
  it("reads an entry and returns it typed", () => {
    expect(one(VALID)).toEqual({ entries: [EXPECTED], errors: [] });
  });

  it("accepts an entry without the optional fix", () => {
    const { entries, errors } = one(VALID.replace("fix: Await the call.\n", ""));
    expect(errors).toEqual([]);
    expect(entries[0]).not.toHaveProperty("fix");
  });

  it("reads CRLF files the same as LF files", () => {
    expect(one(VALID.replaceAll("\n", "\r\n"))).toEqual({ entries: [EXPECTED], errors: [] });
  });

  it("accepts an id with three segments, stored at its full path", () => {
    const id = "next16/routing/sync-request-apis";
    const { entries, errors } = loadCatalog(
      repo({ [`catalog/${id}.yaml`]: VALID.replace("next16/sync-request-apis", id) }),
    );
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual([id]);
  });

  it("returns nothing for an empty catalog, and ignores files that aren't YAML", () => {
    expect(
      loadCatalog(repo({ "catalog/README.md": "# Catalog", "catalog/next16/.gitkeep": "" })),
    ).toEqual({ entries: [], errors: [] });
  });

  it("sorts entries by id, whatever the folder order", () => {
    const { entries, errors } = loadCatalog(
      repo({
        [at]: VALID,
        "catalog/next16/a-rule.yaml": VALID.replace("next16/sync-request-apis", "next16/a-rule"),
      }),
    );
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(["next16/a-rule", "next16/sync-request-apis"]);
  });

  it("descends into a folder whose name ends in .yaml instead of reading it", () => {
    const dir = repo({ [at]: VALID });
    mkdirSync(join(dir, "next16", "odd.yaml"));
    expect(loadCatalog(dir)).toEqual({ entries: [EXPECTED], errors: [] });
  });
});

describe("loadCatalog: invalid entries give clear errors naming the file", () => {
  const cases: { name: string; yaml: string; message: string }[] = [
    {
      name: "missing source",
      yaml: VALID.replace(/^sourceUrl: .*\n/m, ""),
      message: `${at} is missing required field "sourceUrl".`,
    },
    {
      name: "missing fixtures",
      yaml: VALID.replace(/^fixtures:\n(?: {2}.*\n)+/m, ""),
      message: `${at} is missing required field "fixtures".`,
    },
    {
      name: "missing negative fixture",
      yaml: VALID.replace(/^ {2}negative: .*\n/m, ""),
      message: `${at} is missing required field "fixtures.negative".`,
    },
    {
      name: "missing tool",
      yaml: VALID.replace(/^ {2}tool: .*\n/m, ""),
      message: `${at} is missing required field "applies.tool".`,
    },
    {
      name: "unknown severity",
      yaml: VALID.replace("severity: action-required", "severity: critical"),
      message: `${at}: severity must be one of "action-required", "warning" or "info" (got "critical").`,
    },
    {
      name: "a source that isn't official",
      yaml: VALID.replace(/^sourceUrl: .*$/m, "sourceUrl: https://blog.example.com/x"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "https://blog.example.com/x").`,
    },
    {
      name: "a source over http",
      yaml: VALID.replace("https://nextjs.org", "http://nextjs.org"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "http://nextjs.org/docs/app/guides/upgrading/version-16").`,
    },
    {
      name: "a look-alike domain",
      yaml: VALID.replace(/^sourceUrl: .*$/m, "sourceUrl: https://nextjs.org.evil.com/x"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "https://nextjs.org.evil.com/x").`,
    },
    {
      name: "an id that isn't a catalog id",
      yaml: VALID.replace("id: next16/sync-request-apis", "id: Next16/Sync"),
      message: `${at}: id "Next16/Sync" is not a catalog id (lowercase segments joined by "/", like "next16/sync-request-apis").`,
    },
    {
      name: "a very long bad id, shortened in the message",
      yaml: VALID.replace("id: next16/sync-request-apis", `id: ${"X".repeat(300)}`),
      message: `${at}: id "${"X".repeat(60)}… is not a catalog id (lowercase segments joined by "/", like "next16/sync-request-apis").`,
    },
    {
      name: "an id that doesn't match the file path",
      yaml: VALID.replace("id: next16/sync-request-apis", "id: next16/other-rule"),
      message: `${at}: id "next16/other-rule" belongs at catalog/next16/other-rule.yaml.`,
    },
    {
      name: "an unknown tool",
      yaml: VALID.replace("tool: next", "tool: deno"),
      message: `${at}: applies.tool must be one of "node", "next", "react" or "prisma" (got "deno").`,
    },
    {
      name: "a version that isn't x.y.z",
      yaml: VALID.replace('introducedIn: "16.0.0"', "introducedIn: 16"),
      message: `${at}: applies.introducedIn must be a version like "16.0.0" (got 16).`,
    },
    {
      name: "a version given as a mapping",
      yaml: VALID.replace('introducedIn: "16.0.0"', "introducedIn: { major: 16 }"),
      message: `${at}: applies.introducedIn must be a version like "16.0.0" (got an object).`,
    },
    {
      name: "applies that isn't a mapping",
      yaml: VALID.replace(/^applies:\n(?: {2}.*\n)+/m, "applies: next\n"),
      message: `${at}: applies must be a mapping (tool, introducedIn).`,
    },
    {
      name: "fixtures that aren't a mapping",
      yaml: VALID.replace(/^fixtures:\n(?: {2}.*\n)+/m, "fixtures: fixtures/rules/x\n"),
      message: `${at}: fixtures must be a mapping (positive, negative).`,
    },
    {
      name: "a title on two lines",
      yaml: VALID.replace(
        "title: Synchronous request APIs are removed",
        "title: |\n  Two\n  lines",
      ),
      message: `${at}: title must be a single line of text.`,
    },
    {
      name: "an empty title",
      yaml: VALID.replace("title: Synchronous request APIs are removed", 'title: ""'),
      message: `${at}: title must be a non-empty string.`,
    },
    {
      name: "an empty detector",
      yaml: VALID.replace("detector: ast/sync-request-api", 'detector: ""'),
      message: `${at}: detector must be a non-empty string.`,
    },
    {
      name: "an empty message",
      yaml: VALID.replace("message: cookies() and friends must be awaited.", 'message: ""'),
      message: `${at}: message must be a non-empty string.`,
    },
    {
      name: "an empty fix",
      yaml: VALID.replace("fix: Await the call.", 'fix: ""'),
      message: `${at}: fix must be a non-empty string.`,
    },
    {
      name: "a fixture outside fixtures/",
      yaml: VALID.replace(
        "positive: fixtures/rules/next16-sync-request-apis/positive",
        "positive: packages/core/src",
      ),
      message: `${at}: fixtures.positive must be a folder under fixtures/ (got "packages/core/src").`,
    },
    {
      name: "a fixture path that climbs out",
      yaml: VALID.replace(
        "negative: fixtures/rules/next16-sync-request-apis/negative",
        "negative: fixtures/../../etc",
      ),
      message: `${at}: fixtures.negative must be a folder under fixtures/ (got "fixtures/../../etc").`,
    },
    {
      name: "a fixture path with backslashes",
      yaml: VALID.replace(
        "negative: fixtures/rules/next16-sync-request-apis/negative",
        "negative: fixtures\\rules\\x",
      ),
      message: `${at}: fixtures.negative must be a folder under fixtures/ (got "fixtures\\\\rules\\\\x").`,
    },
    {
      name: "an unknown field",
      yaml: `${VALID}severty: warning\n`,
      message: `${at} has unknown field "severty".`,
    },
    {
      name: "an unknown nested field",
      yaml: VALID.replace(
        'introducedIn: "16.0.0"',
        'introducedIn: "16.0.0"\n  removedIn: "17.0.0"',
      ),
      message: `${at} has unknown field "applies.removedIn".`,
    },
    {
      name: "a YAML custom tag",
      yaml: VALID.replace(
        "detector: ast/sync-request-api",
        'detector: !!js/function "function(){}"',
      ),
      message: `${at} is not valid catalog YAML: Unresolved tag: tag:yaml.org,2002:js/function at line 7, column 11.`,
    },
    {
      name: "a duplicate key",
      yaml: `${VALID}severity: info\n`,
      message: `${at} is not valid catalog YAML: Map keys must be unique at line 14, column 1.`,
    },
    {
      name: "broken YAML",
      yaml: "id: [unclosed\n",
      message: `${at} is not valid catalog YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 2, column 1.`,
    },
    {
      name: "an empty file",
      yaml: "",
      message: `${at} must contain one YAML mapping (got an empty file).`,
    },
    {
      name: "a list instead of a mapping",
      yaml: "- a\n- b\n",
      message: `${at} must contain one YAML mapping (got a list).`,
    },
    {
      name: "a plain value instead of a mapping",
      yaml: "just some text\n",
      message: `${at} must contain one YAML mapping (got a string).`,
    },
    {
      name: "a file over 64 KiB",
      yaml: HUGE,
      message: `${at} is ${Buffer.byteLength(HUGE)} bytes; catalog entries must be under 64 KiB.`,
    },
  ];

  it.each(cases)("$name", ({ yaml, message }) => {
    const { entries, errors } = one(yaml);
    expect(entries).toEqual([]);
    expect(errors).toEqual([{ file: at, message }]);
  });

  // These messages come from the yaml library; what matters is that the file is rejected, by
  // name, and the load goes on.
  const unsafe: { name: string; yaml: string }[] = [
    { name: "a YAML 1.1 merge key", yaml: `%YAML 1.1\n---\n<<: { severity: info }\n${VALID}` },
    {
      name: "YAML 1.1 binary data",
      yaml: `%YAML 1.1\n---\n${VALID.replace("detector: ast/sync-request-api", "detector: !!binary aGVsbG8=")}`,
    },
    {
      name: "an alias bomb (billion laughs)",
      yaml: [
        'a: &a ["x","x","x","x","x","x","x","x","x","x"]',
        "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]",
        "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]",
        "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]",
        "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]",
        "f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e,*e]",
        "",
      ].join("\n"),
    },
  ];

  it.each(unsafe)("rejects $name by name and keeps loading the rest", ({ yaml }) => {
    const bad = "catalog/next16/unsafe.yaml";
    const { entries, errors } = loadCatalog(repo({ [at]: VALID, [bad]: yaml }));
    expect(entries).toEqual([EXPECTED]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe(bad);
    expect(errors[0]?.message.startsWith(`${bad} `)).toBe(true);
  });

  it.each(["catalog/next16/sync-request-apis.yml", "catalog/next16/sync-request-apis.YAML"])(
    "rejects %s instead of silently skipping it",
    (file) => {
      expect(loadCatalog(repo({ [file]: VALID }))).toEqual({
        entries: [],
        errors: [{ file, message: `${file}: catalog entries use the lowercase .yaml extension.` }],
      });
    },
  );

  // Creating symlinks on Windows needs extra privileges, so this one runs on Linux and macOS.
  it.skipIf(process.platform === "win32")("rejects a symbolic link instead of following it", () => {
    const dir = repo({ [at]: VALID, "elsewhere/outside.yaml": VALID });
    symlinkSync(join(dir, "..", "elsewhere", "outside.yaml"), join(dir, "next16", "link.yaml"));
    expect(loadCatalog(dir)).toEqual({
      entries: [EXPECTED],
      errors: [
        {
          file: "catalog/next16/link.yaml",
          message: "catalog/next16/link.yaml is a symbolic link; the catalog doesn't follow links.",
        },
      ],
    });
  });

  it.skipIf(process.platform === "win32")(
    "rejects a symlinked folder instead of silently skipping it",
    () => {
      const dir = repo({ [at]: VALID, "elsewhere/next17/rule.yaml": VALID });
      symlinkSync(join(dir, "..", "elsewhere", "next17"), join(dir, "next17"));
      expect(loadCatalog(dir)).toEqual({
        entries: [EXPECTED],
        errors: [
          {
            file: "catalog/next17",
            message: "catalog/next17 is a symbolic link; the catalog doesn't follow links.",
          },
        ],
      });
    },
  );

  // Permissions don't apply on Windows or to root, so these run elsewhere.
  const canDenyRead = process.platform !== "win32" && process.getuid?.() !== 0;

  it.skipIf(!canDenyRead)(
    "reports an unreadable file by its error code, never an absolute path",
    () => {
      const dir = repo({ [at]: VALID, "catalog/next16/locked.yaml": VALID });
      chmodSync(join(dir, "next16", "locked.yaml"), 0o000);
      const { entries, errors } = loadCatalog(dir);
      expect(entries).toEqual([EXPECTED]);
      expect(errors).toEqual([
        {
          file: "catalog/next16/locked.yaml",
          message: "catalog/next16/locked.yaml could not be read (EACCES).",
        },
      ]);
    },
  );

  it.skipIf(!canDenyRead)("reports an unreadable folder and keeps loading the rest", () => {
    const dir = repo({ [at]: VALID, "catalog/locked/x/rule.yaml": VALID });
    chmodSync(join(dir, "locked"), 0o000);
    try {
      expect(loadCatalog(dir)).toEqual({
        entries: [EXPECTED],
        errors: [{ file: "catalog/locked", message: "catalog/locked could not be read (EACCES)." }],
      });
    } finally {
      chmodSync(join(dir, "locked"), 0o755); // so the temp folder can be removed
    }
  });

  it("keeps loading the good entries when one file is bad, with errors sorted by file", () => {
    const { entries, errors } = loadCatalog(
      repo({
        [at]: VALID,
        "catalog/node24/z-broken.yaml": "id: [unclosed\n",
        "catalog/next16/b-broken.yaml": "",
      }),
    );
    expect(entries.map((e) => e.id)).toEqual(["next16/sync-request-apis"]);
    expect(errors.map((e) => e.file)).toEqual([
      "catalog/next16/b-broken.yaml",
      "catalog/node24/z-broken.yaml",
    ]);
  });
});

describe("the real catalog", () => {
  const { entries, errors } = loadCatalog(join(repoRoot, "catalog"));

  // ADR-003: every entry has an official source and both fixture folders, which must exist.
  // The loader checks the paths; this test checks the folders, because the npm package ships
  // the catalog without fixtures (ADR-014).
  it("loads with no errors", () => {
    expect(errors).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has existing positive and negative fixture folders for every entry", () => {
    for (const entry of entries) {
      for (const folder of [entry.fixtures.positive, entry.fixtures.negative]) {
        const stat = statSync(join(repoRoot, folder), { throwIfNoEntry: false });
        expect(stat?.isDirectory(), `${entry.id}: ${folder} must be an existing folder`).toBe(true);
      }
    }
  });

  it("contains next16/sync-request-apis, sourced from the Next.js 16 upgrade guide", () => {
    const entry = entries.find((e) => e.id === "next16/sync-request-apis");
    expect(entry?.sourceUrl).toBe(
      "https://nextjs.org/docs/app/guides/upgrading/version-16#async-request-apis-breaking-change",
    );
    expect(entry?.applies).toEqual({ tool: "next", introducedIn: "16.0.0" });
  });
});
