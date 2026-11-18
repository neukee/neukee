import { describe, expect, it } from "vitest";
import { checkSyntax } from "./index.js";

describe("checkSyntax", () => {
  it("parses TypeScript and TSX without diagnostics", () => {
    expect(checkSyntax("a.ts", "const x: number = 1;\nexport { x };").ok).toBe(true);
    expect(checkSyntax("Page.tsx", "export default function Page() { return <div />; }").ok).toBe(
      true,
    );
  });

  it("turns a syntax error into a diagnostic instead of throwing", () => {
    const result = checkSyntax("broken.ts", "const x: number = ;");
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ level: "warning", file: "broken.ts" });
  });
});
