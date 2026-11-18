# Decisions

One entry per decision that changes architecture, dependencies, schemas, targets or scope. Newest first. Format: context → decision → consequences. Claude adds an entry whenever a task makes such a change, and never deletes old ones (superseded entries are marked as such).

---

## ADR-004 · Allowed runtime dependencies (2026-11-18)

- **Context:** a security tool's dependency tree is part of what buyers review.
- **Decision:** runtime dependencies allowed without a new decision: `oxc-parser`, `yaml`, `semver`, `ignore` (for `.gitignore` matching). Anything else needs its own entry: why, maintenance status, install scripts, transitive count.
- **Consequences:** target 9 (< 40 transitive runtime dependencies) stays reachable.

## ADR-003 · The catalog is YAML with mandatory official sources (2026-11-18)

- **Context:** a wrong catalog entry is the fastest way to lose trust.
- **Decision:** one YAML file per entry; `sourceUrl` must be an official source on an allowed domain list; every entry has positive and negative fixtures; tests enforce both.
- **Consequences:** entries are slower to write and much harder to get wrong.

## ADR-002 · Local-first: no network, no server (2026-11-18)

- **Context:** customers will run this on private code; EU buyers and security teams care most about data leaving their network.
- **Decision:** the scanner and engine make no network calls and run only on the user's machine or CI. No telemetry. Enforced by tests.
- **Consequences:** no usage analytics from the product; adoption is measured through npm downloads, GitHub stars and conversations.

## ADR-001 · Stack (2026-11-18)

- **Decision:** TypeScript (strict, ESM), Node ≥ 22, pnpm workspaces, `tsc` builds, esbuild for the Action bundle, Vitest, Biome, oxc-parser, GitHub Actions, Changesets with npm provenance.
- **Why:** the users' own ecosystem; the fewest tools that cover build, test, lint and release; parsing that does not depend on the TypeScript compiler API.
- **Consequences:** contributors need only Node and pnpm.
