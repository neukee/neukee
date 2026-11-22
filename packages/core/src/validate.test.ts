import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagnostic, Finding, Location, ScanReport, Target } from "./index.js";
import { repoPathPattern, validateReport } from "./index.js";
import {
  type SchemaNode,
  SUPPORTED_FORMATS,
  SUPPORTED_KEYWORDS,
  SUPPORTED_TYPES,
  validateWithSchema,
} from "./validate.js";

type JsonObject = Record<string, unknown>;

const schema = JSON.parse(
  readFileSync(new URL("../schema/scan-report.v1.json", import.meta.url), "utf8"),
) as JsonObject;

const properties = (node: JsonObject): JsonObject => node.properties as JsonObject;
const def = (name: string): JsonObject => (schema.$defs as JsonObject)[name] as JsonObject;

// Every field of every type, optional ones included, so the agreement tests see the whole contract.
const location: Required<Location> = { file: "app/page.tsx", line: 3, column: 15 };
const target: Required<Target> = { tool: "next", version: "16" };
const finding: Required<Finding> = {
  ruleId: "next16/sync-request-apis",
  severity: "action-required",
  title: "Synchronous request APIs are removed",
  message: "cookies() is called without await in app/page.tsx.",
  fix: "Await the call: const store = await cookies().",
  sourceUrl: "https://nextjs.org/docs/app/guides/upgrading/version-16",
  locations: [location],
  target,
};
const diagnostic: Required<Diagnostic> = {
  level: "warning",
  message: "Skipped a file larger than 1 MB.",
  file: "public/data.json",
};
const tool: Required<ScanReport["tool"]> = { name: "neukee", version: "0.1.0" };
const detected: Required<ScanReport["detected"]> = {
  node: ["22"],
  packageManager: "pnpm",
  frameworks: { next: "15.5.4", "@prisma/client": "6.1.0" },
};
const stats: Required<ScanReport["stats"]> = { filesScanned: 42, filesSkipped: 1 };
const report: Required<ScanReport> = {
  schemaVersion: 1,
  tool,
  scannedAt: "2026-11-22T12:00:00.000Z",
  root: ".",
  // A copy: structuredClone keeps shared references, so sharing `target` with the finding
  // would make a change to one appear in both.
  targets: [{ ...target }],
  detected,
  findings: [finding],
  diagnostics: [diagnostic],
  stats,
};

const minimalReport: ScanReport = {
  schemaVersion: 1,
  tool: { name: "neukee", version: "0.1.0" },
  scannedAt: "2026-11-22T12:00:00Z",
  root: ".",
  targets: [],
  detected: { node: [], frameworks: {} },
  findings: [],
  diagnostics: [],
  stats: { filesScanned: 0, filesSkipped: 0 },
};

const REMOVE = Symbol("remove");

/** A deep copy of the full report with one value replaced (or removed with REMOVE). */
function changed(path: readonly (string | number)[], value: unknown): unknown {
  const copy: unknown = structuredClone(report);
  let node = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  const last = path.at(-1) as string | number;
  if (value === REMOVE) Reflect.deleteProperty(node, last);
  else node[last] = value;
  return copy;
}

describe("validateReport: valid reports", () => {
  it("accepts a report that uses every field and returns it typed", () => {
    const result = validateReport(report);
    expect(result).toEqual({ valid: true, report });
    if (result.valid) expect(result.report).toBe(report);
  });

  it("accepts a minimal report: no optional fields, empty lists", () => {
    expect(validateReport(minimalReport)).toEqual({ valid: true, report: minimalReport });
  });

  it("accepts a report read back from JSON text", () => {
    expect(validateReport(JSON.parse(JSON.stringify(report))).valid).toBe(true);
  });

  // Paths the detectors in T-005..T-026 will really emit; a later pattern change must not reject them.
  it.each([
    ".nvmrc",
    ".github/workflows/ci.yml",
    "Dockerfile",
    "app/[...slug]/page.tsx",
    "app/[[...slug]]/page.tsx",
    "app/(..)photo/page.tsx",
    "app/(...)photo/page.tsx",
    "app/@modal/default.tsx",
    "app/@modal",
    "src/..foo/a.ts",
    "src/a..b.ts",
    "docs/über straße.md",
    "my dir/a b.ts",
  ])("accepts the real repo path %j", (file) => {
    expect(validateReport(changed(["findings", 0, "locations", 0, "file"], file)).valid).toBe(true);
  });

  it("exports the RepoPath pattern from the report schema", () => {
    expect(repoPathPattern()).toBe(def("RepoPath").pattern);
  });

  it.each([
    "2026-11-22T12:00:00Z",
    "2026-11-22T12:00:00.123Z",
    "2026-11-22T17:30:00+05:30",
    "2026-11-22T07:00:00.5-05:00",
    "2028-02-29T23:59:59Z",
    "2026-12-31T00:00:00+14:00",
    "2026-01-01T00:00:00-12:00",
    new Date(0).toISOString(),
    "2000-02-29T00:00:00Z",
  ])("accepts the timestamp %j", (scannedAt) => {
    expect(validateReport(changed(["scannedAt"], scannedAt)).valid).toBe(true);
  });

  it.each([
    "https://nodejs.org/en/blog/release/v24.0.0",
    "https://nextjs.org/docs/app/guides/upgrading/version-16#async-request-apis",
    "https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V24.md?plain=1#L10",
    "https://docs.npmjs.com:443/cli/v11",
    "https://example.com:1/",
    "https://example.com:65535",
    "https://example.com:8080?q=1",
  ])("accepts the source %j", (sourceUrl) => {
    expect(validateReport(changed(["findings", 0, "sourceUrl"], sourceUrl)).valid).toBe(true);
  });
});

describe("validateReport: broken reports fail with clear messages", () => {
  const cases: { name: string; input: unknown; errors: { path: string; message: string }[] }[] = [
    {
      name: "a required field is missing",
      input: changed(["findings"], REMOVE),
      errors: [{ path: "report", message: 'report is missing required property "findings".' }],
    },
    {
      name: "an unknown severity",
      input: changed(["findings", 0, "severity"], "critical"),
      errors: [
        {
          path: "report.findings[0].severity",
          message:
            'report.findings[0].severity must be one of "action-required", "warning" or "info" (got "critical").',
        },
      ],
    },
    {
      name: "an absolute POSIX path in a location",
      input: changed(["findings", 0, "locations", 0, "file"], "/home/dev/app/page.tsx"),
      errors: [
        {
          path: "report.findings[0].locations[0].file",
          message:
            'report.findings[0].locations[0].file must be a repo-relative path with forward slashes, never absolute and never outside the repo (got "/home/dev/app/page.tsx").',
        },
      ],
    },
    {
      name: "the wrong schema version",
      input: changed(["schemaVersion"], 2),
      errors: [
        { path: "report.schemaVersion", message: "report.schemaVersion must be 1 (got 2)." },
      ],
    },
    {
      name: "a number given as a string",
      input: changed(["stats", "filesScanned"], "12"),
      errors: [
        {
          path: "report.stats.filesScanned",
          message: 'report.stats.filesScanned must be an integer (got "12").',
        },
      ],
    },
    {
      name: "a misspelled property",
      input: changed(["findings", 0, "severty"], "warning"),
      errors: [
        {
          path: "report.findings[0]",
          message: 'report.findings[0] has unknown property "severty".',
        },
      ],
    },
    {
      name: "an absolute Windows path in a diagnostic",
      input: changed(["diagnostics", 0, "file"], "C:\\repo\\src\\a.ts"),
      errors: [
        {
          path: "report.diagnostics[0].file",
          message:
            'report.diagnostics[0].file must be a repo-relative path with forward slashes, never absolute and never outside the repo (got "C:\\\\repo\\\\src\\\\a.ts").',
        },
      ],
    },
    {
      name: "a path that climbs out of the repo",
      input: changed(["findings", 0, "locations", 0, "file"], "src/../../etc/passwd"),
      errors: [
        {
          path: "report.findings[0].locations[0].file",
          message:
            'report.findings[0].locations[0].file must be a repo-relative path with forward slashes, never absolute and never outside the repo (got "src/../../etc/passwd").',
        },
      ],
    },
    {
      name: "an absolute root",
      input: changed(["root"], "/Users/dev/app"),
      errors: [{ path: "report.root", message: 'report.root must be "." (got "/Users/dev/app").' }],
    },
    {
      name: "a line number below 1",
      input: changed(["findings", 0, "locations", 0, "line"], 0),
      errors: [
        {
          path: "report.findings[0].locations[0].line",
          message: "report.findings[0].locations[0].line must be at least 1 (got 0).",
        },
      ],
    },
    {
      name: "a timing field (reports are deterministic; only scannedAt varies)",
      input: changed(["stats", "durationMs"], 812.5),
      errors: [
        {
          path: "report.stats",
          message: 'report.stats has unknown property "durationMs".',
        },
      ],
    },
    {
      name: "a negative count",
      input: changed(["stats", "filesSkipped"], -5),
      errors: [
        {
          path: "report.stats.filesSkipped",
          message: "report.stats.filesSkipped must be at least 0 (got -5).",
        },
      ],
    },
    {
      name: "a non-finite count",
      input: changed(["stats", "filesScanned"], Number.POSITIVE_INFINITY),
      errors: [
        {
          path: "report.stats.filesScanned",
          message: "report.stats.filesScanned must be an integer (got Infinity).",
        },
      ],
    },
    {
      name: "a title spanning two lines",
      input: changed(["findings", 0, "title"], "Line one\nline two"),
      errors: [
        {
          path: "report.findings[0].title",
          message:
            'report.findings[0].title must be a single line of text (got "Line one\\nline two").',
        },
      ],
    },
    {
      name: "an empty message",
      input: changed(["diagnostics", 0, "message"], ""),
      errors: [
        {
          path: "report.diagnostics[0].message",
          message: "report.diagnostics[0].message must not be empty.",
        },
      ],
    },
    {
      name: "a source that is not https",
      input: changed(["findings", 0, "sourceUrl"], "http://nextjs.org/docs"),
      errors: [
        {
          path: "report.findings[0].sourceUrl",
          message:
            'report.findings[0].sourceUrl must be an https URL (got "http://nextjs.org/docs").',
        },
      ],
    },
    {
      name: "a rule id that is not a catalog id",
      input: changed(["findings", 0, "ruleId"], "Sync Request APIs"),
      errors: [
        {
          path: "report.findings[0].ruleId",
          message:
            'report.findings[0].ruleId must be a catalog entry id such as "next16/sync-request-apis" (got "Sync Request APIs").',
        },
      ],
    },
    {
      name: "a timestamp that is not ISO 8601",
      input: changed(["scannedAt"], "22 Nov 2026"),
      errors: [
        {
          path: "report.scannedAt",
          message:
            'report.scannedAt must be an ISO 8601 date and time with a time zone (got "22 Nov 2026").',
        },
      ],
    },
    {
      name: "an unknown target tool",
      input: changed(["targets", 0, "tool"], "deno"),
      errors: [
        {
          path: "report.targets[0].tool",
          message:
            'report.targets[0].tool must be one of "node", "next", "react" or "prisma" (got "deno").',
        },
      ],
    },
    {
      name: "a framework version that is not a string",
      input: changed(["detected", "frameworks", "@prisma/client"], 6),
      errors: [
        {
          path: 'report.detected.frameworks["@prisma/client"]',
          message: 'report.detected.frameworks["@prisma/client"] must be a string (got 6).',
        },
      ],
    },
    {
      name: "an object where a list belongs",
      input: changed(["targets"], { tool: "node" }),
      errors: [
        { path: "report.targets", message: "report.targets must be an array (got an object)." },
      ],
    },
    {
      name: "a list where an object belongs",
      input: changed(["tool"], ["neukee"]),
      errors: [{ path: "report.tool", message: "report.tool must be an object (got an array)." }],
    },
    {
      name: "not an object at all",
      input: null,
      errors: [{ path: "report", message: "report must be an object (got null)." }],
    },
  ];

  it.each(cases)("$name", ({ input, errors }) => {
    expect(validateReport(input)).toEqual({ valid: false, errors });
  });

  it("reports every problem, in document order, not just the first", () => {
    const input = structuredClone(report) as unknown as JsonObject;
    input.schemaVersion = 2;
    input.root = "/abs";
    (input.stats as JsonObject).filesSkipped = -1;
    const result = validateReport(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.path)).toEqual([
        "report.schemaVersion",
        "report.root",
        "report.stats.filesSkipped",
      ]);
    }
  });

  it("lists unknown properties in sorted order, whatever order the input has", () => {
    const forwards = { ...report, zeta: 1, alpha: 2 };
    const backwards = { ...report, alpha: 2, zeta: 1 };
    const expected = [
      { path: "report", message: 'report has unknown property "alpha".' },
      { path: "report", message: 'report has unknown property "zeta".' },
    ];
    expect(validateReport(forwards)).toEqual({ valid: false, errors: expected });
    expect(validateReport(backwards)).toEqual({ valid: false, errors: expected });
    const frameworks = (order: string[]) =>
      changed(["detected", "frameworks"], Object.fromEntries(order.map((k) => [k, 1])));
    const paths = (input: unknown) => {
      const result = validateReport(input);
      return result.valid ? [] : result.errors.map((e) => e.path);
    };
    expect(paths(frameworks(["react", "next"]))).toEqual([
      "report.detected.frameworks.next",
      "report.detected.frameworks.react",
    ]);
    expect(paths(frameworks(["next", "react"]))).toEqual(paths(frameworks(["react", "next"])));
  });

  it("shortens very long values in messages", () => {
    const result = validateReport(changed(["root"], "x".repeat(500)));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.message).toBe(`report.root must be "." (got "${"x".repeat(60)}…).`);
    }
  });

  it("never splits a character when shortening", () => {
    const result = validateReport(changed(["root"], `${"x".repeat(59)}😀tail`));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.message).toBe(
        `report.root must be "." (got "${"x".repeat(59)}😀…).`,
      );
    }
  });

  it("shortens very long unknown keys, in messages and in paths", () => {
    const key = "k".repeat(200);
    expect(validateReport(changed(["tool", key], 1))).toEqual({
      valid: false,
      errors: [
        {
          path: "report.tool",
          message: `report.tool has unknown property "${"k".repeat(60)}….`,
        },
      ],
    });
    const result = validateReport(changed(["detected", "frameworks", key], 6));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.path).toBe(`report.detected.frameworks["${"k".repeat(60)}…]`);
    }
  });
});

describe("validateWithSchema: JSON Schema semantics the report schema relies on", () => {
  const defs = { $defs: { Name: { type: "string", minLength: 1 } } } satisfies SchemaNode;

  it("applies keywords next to a $ref as well as the referenced schema", () => {
    const schemaWithSibling = { ...defs, $ref: "#/$defs/Name", pattern: "^a" } satisfies SchemaNode;
    expect(validateWithSchema("", schemaWithSibling).map((e) => e.message)).toEqual([
      "value must not be empty.",
      'value must be text matching ^a (got "").',
    ]);
    expect(validateWithSchema("b", schemaWithSibling).map((e) => e.message)).toEqual([
      'value must be text matching ^a (got "b").',
    ]);
    expect(validateWithSchema("a", schemaWithSibling)).toEqual([]);
  });

  it("applies object keywords to any object, even without type: object", () => {
    const untyped = {
      required: ["a"],
      properties: { a: { type: "string" } },
      additionalProperties: false,
    } satisfies SchemaNode;
    expect(validateWithSchema({ b: 1 }, untyped).map((e) => e.message)).toEqual([
      'value is missing required property "a".',
      'value has unknown property "b".',
    ]);
    expect(validateWithSchema("not an object", untyped)).toEqual([]);
  });

  it("allows extra properties when additionalProperties is true or absent", () => {
    expect(validateWithSchema({ b: 1 }, { type: "object", additionalProperties: true })).toEqual(
      [],
    );
    expect(validateWithSchema({ b: 1 }, { type: "object" })).toEqual([]);
  });

  const dateTime = { type: "string", format: "date-time" } satisfies SchemaNode;

  it.each([
    "2026-11-22T12:00:00Z",
    "2028-02-29T00:00:00Z",
    "2000-02-29T00:00:00Z",
    "2026-04-30T23:59:59.999+14:00",
    "2026-12-31T00:00:00-12:00",
  ])("format date-time accepts the real date and time %j", (value) => {
    expect(validateWithSchema(value, dateTime)).toEqual([]);
  });

  it.each([
    "2026-02-29T00:00:00Z",
    "2100-02-29T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-00-01T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-11-22T24:00:00Z",
    "2026-11-22T12:60:00Z",
    "2026-11-22T12:00:60Z",
    "2026-11-22T12:00:00+14:30",
    "2026-11-22T12:00:00+15:00",
    "2026-11-22T12:00:00+05:60",
    "2026-11-22",
    "not a date",
  ])("format date-time rejects %j", (value) => {
    expect(validateWithSchema(value, dateTime)).toEqual([
      {
        path: "value",
        message: `value must be a real calendar date and time (got ${JSON.stringify(value)}).`,
      },
    ]);
  });

  it("checks format only after the pattern passes, so a bad value gets one error", () => {
    const both = { type: "string", pattern: "^\\d", format: "date-time" } satisfies SchemaNode;
    expect(validateWithSchema("x", both)).toHaveLength(1);
    expect(validateWithSchema("2026-02-30T00:00:00Z", both)).toHaveLength(1);
  });

  it("ignores formats it does not implement, as JSON Schema annotations", () => {
    expect(validateWithSchema("anything", { type: "string", format: "email" })).toEqual([]);
  });
});

// --- Every constraint in the schema is enforced -------------------------------------------
//
// Stryker mutates TypeScript only, so nothing else notices if a JSON constraint is deleted or
// loosened. This walks every node of the schema alongside the full example report and builds one
// violating value per keyword; each must produce exactly one error at that node's path.

const REPO_PATH =
  "a repo-relative path with forward slashes, never absolute and never outside the repo";

/** Bad values for each `pattern`, keyed by the node's description. A new pattern needs an entry. */
const BAD_PATTERN_VALUES: Record<string, string[]> = {
  [REPO_PATH]: [
    "/home/dev/a.ts",
    "C:/repo/a.ts",
    "c:\\repo\\a.ts",
    "src\\a.ts",
    "\\\\server\\share\\a.ts",
    "file:///etc/passwd",
    "../a.ts",
    "src/../../a.ts",
    "..",
    ".",
    "./src/a.ts",
    "src/./a.ts",
    "src//a.ts",
    "app/@modal/",
    "src/\u001b[31mred.ts",
    "a\tb.ts",
    "a\u0000b.ts",
    "a\u007fb.ts",
    "a\u0085b.ts",
    "a\nb.ts",
    "a b.ts",
    "invoice‮txt.exe",
    "src/⁦hidden⁩.ts",
  ],
  "an ISO 8601 date and time with a time zone": [
    "2026-11-22T12:00:00",
    "2026-11-22",
    "2026-11-22 12:00:00Z",
    "22 Nov 2026",
    "2026-13-01T00:00:00Z",
    "2026-00-10T00:00:00Z",
    "2026-11-32T00:00:00Z",
    "2026-11-00T00:00:00Z",
    "2026-11-22T24:00:00Z",
    "2026-11-22T12:60:00Z",
    "2026-11-22T12:00:60Z",
    "2026-11-22T12:00:00+15:00",
    "2026-11-22T12:00:00+14:30",
    "2026-11-22T12:00:00+05:60",
    "2026-11-22T12:00:00+0530",
    "2026-11-22T12:00:00.Z",
  ],
  "a single line of text": ["one\ntwo", "one\rtwo", "trailing newline\n"],
  "an https URL": [
    "http://nodejs.org/",
    "nodejs.org/docs",
    "https://",
    "https:///docs",
    "https://nodejs",
    "https://-nodejs.org/",
    "https://nodejs-.org/",
    "https://nodejs..org/",
    "https://nodejs.org:port/",
    "https://nodejs.org:99999/",
    "https://nodejs.org:65536/",
    "https://nodejs.org:0/",
    "https://nodejs.org:080/",
    "https://nodejs.org:/",
    "https://user@nodejs.org/",
    "https://nodejs.org/a b",
    "https://a b",
    "ftp://x",
  ],
  'a catalog entry id such as "next16/sync-request-apis"': [
    "next16",
    "next16/",
    "/sync-request-apis",
    "Next16/sync-request-apis",
    "next16/Sync",
    "next16//x",
    "next16/sync request",
  ],
};

type Segment = string | number;

/** Mirrors the validator's path format: report.a.b[0]["@scope/x"] */
function formatPath(path: readonly Segment[]): string {
  return path.reduce<string>(
    (out, seg) =>
      typeof seg === "number"
        ? `${out}[${seg}]`
        : /^[A-Za-z_$][\w$]*$/.test(seg)
          ? `${out}.${seg}`
          : `${out}[${JSON.stringify(seg)}]`,
    "report",
  );
}

/** A node with its $ref resolved and merged with any sibling keywords. */
function resolved(node: JsonObject): JsonObject {
  if (typeof node.$ref !== "string") return node;
  const { $ref, ...siblings } = node;
  return { ...resolved(def(($ref as string).slice("#/$defs/".length))), ...siblings };
}

/** Every schema node reachable from the example report, with the path to it. */
function walk(
  node: JsonObject,
  value: unknown,
  path: Segment[],
): { path: Segment[]; node: JsonObject }[] {
  const here = resolved(node);
  const out = [{ path, node: here }];
  if (Array.isArray(value) && here.items !== undefined) {
    value.forEach((item, i) => {
      out.push(...walk(here.items as JsonObject, item, [...path, i]));
    });
  } else if (typeof value === "object" && value !== null) {
    const props = (here.properties as JsonObject | undefined) ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childNode = props[key] ?? here.additionalProperties;
      if (typeof childNode === "object" && childNode !== null) {
        out.push(...walk(childNode as JsonObject, child, [...path, key]));
      }
    }
  }
  return out;
}

function violations(node: JsonObject): { keyword: string; value: unknown }[] {
  const out: { keyword: string; value: unknown }[] = [];
  if (Object.hasOwn(node, "const")) out.push({ keyword: "const", value: "not-the-constant" });
  if (node.enum !== undefined) out.push({ keyword: "enum", value: "not-an-enum-member" });
  const typeViolation: Record<string, unknown> = {
    object: [],
    array: {},
    string: 1,
    integer: (typeof node.minimum === "number" ? node.minimum : 0) + 0.5,
  };
  if (typeof node.type === "string") out.push({ keyword: "type", value: typeViolation[node.type] });
  if (typeof node.minimum === "number") out.push({ keyword: "minimum", value: node.minimum - 1 });
  if (node.minLength !== undefined) out.push({ keyword: "minLength", value: "" });
  if (typeof node.pattern === "string") {
    const bad = BAD_PATTERN_VALUES[node.description as string];
    if (bad === undefined) throw new Error(`Add bad examples for pattern "${node.description}".`);
    for (const value of bad) out.push({ keyword: `pattern ${JSON.stringify(value)}`, value });
  }
  if (node.format === "date-time") {
    // Values that pass the pattern but aren't real dates.
    for (const value of ["2026-02-30T00:00:00Z", "2027-02-29T00:00:00Z", "2100-02-29T00:00:00Z"]) {
      out.push({ keyword: `format ${JSON.stringify(value)}`, value });
    }
  }
  return out;
}

const constraintCases = walk(schema, report, [])
  .filter(({ path }) => path.length > 0)
  .flatMap(({ path, node }) =>
    violations(node).map((v) => ({
      name: `${formatPath(path)} · ${v.keyword}`,
      path,
      value: v.value,
    })),
  );

/** One line per schema node: every keyword that constrains it, with its value. */
function constraintSummary(node: JsonObject): string {
  const parts: string[] = [];
  for (const key of [
    "type",
    "const",
    "enum",
    "minimum",
    "minLength",
    "pattern",
    "format",
    "required",
  ]) {
    if (Object.hasOwn(node, key)) parts.push(`${key}=${JSON.stringify(node[key])}`);
  }
  if (node.additionalProperties !== undefined) {
    parts.push(`additionalProperties=${node.additionalProperties === false ? "false" : "schema"}`);
  }
  return parts.join(" ");
}

describe("every constraint in the schema is enforced", () => {
  // The cases below derive from the schema, so they would quietly shrink if a constraint were
  // deleted. This pins the full inventory: changing the schema fails here until the snapshot is
  // updated on purpose, with a reason and a decision record, and a schemaVersion bump if the
  // change is breaking (compatibility policy, ARCHITECTURE §5).
  it("the constraint inventory is pinned", () => {
    const inventory = walk(schema, report, []).map(
      ({ path, node }) => `${formatPath(path)}: ${constraintSummary(node)}`,
    );
    expect(inventory).toMatchSnapshot();
  });

  it("finds a violation for every node below the root", () => {
    const nodes = walk(schema, report, []).filter(({ path }) => path.length > 0);
    for (const { path, node } of nodes) expect(violations(node), formatPath(path)).not.toEqual([]);
    expect(constraintCases.length).toBeGreaterThan(60);
  });

  it.each(constraintCases)("$name", ({ path, value }) => {
    const result = validateReport(changed(path, value));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.map((e) => e.path)).toEqual([formatPath(path)]);
  });
});

// --- Types and schema agree ---------------------------------------------------------------

type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

// `satisfies Record<OptionalKeys<T>, true>` fails to compile if a key is missing or extra,
// so these lists always equal the optional keys of the TypeScript types.
const optionalKeys = {
  report: {} satisfies Record<OptionalKeys<ScanReport>, true>,
  tool: {} satisfies Record<OptionalKeys<ScanReport["tool"]>, true>,
  detected: { packageManager: true } satisfies Record<OptionalKeys<ScanReport["detected"]>, true>,
  stats: {} satisfies Record<OptionalKeys<ScanReport["stats"]>, true>,
  target: {} satisfies Record<OptionalKeys<Target>, true>,
  location: { line: true, column: true } satisfies Record<OptionalKeys<Location>, true>,
  finding: { fix: true } satisfies Record<OptionalKeys<Finding>, true>,
  diagnostic: { file: true } satisfies Record<OptionalKeys<Diagnostic>, true>,
};

const objectShapes = [
  { name: "ScanReport", node: schema, example: report, optional: optionalKeys.report },
  {
    name: "ScanReport.tool",
    node: properties(schema).tool,
    example: tool,
    optional: optionalKeys.tool,
  },
  {
    name: "ScanReport.detected",
    node: properties(schema).detected,
    example: detected,
    optional: optionalKeys.detected,
  },
  {
    name: "ScanReport.stats",
    node: properties(schema).stats,
    example: stats,
    optional: optionalKeys.stats,
  },
  { name: "Target", node: def("Target"), example: target, optional: optionalKeys.target },
  { name: "Location", node: def("Location"), example: location, optional: optionalKeys.location },
  { name: "Finding", node: def("Finding"), example: finding, optional: optionalKeys.finding },
  {
    name: "Diagnostic",
    node: def("Diagnostic"),
    example: diagnostic,
    optional: optionalKeys.diagnostic,
  },
] as { name: string; node: JsonObject; example: object; optional: object }[];

/** Every schema node, depth first. */
function schemaNodes(node: unknown): JsonObject[] {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return [];
  const obj = node as JsonObject;
  const children = [
    ...Object.values((obj.properties as JsonObject | undefined) ?? {}),
    ...Object.values((obj.$defs as JsonObject | undefined) ?? {}),
    obj.items,
    obj.additionalProperties,
  ];
  return [obj, ...children.flatMap(schemaNodes)];
}

describe("types and schema agree", () => {
  it("a report built through the types validates against the schema", () => {
    expect(validateReport(report).valid).toBe(true);
  });

  it.each(objectShapes)(
    "$name: the schema lists exactly the type's fields",
    ({ node, example }) => {
      expect(Object.keys(properties(node)).sort()).toEqual(Object.keys(example).sort());
      expect(node.additionalProperties).toBe(false);
    },
  );

  it.each(objectShapes)(
    "$name: the schema requires exactly the type's non-optional fields",
    ({ node, example, optional }) => {
      const expected = Object.keys(example).filter((key) => !Object.hasOwn(optional, key));
      expect([...(node.required as string[])].sort()).toEqual(expected.sort());
    },
  );

  it("every object in the schema is covered by the agreement checks", () => {
    const withProperties = schemaNodes(schema).filter((node) => node.properties !== undefined);
    expect(withProperties).toHaveLength(objectShapes.length);
    for (const node of withProperties) expect(objectShapes.map((s) => s.node)).toContain(node);
  });

  it("enums match the TypeScript unions", () => {
    const severities: Record<Finding["severity"], true> = {
      "action-required": true,
      warning: true,
      info: true,
    };
    const tools: Record<Target["tool"], true> = {
      node: true,
      next: true,
      react: true,
      prisma: true,
    };
    const levels: Record<Diagnostic["level"], true> = { error: true, warning: true };
    expect(properties(def("Finding")).severity).toEqual({ enum: Object.keys(severities) });
    expect(properties(def("Target")).tool).toEqual({ enum: Object.keys(tools) });
    expect(properties(def("Diagnostic")).level).toEqual({ enum: Object.keys(levels) });
  });

  it("uses only keywords, types and value shapes the validator implements", () => {
    const isPrimitive = (v: unknown) =>
      v === null || ["string", "number", "boolean"].includes(typeof v);
    for (const node of schemaNodes(schema)) {
      for (const key of Object.keys(node)) expect(SUPPORTED_KEYWORDS).toContain(key);
      if (node.type !== undefined) expect(SUPPORTED_TYPES).toContain(node.type);
      if (node.format !== undefined) expect(SUPPORTED_FORMATS).toContain(node.format);
      if (node.$ref !== undefined) expect(node.$ref).toMatch(/^#\/\$defs\/\w+$/);
      // The validator compares const/enum with ===, and has no boolean-schema support for items.
      if (Object.hasOwn(node, "const")) expect(isPrimitive(node.const)).toBe(true);
      if (node.enum !== undefined) expect((node.enum as unknown[]).every(isPrimitive)).toBe(true);
      if (node.items !== undefined) expect(typeof node.items).toBe("object");
      if (node.additionalProperties !== undefined) {
        expect(
          node.additionalProperties === false || typeof node.additionalProperties === "object",
        ).toBe(true);
      }
    }
  });

  it("declares JSON Schema draft 2020-12", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });
});
