import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The build step that copies the catalog into the package (T-033b): it copies regular `.yaml`
// entries only, and follows no symbolic link, as the catalog loader doesn't (CodeRabbit on #24).
const script = fileURLToPath(new URL("../scripts/copy-catalog.mjs", import.meta.url));

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copy(from: string, to: string) {
  return spawnSync(process.execPath, [script, from, to], { encoding: "utf8" });
}

describe("copy-catalog.mjs", () => {
  it("copies the .yaml entries and leaves the README behind", () => {
    const dir = mkdtempSync(join(tmpdir(), "neukee-copy-"));
    temps.push(dir);
    const from = join(dir, "catalog");
    mkdirSync(join(from, "runtime"), { recursive: true });
    writeFileSync(join(from, "README.md"), "# Catalog\n");
    writeFileSync(join(from, "runtime", "entry.yaml"), "id: runtime/entry\n");
    writeFileSync(join(from, "runtime", "notes.txt"), "not an entry\n");
    const to = join(dir, "out");
    mkdirSync(to);
    writeFileSync(join(to, "stale.yaml"), "from an earlier build\n");
    expect(copy(from, to).status).toBe(0);
    expect(readdirSync(to, { recursive: true }).map(String).sort()).toEqual([
      "runtime",
      expect.stringMatching(/^runtime[\\/]entry\.yaml$/),
    ]);
  });

  it("follows no symbolic link: a dangling README link doesn't stop the build, a linked entry isn't copied", (context) => {
    const dir = mkdtempSync(join(tmpdir(), "neukee-copy-"));
    temps.push(dir);
    const from = join(dir, "catalog");
    mkdirSync(from);
    writeFileSync(join(from, "entry.yaml"), "id: entry\n");
    writeFileSync(join(dir, "outside.yaml"), "id: outside\n");
    try {
      symlinkSync(join(dir, "missing"), join(from, "README.md")); // dangling
      symlinkSync(join(dir, "outside.yaml"), join(from, "linked.yaml")); // points at a real file
    } catch (error) {
      // Only a developer's Windows without the symlink privilege skips; CI has it (GitHub's Windows
      // runners do), so there a missing privilege fails instead of hiding the regression.
      const denied =
        error instanceof Error &&
        "code" in error &&
        ["EPERM", "EACCES"].includes(String(error.code));
      if (process.platform === "win32" && denied && !process.env.CI) context.skip();
      throw error;
    }
    const to = join(dir, "out");
    const result = copy(from, to);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(to, "entry.yaml"))).toBe(true);
    expect(existsSync(join(to, "linked.yaml"))).toBe(false);
    expect(existsSync(join(to, "README.md"))).toBe(false);
  });
});
