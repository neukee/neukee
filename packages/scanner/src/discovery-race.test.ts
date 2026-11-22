import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const race = vi.hoisted(() => ({
  mode: "",
  root: "",
  nested: "",
  moved: "",
  outside: "",
  target: "",
  didSwap: false,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      if (race.mode === "open" && !race.didSwap && args[0] === race.target) {
        race.didSwap = true;
        actual.renameSync(race.nested, race.moved);
        actual.symlinkSync(race.outside, race.nested, "junction");
        try {
          return actual.openSync(...args);
        } finally {
          actual.unlinkSync(race.nested);
          actual.renameSync(race.moved, race.nested);
        }
      }
      return actual.openSync(...args);
    },
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      const entries = actual.readdirSync(...args);
      if (race.mode === "readdir" && !race.didSwap && args[0] === race.root) {
        race.didSwap = true;
        actual.renameSync(race.nested, race.moved);
        actual.symlinkSync(race.outside, race.nested, "junction");
      }
      return entries;
    },
  };
});

import { discoverFiles } from "./discover.js";

const roots: string[] = [];

afterEach(async () => {
  if (race.mode === "readdir" && race.didSwap) {
    await rm(race.nested);
    await rename(race.moved, race.nested);
  }
  Object.assign(race, {
    mode: "",
    root: "",
    nested: "",
    moved: "",
    outside: "",
    target: "",
    didSwap: false,
  });
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function setupRace(): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "neukee-discovery-race-"));
  roots.push(parent);
  const root = join(parent, "repo");
  const nested = join(root, "nested");
  const outside = join(parent, "outside");
  const moved = join(parent, "original");
  await mkdir(nested, { recursive: true });
  await mkdir(outside);
  await writeFile(join(nested, "secret.txt"), "inside");
  await writeFile(join(outside, "secret.txt"), "outside");
  await writeFile(join(outside, "bad\u202e.txt"), "hidden");

  race.root = await realpath(root);
  race.nested = join(race.root, "nested");
  race.moved = moved;
  race.outside = await realpath(outside);
  race.target = join(race.nested, "secret.txt");
  race.didSwap = false;
}

describe("discovery path races", () => {
  it("does not return a file opened through an external directory symlink", async () => {
    await setupRace();
    race.mode = "open";

    const events = Array.from(discoverFiles(race.root));
    const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
    expect(race.didSwap).toBe(true);
    expect(files.some((file) => file.content === "outside")).toBe(false);
  });

  it("does not descend into a directory replaced by an external symlink", async () => {
    await setupRace();
    race.mode = "readdir";

    const events = Array.from(discoverFiles(race.root));
    const diagnostics = events.flatMap((event) =>
      event.type === "diagnostic" ? [event.diagnostic] : [],
    );
    expect(race.didSwap).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.file === "nested/secret.txt")).toBe(false);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.message === "Skipped a path invalid for report output.",
      ),
    ).toBe(false);
  });
});
