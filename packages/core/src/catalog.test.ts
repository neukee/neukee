import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A throwaway repo: `files` maps repo-relative paths to contents, and the fixture folders the
 * VALID entry points to exist unless `withFixtures` is false. Returns the catalog folder.
 */
function repo(files: Record<string, string>, withFixtures = true): string {
  const root = mkdtempSync(join(tmpdir(), "neukee-catalog-"));
  roots.push(root);
  mkdirSync(join(root, "catalog"));
  if (withFixtures) {
    for (const kind of ["positive", "negative"]) {
      mkdirSync(join(root, "fixtures", "rules", "next16-sync-request-apis", kind), {
        recursive: true,
      });
    }
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return join(root, "catalog");
}

const at = "catalog/next/sync-request-apis.yaml";
const one = (yaml: string, withFixtures = true) => loadCatalog(repo({ [at]: yaml }, withFixtures));

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

  it("returns nothing for an empty catalog, and ignores non-entry files", () => {
    expect(
      loadCatalog(repo({ "catalog/README.md": "# Catalog", "catalog/next/.gitkeep": "" })),
    ).toEqual({ entries: [], errors: [] });
  });

  it("sorts entries by id, whatever the folder order", () => {
    const second = VALID.replace("next16/sync-request-apis", "next16/a-rule");
    const { entries, errors } = loadCatalog(
      repo({ [at]: VALID, "catalog/next/a-rule.yaml": second }),
    );
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(["next16/a-rule", "next16/sync-request-apis"]);
  });
});

describe("loadCatalog: invalid entries give clear errors naming the file", () => {
  const cases: { name: string; yaml: string; withFixtures?: boolean; message: string }[] = [
    {
      name: "missing source",
      yaml: VALID.replace(/^sourceUrl: .*\n/m, ""),
      message: `${at} is missing required field "sourceUrl".`,
    },
    {
      name: "unknown severity",
      yaml: VALID.replace("severity: action-required", "severity: critical"),
      message: `${at}: severity must be one of "action-required", "warning" or "info" (got "critical").`,
    },
    {
      name: "missing fixture folder",
      yaml: VALID,
      withFixtures: false,
      message: `${at}: fixtures.positive points to fixtures/rules/next16-sync-request-apis/positive, which does not exist.`,
    },
    {
      name: "a source that isn't official",
      yaml: VALID.replace("https://nextjs.org/docs", "https://blog.example.com/docs"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "https://blog.example.com/docs/app/guides/upgrading/version-16").`,
    },
    {
      name: "a source over http",
      yaml: VALID.replace("https://nextjs.org", "http://nextjs.org"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "http://nextjs.org/docs/app/guides/upgrading/version-16").`,
    },
    {
      name: "a look-alike domain",
      yaml: VALID.replace("https://nextjs.org/", "https://nextjs.org.evil.com/"),
      message: `${at}: sourceUrl must be an https URL on an official source (nextjs.org, nodejs.org, react.dev, www.prisma.io) (got "https://nextjs.org.evil.com/docs/app/guides/upgrading/version-16").`,
    },
    {
      name: "an id that isn't a catalog id",
      yaml: VALID.replace("id: next16/sync-request-apis", "id: Next16/Sync"),
      message: `${at}: id "Next16/Sync" is not a catalog id (lowercase segments joined by "/", like "next16/sync-request-apis").`,
    },
    {
      name: "an id that doesn't match the file name",
      yaml: VALID.replace("id: next16/sync-request-apis", "id: next16/other-rule"),
      message: `${at}: id "next16/other-rule" with applies.tool "next" belongs at catalog/next/other-rule.yaml.`,
    },
    {
      name: "a tool that doesn't match the folder",
      yaml: VALID.replace("tool: next", "tool: react"),
      message: `${at}: id "next16/sync-request-apis" with applies.tool "react" belongs at catalog/react/sync-request-apis.yaml.`,
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
      name: "a title on two lines",
      yaml: VALID.replace(
        "title: Synchronous request APIs are removed",
        "title: |\n  Two\n  lines",
      ),
      message: `${at}: title must be a single line of text.`,
    },
    {
      name: "an empty message",
      yaml: VALID.replace("message: cookies() and friends must be awaited.", 'message: ""'),
      message: `${at}: message must be a non-empty string.`,
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
        "positive: fixtures/rules/next16-sync-request-apis/positive",
        "positive: fixtures/../../etc",
      ),
      message: `${at}: fixtures.positive must be a folder under fixtures/ (got "fixtures/../../etc").`,
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
  ];

  it.each(cases)("$name", ({ yaml, withFixtures = true, message }) => {
    const { entries, errors } = one(yaml, withFixtures);
    expect(entries).toEqual([]);
    expect(errors).toEqual([{ file: at, message }]);
  });

  it("rejects the .yml extension instead of silently skipping the file", () => {
    expect(loadCatalog(repo({ "catalog/next/sync-request-apis.yml": VALID }))).toEqual({
      entries: [],
      errors: [
        {
          file: "catalog/next/sync-request-apis.yml",
          message: "catalog/next/sync-request-apis.yml: catalog entries use the .yaml extension.",
        },
      ],
    });
  });

  it("keeps loading the good entries when one file is bad, with errors sorted by file", () => {
    const { entries, errors } = loadCatalog(
      repo({
        [at]: VALID,
        "catalog/node/z-broken.yaml": "id: [unclosed\n",
        "catalog/next/b-broken.yaml": "",
      }),
    );
    expect(entries.map((e) => e.id)).toEqual(["next16/sync-request-apis"]);
    expect(errors.map((e) => e.file)).toEqual([
      "catalog/next/b-broken.yaml",
      "catalog/node/z-broken.yaml",
    ]);
  });
});

describe("the real catalog", () => {
  // Guards ADR-003: every entry in catalog/ has an official source and existing fixtures.
  it("loads with no errors, and every entry has a source and both fixtures", () => {
    const { entries, errors } = loadCatalog(join(repoRoot, "catalog"));
    expect(errors).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.fixtures.positive).toMatch(/^fixtures\//);
      expect(entry.fixtures.negative).toMatch(/^fixtures\//);
    }
  });

  it("contains next16/sync-request-apis, sourced from the Next.js 16 upgrade guide", () => {
    const entry = loadCatalog(join(repoRoot, "catalog")).entries.find(
      (e) => e.id === "next16/sync-request-apis",
    );
    expect(entry?.sourceUrl).toBe(
      "https://nextjs.org/docs/app/guides/upgrading/version-16#async-request-apis-breaking-change",
    );
    expect(entry?.applies).toEqual({ tool: "next", introducedIn: "16.0.0" });
  });
});
