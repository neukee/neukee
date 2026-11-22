import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, join as joinPath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const race = vi.hoisted(() => ({
  mode: "",
  root: "",
  nested: "",
  moved: "",
  outside: "",
  target: "",
  /** For "swap-at": listing `swapAt` replaces folder `swapPath` with a link to `linkTo`. */
  swapAt: "",
  swapPath: "",
  linkTo: "",
  didSwap: false,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      if (race.mode === "file-link" && !race.didSwap && args[0] === race.target) {
        race.didSwap = true;
        actual.unlinkSync(race.target);
        actual.symlinkSync(join(race.outside, "secret.txt"), race.target);
        return actual.openSync(...args);
      }
      if (race.mode === "open-persist" && !race.didSwap && args[0] === race.target) {
        race.didSwap = true;
        actual.renameSync(race.nested, race.moved);
        actual.symlinkSync(race.outside, race.nested, "junction");
        return actual.openSync(...args);
      }
      if (race.mode === "fifo" && !race.didSwap && args[0] === race.target) {
        race.didSwap = true;
        actual.unlinkSync(race.target);
        execFileSync("mkfifo", [race.target]);
        // Without O_NONBLOCK this open waits forever for a writer, so a regression hangs the test.
        return actual.openSync(...args);
      }
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
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      // Runs after the handle's fstat: the file shrinks between sizing the buffer and reading it.
      if (race.mode === "shrink" && !race.didSwap && args[0] === race.target) {
        race.didSwap = true;
        actual.truncateSync(race.target, 2);
      }
      return actual.statSync(...args);
    },
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      const entries = actual.readdirSync(...args);
      if (race.mode === "swap-at" && !race.didSwap && args[0] === race.swapAt) {
        race.didSwap = true;
        actual.renameSync(race.swapPath, race.moved);
        actual.symlinkSync(race.linkTo, race.swapPath, "junction");
      }
      if (race.mode === "reverse" && args[0] === race.root && Array.isArray(entries)) {
        return [...entries].reverse() as typeof entries;
      }
      if (race.mode === "readdir" && !race.didSwap && args[0] === race.root) {
        race.didSwap = true;
        actual.renameSync(race.nested, race.moved);
        actual.symlinkSync(race.outside, race.nested, "junction");
      }
      return entries;
    },
  };
});

import { type DiscoveryEvent, discoverFiles } from "./discover.js";

const roots: string[] = [];

afterEach(async () => {
  if ((race.mode === "readdir" || race.mode === "open-persist") && race.didSwap) {
    await rm(race.nested);
    await rename(race.moved, race.nested);
  }
  if (race.mode === "swap-at" && race.didSwap) {
    await rm(race.swapPath);
    await rename(race.moved, race.swapPath);
  }
  Object.assign(race, {
    mode: "",
    root: "",
    nested: "",
    moved: "",
    outside: "",
    target: "",
    swapAt: "",
    swapPath: "",
    linkTo: "",
    didSwap: false,
  });
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const UNSAFE_NESTED = {
  level: "warning",
  message: "Skipped a directory that is not safely inside the scan root.",
  file: "nested",
};

function pathsOf(events: DiscoveryEvent[]): string[] {
  return events.flatMap((event) => (event.type === "file" ? [event.file.path] : []));
}

async function setupRace(): Promise<void> {
  const base = await mkdtemp(join(tmpdir(), "neukee-discovery-race-"));
  roots.push(base);
  // base/p/repo, so a test can point a link at the folder above the root's parent too.
  const parent = join(base, "p");
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
    expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
    expect(diagnostics).toEqual([UNSAFE_NESTED]);
  });

  it("does not descend into a directory replaced by a link to a folder inside the repo", async () => {
    await setupRace();
    await mkdir(join(race.root, "other"));
    await writeFile(join(race.root, "other", "planted.txt"), "planted");
    race.mode = "swap-at";
    race.swapAt = race.root;
    race.swapPath = race.nested;
    race.linkTo = join(race.root, "other");

    const events = Array.from(discoverFiles(race.root));
    expect(race.didSwap).toBe(true);
    expect(pathsOf(events).filter((path) => path.startsWith("nested"))).toEqual([]);
    expect(events).toContainEqual({ type: "diagnostic", diagnostic: UNSAFE_NESTED });
  });

  // A folder swapped for a link above it makes a deeper folder resolve to the root itself, or to
  // the folder above the root: walking it would loop over the repo or leave it.
  it.each([
    ["the scan root", "repo"],
    ["the folder above the scan root", "p"],
  ])("does not walk a folder that resolves to %s", async (_, name) => {
    await setupRace();
    const a = join(race.root, "a");
    await mkdir(join(a, name), { recursive: true });
    await writeFile(join(a, name, "x.txt"), "x");
    race.mode = "swap-at";
    race.swapAt = a;
    race.swapPath = a;
    race.linkTo = name === "repo" ? dirname(race.root) : dirname(dirname(race.root));

    const events = Array.from(discoverFiles(race.root));
    expect(race.didSwap).toBe(true);
    expect(pathsOf(events).filter((path) => path.startsWith("a/"))).toEqual([]);
    expect(events).toContainEqual({
      type: "diagnostic",
      diagnostic: {
        level: "warning",
        message: "Skipped a directory that is not safely inside the scan root.",
        file: `a/${name}`,
      },
    });
  });

  it("returns only the bytes still there when a file shrinks while it is read", async () => {
    await setupRace();
    race.mode = "shrink";

    const events = Array.from(discoverFiles(race.root));
    expect(race.didSwap).toBe(true);
    expect(events).toContainEqual({
      type: "file",
      file: { path: "nested/secret.txt", content: "in" },
    });
  });

  it("does not return a file whose parent stays swapped for an external link after the open", async () => {
    await setupRace();
    race.mode = "open-persist";

    const events = Array.from(discoverFiles(race.root));
    const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
    expect(race.didSwap).toBe(true);
    expect(files.some((file) => file.content === "outside")).toBe(false);
    expect(events.some((event) => event.type === "skipped")).toBe(true);
  });

  // Creating a file symlink on Windows needs extra privileges, and there O_NOFOLLOW doesn't exist;
  // the lstat pre-check covers it instead.
  it.skipIf(process.platform === "win32")(
    "refuses a file swapped for a link to an outside file just before it is opened",
    async () => {
      await setupRace();
      race.mode = "file-link";

      const events = Array.from(discoverFiles(race.root));
      const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
      expect(race.didSwap).toBe(true);
      expect(files.some((file) => file.content === "outside")).toBe(false);
      expect(events).toContainEqual({
        type: "diagnostic",
        diagnostic: {
          level: "warning",
          message: "Could not read file.",
          file: "nested/secret.txt",
        },
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "skips a file swapped for a FIFO just before it is opened, without hanging",
    async () => {
      await setupRace();
      race.mode = "fifo";

      const events = Array.from(discoverFiles(race.root));
      expect(race.didSwap).toBe(true);
      expect(pathsOf(events)).not.toContain("nested/secret.txt");
      expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
    },
  );

  it("returns files in name order whatever order the file system lists them", async () => {
    await setupRace();
    await writeFile(joinPath(race.root, "a.txt"), "a");
    await writeFile(joinPath(race.root, "z.txt"), "z");
    race.mode = "reverse";

    const files = Array.from(discoverFiles(race.root)).flatMap((event) =>
      event.type === "file" ? [event.file.path] : [],
    );
    expect(files).toEqual(["a.txt", "nested/secret.txt", "z.txt"]);
  });
});
