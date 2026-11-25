import { fileURLToPath } from "node:url";
import { type Finding, loadCatalog, type Target } from "@neukee/core";
import { describe, expect, it } from "vitest";
import { discoverFiles } from "./discover.js";
import { runtimeFindings } from "./runtime-findings.js";
import { type NodeVersionDeclaration, readRuntimeSources } from "./runtime-sources.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const { entries } = loadCatalog(`${repoRoot}catalog`);
const NODE_24: Target = { tool: "node", version: "24" };
const SCANNED_AT = "2026-11-25T12:00:00.000Z";

/** Runs discovery and the runtime readers over a fixture, as the pipeline does. */
function findingsIn(
  fixture: string,
  targets: Target[] = [NODE_24],
  defaultTarget = false,
): Finding[] {
  const declarations: NodeVersionDeclaration[] = [];
  const packageDirs: string[] = [];
  for (const event of discoverFiles(`${repoRoot}${fixture}`)) {
    if (event.type !== "file") continue;
    declarations.push(...readRuntimeSources(event.file).declarations);
    if (event.file.path === "package.json") packageDirs.push("");
    else if (event.file.path.endsWith("/package.json")) {
      packageDirs.push(event.file.path.slice(0, -"/package.json".length));
    }
  }
  return runtimeFindings({
    declarations,
    packageDirs,
    targets,
    entries,
    scannedAt: SCANNED_AT,
    defaultTarget,
  });
}

function rule(findings: Finding[], id: string): Finding[] {
  return findings.filter((finding) => finding.ruleId === id);
}

function pin(file: string, version: NodeVersionDeclaration["version"]): NodeVersionDeclaration {
  const source = file.endsWith(".node-version") ? "node-version" : "nvmrc";
  return { source, location: { file, line: 1, column: 1 }, version };
}

function engines(file: string, range: string, line = 3): NodeVersionDeclaration {
  return {
    source: "engines",
    location: { file, line, column: 14 },
    version: { kind: "range", range },
  };
}

const v = (version: string) => ({ kind: "version" as const, version });

describe("runtime/sources-disagree (Sreeram's monorepo rule, ADR-020)", () => {
  it("flags a package whose own .nvmrc is outside its engines.node, pointing at both lines", () => {
    const findings = rule(
      findingsIn("fixtures/rules/runtime-sources-disagree/positive"),
      "runtime/sources-disagree",
    );
    expect(findings).toEqual([
      {
        ruleId: "runtime/sources-disagree",
        severity: "warning",
        title: "Node.js version sources disagree",
        message: expect.stringMatching(
          /^apps\/web\/\.nvmrc pins Node\.js 24, but apps\/web\/package\.json engines\.node allows "20\.x"\. /,
        ),
        fix: "Make every pin and the engines.node range agree on one major version.",
        sourceUrl: "https://docs.npmjs.com/cli/v10/configuring-npm/package-json#engines",
        locations: [
          { file: "apps/web/.nvmrc", line: 1, column: 1 },
          { file: "apps/web/package.json", line: 4, column: 14 },
        ],
        target: NODE_24,
      },
    ]);
  });

  it("doesn't flag a library whose engines allow the app's pin", () => {
    expect(
      rule(
        findingsIn("fixtures/rules/runtime-sources-disagree/negative"),
        "runtime/sources-disagree",
      ),
    ).toEqual([]);
  });

  it("flags two pins with different majors once, however many packages they cover", () => {
    const findings = runtimeFindings({
      declarations: [pin(".nvmrc", v("20")), pin(".node-version", v("22.11.0"))],
      packageDirs: ["", "apps/a", "apps/b"],
      targets: [NODE_24],
      entries,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });
    expect(rule(findings, "runtime/sources-disagree").map((f) => f.locations)).toEqual([
      [
        { file: ".node-version", line: 1, column: 1 },
        { file: ".nvmrc", line: 1, column: 1 },
      ],
    ]);
  });

  it("uses a package's own pin over a parent's, like nvm", () => {
    const findings = runtimeFindings({
      declarations: [
        pin(".nvmrc", v("20")),
        pin("apps/web/.nvmrc", v("24")),
        engines("apps/web/package.json", ">=24"),
      ],
      packageDirs: ["apps/web"],
      targets: [NODE_24],
      entries,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });
    expect(rule(findings, "runtime/sources-disagree")).toEqual([]);
  });

  it("never compares across packages", () => {
    const findings = runtimeFindings({
      declarations: [pin("apps/a/.nvmrc", v("20")), pin("apps/b/.nvmrc", v("24"))],
      packageDirs: ["apps/a", "apps/b"],
      targets: [NODE_24],
      entries,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });
    expect(rule(findings, "runtime/sources-disagree")).toEqual([]);
  });

  it("compares majors only, maps an LTS codename to its major, and never flags lts/*", () => {
    const run = (a: NodeVersionDeclaration["version"], b: NodeVersionDeclaration["version"]) =>
      rule(
        runtimeFindings({
          declarations: [pin(".nvmrc", a), pin(".node-version", b)],
          packageDirs: [""],
          targets: [NODE_24],
          entries,
          scannedAt: SCANNED_AT,
          defaultTarget: false,
        }),
        "runtime/sources-disagree",
      ).length;
    expect(run(v("22"), v("22.11.0"))).toBe(0);
    expect(run({ kind: "lts", codename: "iron" }, v("20.16.0"))).toBe(0);
    expect(run({ kind: "lts", codename: "iron" }, v("22"))).toBe(1);
    expect(run({ kind: "unpinned", alias: "lts/*" }, v("18"))).toBe(0);
    expect(run({ kind: "lts", codename: "nonexistent" }, v("18"))).toBe(0);
  });

  it("checks a pin against engines.node by major: >=20.9 allows a 20 pin, 20.x doesn't allow 24", () => {
    const run = (version: string, range: string) =>
      rule(
        runtimeFindings({
          declarations: [pin(".nvmrc", v(version)), engines("package.json", range)],
          packageDirs: [""],
          targets: [NODE_24],
          entries,
          scannedAt: SCANNED_AT,
          defaultTarget: false,
        }),
        "runtime/sources-disagree",
      ).length;
    expect(run("20", ">=20.9")).toBe(0);
    expect(run("24", "20.x")).toBe(1);
    expect(run("24", "^20 || ^22 || ^24")).toBe(0);
    expect(run("24", "")).toBe(0);
  });
});

describe("which packages a declaration covers", () => {
  const disagreeing = (declarations: NodeVersionDeclaration[], packageDirs: string[]) =>
    rule(
      runtimeFindings({
        declarations,
        packageDirs,
        targets: [NODE_24],
        entries,
        scannedAt: SCANNED_AT,
        defaultTarget: false,
      }),
      "runtime/sources-disagree",
    );

  it("doesn't let a pin in one folder reach a sibling folder", () => {
    expect(
      disagreeing(
        [pin("apps/a/.nvmrc", v("20")), pin("apps/b/.node-version", v("24"))],
        ["apps/a", "apps/b"],
      ),
    ).toEqual([]);
  });

  it("doesn't let a pin reach a folder that only shares its name as a prefix", () => {
    expect(
      disagreeing(
        [pin("apps/web/.nvmrc", v("20")), engines("apps/webapp/package.json", ">=24")],
        ["apps/webapp"],
      ),
    ).toEqual([]);
  });

  it("applies a package's engines.node to that package only, not to folders below it", () => {
    expect(
      disagreeing(
        [engines("package.json", "20.x"), pin("apps/web/.nvmrc", v("24"))],
        ["", "apps/web"],
      ),
    ).toEqual([]);
  });

  it("picks the nearest pin of a kind whatever order the declarations come in", () => {
    const own = pin("apps/web/.nvmrc", v("24"));
    const parent = pin(".nvmrc", v("20"));
    const range = engines("apps/web/package.json", ">=24");
    expect(disagreeing([own, parent, range], ["apps/web"])).toEqual([]);
    expect(disagreeing([parent, own, range], ["apps/web"])).toEqual([]);
  });

  it("lets a parent folder's pin reach a nested package and check its engines.node", () => {
    expect(
      disagreeing(
        [pin(".nvmrc", v("24")), engines("packages/lib/package.json", "20.x")],
        ["packages/lib"],
      ).map((f) => f.locations),
    ).toEqual([
      [
        { file: ".nvmrc", line: 1, column: 1 },
        { file: "packages/lib/package.json", line: 3, column: 14 },
      ],
    ]);
  });

  it("checks a volta.node pin against engines.node in the same package.json, lines in order", () => {
    const volta: NodeVersionDeclaration = {
      source: "volta",
      location: { file: "package.json", line: 6, column: 14 },
      version: v("24.1.0"),
    };
    const findings = disagreeing([volta, engines("package.json", "20.x", 3)], [""]);
    expect(findings.map((f) => [f.locations, f.message.split(". ")[0]])).toEqual([
      [
        [
          { file: "package.json", line: 3, column: 14 },
          { file: "package.json", line: 6, column: 14 },
        ],
        'package.json engines.node allows "20.x", but package.json volta.node pins Node.js 24.1.0',
      ],
    ]);
  });

  it("names the pins in file order in the message, and reports packages in folder order", () => {
    const findings = disagreeing(
      [
        pin("b/.nvmrc", v("20")),
        pin("b/.node-version", v("24")),
        pin("a/.nvmrc", v("18")),
        pin("a/.node-version", v("22")),
      ],
      ["b", "a"],
    );
    expect(findings.map((f) => f.message.split(". ")[0])).toEqual([
      "a/.node-version pins Node.js 22, but a/.nvmrc pins Node.js 18",
      "b/.node-version pins Node.js 24, but b/.nvmrc pins Node.js 20",
    ]);
  });
});

describe("runtime/below-target", () => {
  it("flags a pin below the target and an engines range entirely below it", () => {
    const findings = rule(
      findingsIn("fixtures/rules/runtime-below-target/positive"),
      "runtime/below-target",
    );
    expect(findings.map((f) => [f.locations, f.severity, f.message.split(". ")[0]])).toEqual([
      [
        [{ file: ".nvmrc", line: 1, column: 1 }],
        "warning",
        ".nvmrc pins Node.js 20, below the target Node.js 24",
      ],
      [
        [{ file: "package.json", line: 4, column: 14 }],
        "warning",
        'package.json engines.node allows "20.x", below the target Node.js 24',
      ],
    ]);
  });

  it("doesn't flag a pin at the target or a range that reaches it", () => {
    expect(
      rule(findingsIn("fixtures/rules/runtime-below-target/negative"), "runtime/below-target"),
    ).toEqual([]);
  });
});

describe("runtime/end-of-life", () => {
  it("flags a pin whose major ended before the scan date", () => {
    const findings = rule(
      findingsIn("fixtures/rules/runtime-end-of-life/positive"),
      "runtime/end-of-life",
    );
    expect(findings.map((f) => [f.locations, f.message.split(". ")[0]])).toEqual([
      [
        [{ file: ".nvmrc", line: 1, column: 1 }],
        ".nvmrc pins Node.js 18, which reached end-of-life on 2025-04-30",
      ],
    ]);
  });

  it("doesn't flag a supported major", () => {
    expect(
      rule(findingsIn("fixtures/rules/runtime-end-of-life/negative"), "runtime/end-of-life"),
    ).toEqual([]);
  });

  it("dates end-of-life by the scan date, not the clock", () => {
    const run = (today: string) =>
      runtimeFindings({
        declarations: [pin(".nvmrc", v("20"))],
        packageDirs: [""],
        targets: [NODE_24],
        entries,
        scannedAt: `${today}T23:59:59.000Z`,
        defaultTarget: false,
      }).filter((f) => f.ruleId === "runtime/end-of-life").length;
    expect(run("2026-04-30")).toBe(0); // Node.js 20's last day, even late in the day
    expect(run("2026-05-01")).toBe(1);
  });
});

describe("runtime/end-of-life for LTS codenames", () => {
  it("dates lts/<codename> by its line", () => {
    const findings = runtimeFindings({
      declarations: [pin(".nvmrc", { kind: "lts", codename: "hydrogen" })],
      packageDirs: [""],
      targets: [NODE_24],
      entries,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });
    expect(rule(findings, "runtime/end-of-life").map((f) => f.message.split(". ")[0])).toEqual([
      ".nvmrc pins lts/hydrogen (Node.js 18), which reached end-of-life on 2025-04-30",
    ]);
  });
});

describe("runtime/below-target under the default target (Sreeram, ADR-021)", () => {
  const NODE_26: Target = { tool: "node", version: "26" };
  const severity = (fixture: string, defaultTarget: boolean) =>
    rule(findingsIn(fixture, [NODE_26], defaultTarget), "runtime/below-target").map(
      (f) => f.severity,
    );

  it("is info for Node.js 24, which has at least 12 months of support left", () => {
    expect(severity("fixtures/rules/runtime-below-target/default-target-24", true)).toEqual([
      "info",
    ]);
  });

  it("is a warning for Node.js 22, which has less than 12 months left", () => {
    expect(severity("fixtures/rules/runtime-below-target/default-target-22", true)).toEqual([
      "warning",
    ]);
  });

  it("is never softened for an explicit --target", () => {
    expect(severity("fixtures/rules/runtime-below-target/default-target-22", false)).toEqual([
      "warning",
    ]);
    expect(severity("fixtures/rules/runtime-below-target/default-target-24", false)).toEqual([
      "warning",
    ]);
  });

  it("counts the 12 months from the scan date, and softens a range by its newest line", () => {
    const run = (version: NodeVersionDeclaration["version"], scannedAt: string) =>
      runtimeFindings({
        declarations: [
          { source: "nvmrc", location: { file: ".nvmrc", line: 1, column: 1 }, version },
        ],
        packageDirs: [""],
        targets: [NODE_26],
        defaultTarget: true,
        entries,
        scannedAt,
      }).map((f) => f.severity);
    // Node.js 24 ends 2028-04-30: info until 2027-04-30, a warning after.
    expect(run(v("24"), "2027-04-30T00:00:00Z")).toEqual(["info"]);
    expect(run(v("24"), "2027-05-01T00:00:00Z")).toEqual(["warning"]);
    expect(run({ kind: "range", range: "^22 || ^24" }, SCANNED_AT)).toEqual(["info"]);
    expect(run(v("24"), "not a date")).toEqual(["warning"]);
  });
});

describe("runtime findings: more coverage and edges", () => {
  const all = (
    declarations: NodeVersionDeclaration[],
    packageDirs: string[] = [""],
    targets = [NODE_24],
  ) =>
    runtimeFindings({
      declarations,
      packageDirs,
      targets,
      entries,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });

  it("applies volta.node to its own package only (Volta needs extends to share it)", () => {
    const volta: NodeVersionDeclaration = {
      source: "volta",
      location: { file: "package.json", line: 6, column: 14 },
      version: v("20.16.0"),
    };
    expect(
      rule(
        all([volta, engines("apps/web/package.json", "24.x")], ["", "apps/web"]),
        "runtime/sources-disagree",
      ),
    ).toEqual([]);
  });

  it("reads a package folder given with a trailing slash", () => {
    expect(
      rule(
        all(
          [pin("apps/web/.nvmrc", v("24")), engines("apps/web/package.json", "20.x")],
          ["apps/web/"],
        ),
        "runtime/sources-disagree",
      ),
    ).toHaveLength(1);
  });

  it("lets a pin in a non-root parent folder reach the packages below it", () => {
    expect(
      rule(
        all([pin("apps/.nvmrc", v("20")), engines("apps/web/package.json", "24.x")], ["apps/web"]),
        "runtime/sources-disagree",
      ),
    ).toHaveLength(1);
  });

  it.each([">=26", "^22 || ^26", ">=24", "*"])(
    "doesn't flag the range %j as below the target",
    (range) => {
      expect(rule(all([engines("package.json", range)]), "runtime/below-target")).toEqual([]);
    },
  );

  it("dates 0.x lines by their own line", () => {
    expect(
      rule(all([pin(".nvmrc", v("0.10"))]), "runtime/end-of-life").map(
        (f) => f.message.split(". ")[0],
      ),
    ).toEqual([".nvmrc pins Node.js 0.10, which reached end-of-life on 2016-10-31"]);
  });

  it("never treats a range semver can't read as a disagreement or below the target", () => {
    const findings = all([pin(".nvmrc", v("24")), engines("package.json", "not a range")]);
    expect(findings).toEqual([]);
  });

  it.each(["99999999999999999999", "24garbage", "lts", "", "026", "026.1.0"])(
    "produces nothing, and doesn't throw, for the target %j",
    (version) => {
      expect(all([pin(".nvmrc", v("20"))], [""], [{ tool: "node", version }])).toEqual([]);
    },
  );

  it("skips end-of-life when the scan date can't be read", () => {
    const findings = runtimeFindings({
      declarations: [pin(".nvmrc", v("18"))],
      packageDirs: [""],
      targets: [NODE_24],
      entries,
      scannedAt: "yesterday",
      defaultTarget: false,
    });
    expect(rule(findings, "runtime/end-of-life")).toEqual([]);
  });

  it("stays fast for a repository with 10,000 packages", () => {
    const packageDirs = Array.from(
      { length: 10_000 },
      (_, i) => `packages/group${i % 100}/pkg${i}`,
    );
    const declarations = [
      pin(".nvmrc", v("24")),
      ...packageDirs.map((dir) => engines(`${dir}/package.json`, ">=20")),
    ];
    const start = performance.now();
    expect(all(declarations, packageDirs)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("runtime findings in general", () => {
  it("produces nothing without a Node.js target", () => {
    expect(
      findingsIn("fixtures/rules/runtime-below-target/positive", [{ tool: "next", version: "16" }]),
    ).toEqual([]);
  });

  it("produces nothing when the target isn't a version", () => {
    expect(
      findingsIn("fixtures/rules/runtime-below-target/positive", [
        { tool: "node", version: "lts" },
      ]),
    ).toEqual([]);
  });

  it("produces nothing at all for a repo that pins the target and allows it", () => {
    expect(findingsIn("fixtures/rules/runtime-end-of-life/negative")).toEqual([]);
  });

  it("skips a rule whose catalog entry is missing, and leaves out a fix the entry doesn't have", () => {
    const withoutFix = entries
      .filter((e) => e.id !== "runtime/end-of-life")
      .map((e) => (e.id === "runtime/below-target" ? { ...e, fix: undefined } : e))
      .map(({ fix, ...rest }) => (fix === undefined ? rest : { ...rest, fix }));
    const findings = runtimeFindings({
      declarations: [pin(".nvmrc", v("18"))],
      packageDirs: [""],
      targets: [NODE_24],
      entries: withoutFix,
      scannedAt: SCANNED_AT,
      defaultTarget: false,
    });
    expect(findings.map((f) => f.ruleId)).toEqual(["runtime/below-target"]);
    expect(findings[0]).not.toHaveProperty("fix");
  });

  it("gives the same findings in the same order for the same input", () => {
    const fixture = "fixtures/rules/runtime-sources-disagree/positive";
    expect(JSON.stringify(findingsIn(fixture))).toBe(JSON.stringify(findingsIn(fixture)));
  });
});
