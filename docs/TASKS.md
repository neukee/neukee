# Tasks

**How this file works.** Tasks run strictly in order unless a task's `Depends on` says otherwise. Each task is small enough to finish in one sitting, ends with the full quality gate passing, and leaves everything built before it still working. Claude picks the first `todo` task whose dependencies are `done` (`/next`). There are no daily deadlines; the only date is the scanner launch target, **December 6, 2026**. `/checkpoint` tells you whether the remaining work fits.

**Status values:** `todo` · `in-progress` · `done` · `blocked` (with a reason) · `needs-human` (waiting for a person).

**Human review:** `yes` means the task's output goes into `docs/REVIEW-QUEUE.md` and is not considered finished until a qualified person has looked at it. Building may continue on the next task meanwhile.

**Verify (every task):** `pnpm verify` must pass. Tasks list extra checks where needed.

---

## Phase 0 — Foundation

### T-000 · Repository scaffold

- Status: done
- Depends on: —
- Human review: no
- Built: pnpm workspace, strict TypeScript, Biome, Vitest with network blocked in tests, `packages/core`, `packages/scanner` (oxc-parser smoke test), `packages/cli` (`--version`), CI workflow, Claude Code setup.
- Done when: `pnpm install && pnpm verify` passes locally. ✔

### T-001 · GitHub repository and protections

- Status: todo
- Depends on: T-000
- Human review: yes (you do this; Claude gives instructions)
- Build (follow the workbench setup checklist): confirm ADR-005 first. Create the repo (public per ADR-005), push `main`. Turn on: branch protection for `main` (require a PR, require the `verify` and `quality` checks, no force pushes), secret scanning with push protection, Dependabot alerts, CodeQL default setup, 2FA on your account. Install the CodeRabbit GitHub app on the repo. Replace `@YOUR_GITHUB_USERNAME` in `.github/CODEOWNERS`.
- Done when: a test PR shows `verify` and `quality` running and blocking merge until green, and CodeRabbit reviews it (comment `@coderabbitai review` while the repo has fewer than 10 stars).

### T-002 · Core types and JSON Schema

- Status: todo
- Depends on: T-000
- Human review: no
- Build: Finalize `ScanReport`, `Finding`, `Target`, `Location`, `Diagnostic`, `Severity` in `packages/core` exactly as in `docs/ARCHITECTURE.md` §5. Export a JSON Schema for `ScanReport` (hand-written, in `packages/core/schema/scan-report.v1.json`). Add `validateReport(json)`.
- Done when:
  - [ ] A valid example report passes validation; five deliberately broken ones fail with clear messages.
  - [ ] Types and schema agree (a test builds a report through the types and validates it against the schema).

### T-003 · Catalog format, loader and validator

- Status: todo
- Depends on: T-002
- Human review: no
- Build: `loadCatalog(dir)` in `packages/core` reads `catalog/**/*.yaml`, validates each entry (required fields, `id` matches file path, `sourceUrl` is https and on an allowed official domain list, severity valid, fixture paths exist), returns typed entries. Add one real entry: `next16/sync-request-apis` (verify its text against the Next.js 16 upgrade guide; paste the exact URL).
- Done when:
  - [ ] Invalid entries (missing source, unknown severity, missing fixture) produce clear errors naming the file.
  - [ ] A test fails if any entry in `catalog/` lacks a source or fixtures.

### T-004 · Fixture harness, snapshots and dependency rule

- Status: todo
- Depends on: T-002
- Human review: no
- Build: Test helper `scanFixture(name, targets)` that runs the scan pipeline on `fixtures/repos/<name>` and returns a normalized report (removes `scannedAt`, `durationMs`). Golden snapshot helper. A test that fails if any package imports from a package to its left in the dependency direction (`docs/ARCHITECTURE.md` §3).
- Done when:
  - [ ] An empty fixture repo produces a stable snapshot.
  - [ ] Introducing a forbidden import (tried in a test) is caught.

### T-005 · File discovery

- Status: todo
- Depends on: T-004
- Human review: no
- Build: Walk the repo: respect `.gitignore` (nested too), always skip `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`; skip files over 1 MB (record as skipped); never follow symlinks outside the root; return repo-relative paths with forward slashes on all OSes.
- Done when:
  - [ ] Fixture with nested `.gitignore`, a symlink pointing outside, a 2 MB file and a `node_modules` folder gives exactly the expected file list.
  - [ ] Test passes on Windows in CI (paths use `/`).

### T-006 · Change-signature schema

- Status: todo
- Depends on: T-002
- Human review: yes (Sreeram confirms nothing identifying can leak)
- Build: `ChangeSignature` type and JSON Schema in `packages/core` per ADR-006: package name, from and to versions, change category, verdict, catalog entry id (if any), and a SHA-256 hash of the normalized change shape. No code, paths, test names, hostnames or values. Nothing uses it yet; it exists so the format never needs a breaking change.
- Done when:
  - [ ] Schema and type agree (test).
  - [ ] A test feeds a change containing a path, a hostname and a secret-looking value and proves none of them appear in the signature.

## Phase 1 — Detectors

### T-010 · Runtime sources: version files and package.json

- Status: todo
- Depends on: T-005
- Human review: no
- Build: Read `.nvmrc`, `.node-version`, `package.json` `engines.node` and `volta.node`. Normalize (`v22` → `22`, ranges kept as ranges, `lts/*` → unpinned).
- Done when:
  - [ ] Fixtures cover each source and each odd format; every declared version comes back with its file and line.

### T-011 · Runtime sources: Dockerfiles

- Status: todo
- Depends on: T-010
- Human review: no
- Build: All `Dockerfile*` files; `FROM node:<tag>` incl. `--platform=…`, `AS stage`, digests (`node:22@sha256:…`), `ARG`-based tags (report as unresolved).
- Done when: fixtures for multi-stage, platform flag, digest and ARG cases pass.

### T-012 · Runtime sources: GitHub Actions

- Status: todo
- Depends on: T-010
- Human review: no
- Build: `.github/workflows/*.yml`: `actions/setup-node` steps' `node-version` (incl. matrix references) and `node-version-file`.
- Done when: fixtures with a matrix `[20, 22]`, a literal and a version file pass.

### T-013 · Runtime sources: deployment config

- Status: todo
- Depends on: T-010
- Human review: no
- Build: `netlify.toml` `NODE_VERSION`; `serverless.yml` `provider.runtime` and per-function `runtime`; AWS SAM `template.yaml` `Runtime: nodejsXX.x`; `vercel.json` (document that Vercel's Node version is usually a project setting, so report "not declared in repo").
- Done when: one fixture per source passes.

### T-014 · Runtime findings

- Status: todo
- Depends on: T-011, T-012, T-013
- Human review: no
- Build: `catalog/node/releases.yaml` with each Node major's end-of-life date (source: the official Node.js release schedule). Findings: `runtime/below-target`, `runtime/sources-disagree`, `runtime/end-of-life`.
- Done when: a fixture where `.nvmrc` says 24 but the Dockerfile says 20 produces `sources-disagree` pointing at both lines.

### T-015 · Lockfile: package-lock.json

- Status: todo
- Depends on: T-005
- Human review: no
- Build: v2/v3 `packages` map → resolved versions, direct vs transitive, `hasInstallScript`. Add `fast-check` (ADR-007) and property-based tests: the parser never throws on arbitrary input.
- Done when: fixtures from real `npm install` output (small) parse exactly; a corrupt lockfile gives a diagnostic, not a crash.

### T-016 · Lockfile: pnpm-lock.yaml

- Status: todo
- Depends on: T-015
- Human review: no
- Build: lockfile versions 6, 7 (if present), 9; importers for workspaces.
- Done when: fixtures for v6 and v9 parse to the same normalized structure as the npm fixture of the same dependencies.

### T-017 · Lockfile: yarn.lock v1

- Status: todo
- Depends on: T-015
- Human review: no
- Build: small hand-written parser (no new dependency unless justified in DECISIONS.md).
- Done when: fixture with multiple ranges resolving to one version parses correctly.

### T-018 · Lockfile: Yarn Berry

- Status: todo
- Depends on: T-017
- Human review: no
- Done when: Berry fixture parses; `__metadata` handled; PnP noted as unsupported in the report.

### T-019 · Framework detection and rule matching

- Status: todo
- Depends on: T-016, T-018, T-003
- Human review: no
- Build: Detect installed `next`, `react`, `react-dom`, `prisma`, `@prisma/client`, `express` versions (lockfile first, `package.json` fallback marked as "range only"). Implement matching from `docs/SPEC-SCANNER.md` §2.5.
- Done when: a rule for Next 16 fires for a Next 15 project, not for a Next 16 project, and says "current version unknown" when undetectable.

### T-020 · Native addons

- Status: todo
- Depends on: T-019
- Human review: yes (verify each row of `native-addons.yaml` against the package's own release notes)
- Build: `catalog/native-addons.yaml` (start with `sharp`, `bcrypt`, `better-sqlite3`, `canvas`, `node-sass`), each row with its source URL. Detector compares installed versions with the first version supporting the target Node major.
- Done when: fixtures for an old `bcrypt` and a current one give the right result.

### T-021 · AST infrastructure

- Status: todo
- Depends on: T-005
- Human review: no
- Build: Parse each source file with `oxc-parser`; a small visitor helper; line/column from offsets; parse errors become diagnostics; parse files in parallel only if measurement shows it is needed.
- Done when: a file with a syntax error is reported and skipped; the rest of the fixture scans.

### T-022 · Next.js 16: synchronous request APIs

- Status: todo
- Depends on: T-021, T-019
- Human review: no
- Build: detect `cookies()`, `headers()`, `draftMode()` from `next/headers` used without `await` or `use()`; `params`/`searchParams` props read without `await` in pages, layouts and route handlers.
- Done when: positive fixture (6 cases) and negative fixture (awaited, `use()`, aliased import, unrelated `cookies` function) all behave correctly.

### T-023 · Next.js 16: config and file rules

- Status: todo
- Depends on: T-022
- Human review: no
- Build: `next16/middleware-to-proxy`, `next16/webpack-config`, `next16/removed-config`, `next16/next-lint-script`, `next16/parallel-route-default`, `next16/segment-config-cache-components`. Each with a catalog entry, source URL and fixtures.
- Done when: all six have passing positive and negative fixtures.

### T-024 · Research: Node.js 26 removals

- Status: todo
- Depends on: —
- Human review: yes (a person checks the list against the release notes)
- Build: Read the official Node.js 26 release notes and migration guidance; write `docs/research/node26.md` listing each removed or runtime-deprecated API, its source link, and whether it can be detected statically.
- Done when: every row has a link to the official source; no row is from memory.

### T-025 · Node.js rules

- Status: todo
- Depends on: T-021, T-024
- Human review: no
- Build: `node24/url-parse`, `node24/child-process-shell-args`, `node24/openssl-security-level` (info), `node-any/md4-hash`, plus the statically detectable rules from T-024.
- Done when: each rule has fixtures and a sourced catalog entry.

### T-026 · Next.js 15: fetch caching default (info)

- Status: todo
- Depends on: T-022
- Human review: no
- Done when: a server-side `fetch` without explicit cache options in a Next 14 project produces an info finding for target `next@15`.

### T-027 · Research: compare MergeWarden

- Status: todo
- Depends on: —
- Human review: no
- Build: read MergeWarden's public docs; write `docs/research/mergewarden.md`: what it checks, how (static policy, LLM review, or runtime), pricing, and where Neukee differs. Sources linked; nothing from memory.
- Done when: the comparison is written and `docs/BRIEF.md` §6 is updated (propose the change; Sreeram approves).

## Phase 2 — Output and CLI

### T-030 · Report assembly

- Status: todo
- Depends on: T-014, T-019
- Human review: no
- Build: run all detectors, deduplicate, sort deterministically, compute stats, attach diagnostics.
- Done when: scanning the same fixture twice gives byte-identical JSON (except `scannedAt`).

### T-031 · Terminal and markdown renderers

- Status: todo
- Depends on: T-030
- Human review: no
- Done when: snapshot tests for both formats on three fixture repos; markdown renders correctly on GitHub (paste into a test PR once).

### T-032 · JSON and SARIF

- Status: todo
- Depends on: T-030
- Human review: no
- Done when: JSON output validates against the schema; SARIF validates against the SARIF 2.1.0 schema (vendored copy) and uploads cleanly in a test repo (manual check, note it in PROGRESS).

### T-033 · CLI

- Status: todo
- Depends on: T-031, T-032
- Human review: no
- Build: `neukee scan` with all options in `docs/SPEC-SCANNER.md` §1, exit codes, `--help` text, friendly errors. Remove the temporary `ignoreDependencies` for `packages/cli` from `knip.json`.
- Done when: e2e tests run the built CLI as a child process on fixtures and check output and exit codes.

### T-034 · Fleet mode

- Status: todo
- Depends on: T-033
- Human review: no
- Done when: three fixture repos produce one combined markdown report with a summary table.

### T-035 · Performance benchmark

- Status: todo
- Depends on: T-033
- Human review: no
- Build: a generated 100,000-line fixture (script, not committed output); measure time and peak memory.
- Done when: the result is recorded in PROGRESS against target 4; if it misses, open a decision.

### T-036 · Network-free end-to-end check in CI

- Status: todo
- Depends on: T-033
- Human review: no
- Build: a CI job that runs the CLI e2e tests with networking disabled (e.g. `unshare -n` on Linux).
- Done when: the job passes, and a deliberately added `fetch` in a branch makes it fail.

### T-037 · Corpus job (nightly)

- Status: todo
- Depends on: T-033
- Human review: no
- Build: `corpus/repos.yaml` lists 100+ public Node.js and Next.js repos, each pinned to a commit SHA (mixed sizes and package managers). A script clones them shallowly in CI only (never in tests), runs the CLI, and compares the JSON output with stored expectations. The nightly workflow fails on any crash, timeout (over 60 s), or unexpected output change.
- Done when: the job runs green nightly; a deliberately broken detector in a branch makes it fail.

### T-038 · Mutation score target

- Status: todo
- Depends on: T-033
- Human review: no
- Build: raise the Stryker `break` threshold to 80% for `packages/core` and `packages/scanner` by strengthening tests (never by excluding files without an ADR).
- Done when: the nightly mutation job passes at 80%.

## Phase 3 — GitHub Action

### T-040 · GitHub Action

- Status: todo
- Depends on: T-033
- Human review: yes (permissions and supply chain)
- Build: `packages/action` with `action.yml`, esbuild bundle committed under `dist/`, inputs `targets`, `fail-on`, `sarif`, `path`; writes the markdown report to the job summary; documentation of required permissions.
- Done when: the Action runs on a test repo, writes the summary, uploads SARIF when enabled, and fails the job only per `fail-on`.

## Phase 4 — Validation and launch

### T-050 · Validation on 10 public repos

- Status: todo
- Depends on: T-033
- Human review: yes (every finding is checked by hand)
- Build: choose 10 public Next.js/Node repos of different sizes and package managers (criteria and list in `docs/VALIDATION.md`); run `/validate-repo` on each; mark every finding `confirmed`, `false-positive` or `unsure`.
- Done when: precision is computed and recorded against target 1.

### T-051 · Fix what validation found

- Status: todo
- Depends on: T-050
- Human review: no
- Done when: every false positive has a fix and a regression fixture; precision re-measured.

### T-052 · Security review

- Status: todo
- Depends on: T-040
- Human review: yes (a qualified person, not Claude alone)
- Build: checklist in `docs/SECURITY-REVIEW.md` (network, file writes, path traversal, symlinks, YAML and regex denial of service, dependency list, Action permissions, release signing, OpenSSF Scorecard results); external reviewer signs off. Actions are already SHA-pinned (ADR-007); confirm Dependabot keeps them current.
- Done when: all items checked and the reviewer's notes are resolved.

### T-053 · Name, packages and release pipeline

- Status: todo
- Depends on: T-033
- Human review: yes (you own the npm and GitHub accounts)
- Build: final name decision (trademark checked), npm package names available, Changesets, release workflow publishing with npm provenance from GitHub Actions, Action version tags.
- Done when: a dry-run release produces correct packages; nothing is published yet.

### T-054 · Documentation

- Status: todo
- Depends on: T-033
- Human review: no
- Done when: README quickstart works from a clean machine in 60 seconds; every rule has a docs page generated from its catalog entry.

### T-055 · Launch

- Status: todo
- Depends on: T-050, T-051, T-052, T-053, T-054
- Human review: yes (you press publish)
- Done when: v0.1.0 on npm with provenance, Action tagged `v0`, README live, launch post drafted (Show HN, LinkedIn, blog).

### T-056 · UpgradeBench

- Status: todo
- Depends on: T-033 (collection can start earlier)
- Human review: yes (each regression is checked against its GitHub issue)
- Build: `bench/` with 50 real upgrade regressions from public GitHub issues (Node.js and Next.js majors, pg, Prisma, undici, ioredis): the repo and commit, the upgrade, the issue link, and a reproduction test. A runner reports catch rates for: tests alone, the scanner, record/replay tools where runnable, and the engine once it exists.
- Done when: 50 cases reproduce; results table published in `bench/README.md` (target: public by April 30, 2027).

## Phase E — Engine (after launch; detailed later)

- **E-001 Competitive spike (first):** in a small demo app, upgrade `pg` or `ioredis` by one major version and change behavior the tests don't assert. Run Tusk Drift's demo replay, Keploy and the Neukee approach (real database containers, no mock of the upgraded library). Record which tools catch the change. Due by Dec 31.
- E-002 Recorder spike · E-003 Noise spike · E-004 Replay spike — see `docs/SPEC-ENGINE.md` §3. All: human review yes.
