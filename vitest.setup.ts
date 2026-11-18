/**
 * The scanner must never use the network (docs/ARCHITECTURE.md §7, ADR-002).
 * Every test runs with fetch, outgoing sockets and DNS blocked, so any accidental
 * network call fails loudly instead of passing quietly.
 */
import dns from "node:dns";
import net from "node:net";

const message = (what: string) =>
  `Network access is blocked in tests (${what}). The scanner must never use the network.`;

globalThis.fetch = (() => Promise.reject(new Error(message("fetch")))) as typeof fetch;

net.Socket.prototype.connect = function blockedConnect(): never {
  throw new Error(message("socket connect"));
} as never;

dns.lookup = function blockedLookup(): never {
  throw new Error(message("DNS lookup"));
} as never;
