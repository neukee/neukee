import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Windows has no O_NOFOLLOW, so discovery checks each file with lstat before opening it. This
// file runs that path on every OS by hiding O_NOFOLLOW, then swaps a file for a link to another
// file inside the root right after its folder is listed.
const race = vi.hoisted(() => ({ nested: "", target: "", linkTo: "", didSwap: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    constants: { ...actual.constants, O_NOFOLLOW: 0 },
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      const entries = actual.readdirSync(...args);
      if (!race.didSwap && args[0] === race.nested) {
        race.didSwap = true;
        actual.unlinkSync(race.target);
        actual.symlinkSync(race.linkTo, race.target);
      }
      return entries;
    },
  };
});

import { discoverFiles } from "./discover.js";

const roots: string[] = [];

afterEach(async () => {
  Object.assign(race, { nested: "", target: "", linkTo: "", didSwap: false });
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * File symlinks on Windows need administrator rights or Developer Mode. GitHub's Windows runners
 * have them, so CI runs this test on every platform; it skips only where links can't be made.
 */
function canLinkFiles(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "neukee-link-probe-"));
  try {
    writeFileSync(join(dir, "target"), "");
    symlinkSync(join(dir, "target"), join(dir, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!canLinkFiles())("file discovery without O_NOFOLLOW", () => {
  it("refuses a file swapped for a link to another file inside the root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "neukee-no-nofollow-"));
    roots.push(parent);
    const root = await realpath(parent);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "secret.txt"), "inside");
    await writeFile(join(root, "other.txt"), "other");
    Object.assign(race, {
      nested: join(root, "nested"),
      target: join(root, "nested", "secret.txt"),
      linkTo: join(root, "other.txt"),
    });

    const events = Array.from(discoverFiles(root));
    expect(race.didSwap).toBe(true);
    const files = events.flatMap((event) => (event.type === "file" ? [event.file] : []));
    // Without the lstat check, open follows the link and both post-open checks pass (same file,
    // inside the root), so other.txt's content would come back under the link's name.
    expect(files).toEqual([{ path: "other.txt", content: "other" }]);
    expect(events.filter((event) => event.type === "skipped")).toHaveLength(1);
  });
});
