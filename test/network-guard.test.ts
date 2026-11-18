import dns from "node:dns";
import net from "node:net";
import { describe, expect, it } from "vitest";

describe("network guard", () => {
  it("blocks fetch", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(/Network access is blocked/);
  });

  it("blocks outgoing sockets", () => {
    expect(() => net.connect(443, "example.com")).toThrow(/Network access is blocked/);
  });

  it("blocks DNS lookups", () => {
    expect(() => dns.lookup("example.com", () => undefined)).toThrow(/Network access is blocked/);
  });
});
