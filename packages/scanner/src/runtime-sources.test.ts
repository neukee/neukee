import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { discoverFiles } from "./discover.js";
import { type NodeVersionDeclaration, readRuntimeSources } from "./runtime-sources.js";

const fixture = fileURLToPath(new URL("../../../fixtures/repos/runtime-sources/", import.meta.url));

/** Every declaration in a fixture repo, read the way the pipeline reads files. */
function declarationsIn(root: string): NodeVersionDeclaration[] {
  return Array.from(discoverFiles(root)).flatMap((event) =>
    event.type === "file" ? readRuntimeSources(event.file).declarations : [],
  );
}

function read(path: string, content: string) {
  return readRuntimeSources({ path, content });
}

describe("runtime sources in a fixture repo", () => {
  it("finds every declared version with its file, line and column", () => {
    expect(declarationsIn(fixture)).toEqual([
      {
        source: "node-version",
        location: { file: ".node-version", line: 1, column: 1 },
        version: { kind: "version", version: "22.11.0" },
      },
      {
        source: "nvmrc",
        location: { file: ".nvmrc", line: 1, column: 1 },
        version: { kind: "version", version: "22" },
      },
      {
        source: "nvmrc",
        location: { file: "apps/api/.nvmrc", line: 3, column: 1 },
        version: { kind: "unpinned", alias: "node" },
      },
      {
        source: "nvmrc",
        location: { file: "apps/web/.nvmrc", line: 1, column: 1 },
        version: { kind: "lts", codename: "iron" },
      },
      {
        source: "engines",
        location: { file: "apps/web/package.json", line: 3, column: 39 },
        version: { kind: "range", range: ">=20 <23" },
      },
      {
        source: "nvmrc",
        location: { file: "crlf/.nvmrc", line: 1, column: 1 },
        version: { kind: "version", version: "20" },
      },
      {
        source: "engines",
        location: { file: "crlf/package.json", line: 4, column: 13 },
        version: { kind: "range", range: "20.x" },
      },
      {
        source: "engines",
        location: { file: "package.json", line: 8, column: 13 },
        version: { kind: "range", range: ">=22" },
      },
      {
        source: "volta",
        location: { file: "package.json", line: 11, column: 13 },
        version: { kind: "version", version: "22.11.0" },
      },
    ]);
  });
});

describe(".nvmrc", () => {
  it.each([
    ["22", { kind: "version", version: "22" }],
    ["v22", { kind: "version", version: "22" }],
    ["22.11", { kind: "version", version: "22.11" }],
    ["v22.11.0", { kind: "version", version: "22.11.0" }],
    ["lts/*", { kind: "unpinned", alias: "lts/*" }],
    ["lts/iron", { kind: "lts", codename: "iron" }],
    ["node", { kind: "unpinned", alias: "node" }],
    ["stable", { kind: "unpinned", alias: "stable" }],
    ["current", { kind: "unpinned", alias: "current" }],
  ])("reads %s", (text, version) => {
    expect(read(".nvmrc", `${text}\n`)).toEqual({
      declarations: [
        { source: "nvmrc", location: { file: ".nvmrc", line: 1, column: 1 }, version },
      ],
      diagnostics: [],
    });
  });

  // nvm's README: `#` comments, blank lines, surrounding white space and key=value lines are ignored.
  it("skips comments, blank lines, white space and key=value lines", () => {
    const text = "# pinned for production\n\nengine=node\n\t  20.5.1  # trailing comment\n\n";
    expect(read("apps/x/.nvmrc", text).declarations).toEqual([
      {
        source: "nvmrc",
        location: { file: "apps/x/.nvmrc", line: 4, column: 4 },
        version: { kind: "version", version: "20.5.1" },
      },
    ]);
  });

  it("reads CRLF line endings and a byte order mark", () => {
    expect(read(".nvmrc", "﻿# x\r\n22\r\n").declarations).toEqual([
      {
        source: "nvmrc",
        location: { file: ".nvmrc", line: 2, column: 1 },
        version: { kind: "version", version: "22" },
      },
    ]);
  });

  it.each([
    ["an empty file", "", "has no version line"],
    ["only comments", "# nothing here\n\n", "has no version line"],
    ["two version lines", "20\n22\n", "has more than one version line; nvm needs exactly one"],
    ["a control character", "22\u0007\n", "contains a control character; nvm rejects the file"],
    [
      "text that isn't a version",
      "please use node twenty\n",
      "isn't a version the scanner understands",
    ],
    ["a leading zero", "022\n", "isn't a version the scanner understands"],
    ["an uppercase alias", "LTS/Iron\n", "isn't a version the scanner understands"],
  ])("reports %s without echoing it, and declares nothing", (_, text, reason) => {
    expect(read("a/.nvmrc", text)).toEqual({
      declarations: [],
      diagnostics: [
        {
          level: "warning",
          message: `This .nvmrc ${reason}, so its Node.js version wasn't read.`,
          file: "a/.nvmrc",
        },
      ],
    });
  });

  it("reads a huge file of comments quickly", () => {
    const text = `${"# padding padding padding padding\n".repeat(30_000)}24\n`; // about 1 MB
    const start = performance.now();
    expect(read(".nvmrc", text).declarations).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe(".node-version", () => {
  it.each([
    ["22.11.0", { kind: "version", version: "22.11.0" }],
    ["v20", { kind: "version", version: "20" }],
    ["lts/*", { kind: "unpinned", alias: "lts/*" }],
  ])("reads %s", (text, version) => {
    expect(read(".node-version", `${text}\r\n`).declarations).toEqual([
      { source: "node-version", location: { file: ".node-version", line: 1, column: 1 }, version },
    ]);
  });

  // No common standard supports comments in .node-version, so `#` is not stripped.
  it("doesn't treat # as a comment", () => {
    expect(read(".node-version", "22 # prod\n")).toEqual({
      declarations: [],
      diagnostics: [
        {
          level: "warning",
          message:
            "This .node-version isn't a version the scanner understands, so its Node.js version wasn't read.",
          file: ".node-version",
        },
      ],
    });
  });

  it("reports an empty file", () => {
    expect(read(".node-version", "\n").diagnostics).toEqual([
      {
        level: "warning",
        message: "This .node-version has no version line, so its Node.js version wasn't read.",
        file: ".node-version",
      },
    ]);
  });
});

describe("package.json", () => {
  const pkg = (value: unknown) => JSON.stringify(value, null, 2);

  it("reads engines.node as a range and volta.node as a version", () => {
    const text = pkg({ engines: { node: "^20.9 || >=22" }, volta: { node: "20.16.0" } });
    expect(read("package.json", text).declarations).toEqual([
      {
        source: "engines",
        location: { file: "package.json", line: 3, column: 13 },
        version: { kind: "range", range: "^20.9 || >=22" },
      },
      {
        source: "volta",
        location: { file: "package.json", line: 6, column: 13 },
        version: { kind: "version", version: "20.16.0" },
      },
    ]);
  });

  it("keeps a volta.node range as a range", () => {
    expect(read("package.json", pkg({ volta: { node: "^20" } })).declarations).toEqual([
      {
        source: "volta",
        location: { file: "package.json", line: 3, column: 13 },
        version: { kind: "range", range: "^20" },
      },
    ]);
  });

  // JSON.parse keeps the last of duplicate keys, and so does the location.
  it("locates the value JSON.parse keeps for duplicate and escaped keys", () => {
    const text =
      '{"engines": {"node": "18"},\n "\\u0065ngines": {"npm": "9", "node": "18", "node": "22"}}';
    expect(read("package.json", text).declarations).toEqual([
      {
        source: "engines",
        location: { file: "package.json", line: 2, column: 53 },
        version: { kind: "range", range: "22" },
      },
    ]);
  });

  it("ignores node keys outside engines and volta", () => {
    const text = pkg({ scripts: { node: "node x" }, config: { engines: { node: "1" } } });
    expect(read("package.json", text)).toEqual({ declarations: [], diagnostics: [] });
  });

  it("reads a byte order mark and CRLF line endings", () => {
    const text = '﻿{\r\n  "engines": {\r\n    "node": ">=24"\r\n  }\r\n}\r\n';
    expect(read("package.json", text).declarations).toEqual([
      {
        source: "engines",
        location: { file: "package.json", line: 3, column: 13 },
        version: { kind: "range", range: ">=24" },
      },
    ]);
  });

  it.each([
    ["invalid JSON", '{"engines": {"node": ">=20"', "isn't valid JSON"],
    [
      "engines.node that isn't a string",
      pkg({ engines: { node: 22 } }),
      "has an engines.node that isn't a string",
    ],
    [
      "volta.node that isn't a string",
      pkg({ volta: { node: ["22"] } }),
      "has a volta.node that isn't a string",
    ],
    [
      "a range with characters no range uses",
      pkg({ engines: { node: "$(curl x)" } }),
      "has an engines.node that isn't a version range the scanner understands",
    ],
    [
      "an overlong range",
      pkg({ engines: { node: `>=${"1".repeat(300)}` } }),
      "has an engines.node that isn't a version range the scanner understands",
    ],
  ])("reports %s without echoing it", (_, text, reason) => {
    expect(read("pkg/package.json", text)).toEqual({
      declarations: [],
      diagnostics: [
        {
          level: "warning",
          message: `This package.json ${reason}, so its Node.js version wasn't read.`,
          file: "pkg/package.json",
        },
      ],
    });
  });

  it("reads nothing, and says nothing, from a package.json without engines or volta", () => {
    expect(read("package.json", pkg({ name: "x" }))).toEqual({ declarations: [], diagnostics: [] });
    expect(read("package.json", "[]")).toEqual({ declarations: [], diagnostics: [] });
  });

  it("never throws on hostile JSON: deep nesting, a huge file", () => {
    const deep = `{"a": ${"[".repeat(400_000)}${"]".repeat(400_000)}, "engines": {"node": "22"}}`;
    const start = performance.now();
    const result = read("package.json", deep);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(result.declarations.length + result.diagnostics.length).toBe(1);
  });
});

describe("other files", () => {
  it.each(["README.md", "nvmrc", ".nvmrc.bak", "package.json.orig", "src/node-version.ts"])(
    "reads nothing from %s",
    (path) => {
      expect(read(path, "22\n")).toEqual({ declarations: [], diagnostics: [] });
    },
  );
});
