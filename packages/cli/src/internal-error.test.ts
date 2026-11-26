import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// The scanner promises never to throw; if it ever does, the CLI must still exit cleanly.
vi.mock("@neukee/scanner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@neukee/scanner")>()),
  scan: () => {
    throw new TypeError("boom: /home/someone/secret-project/.env");
  },
}));

const { run } = await import("./run.js");

describe("an unexpected error", () => {
  it("exits 3 with a short message that names no path and shows no stack", () => {
    const empty = fileURLToPath(new URL("../../../fixtures/repos/empty", import.meta.url));
    const result = run(["scan", empty], { color: false });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("internal error (TypeError)");
    expect(result.stderr).toContain("https://github.com/neukee/neukee/issues");
    expect(result.stderr).not.toContain("boom");
    expect(result.stderr).not.toContain("/home/");
    expect(result.stderr).not.toContain("    at ");
  });
});
