# Tasks

**How this file works.** Tasks run strictly in order unless a task's `Depends on` says otherwise. Each task is small enough to finish in one sitting, ends with the full quality gate passing, and leaves everything built before it still working. Claude picks the first `todo` task whose dependencies are `done` (`/next`). There are no daily deadlines; the only date is the scanner launch target, **Tuesday, December 8, 2026** (validation checkpoint December 7; ADR-013). `/checkpoint` tells you whether the remaining work fits.

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

- Status: done
- Depends on: T-000
- Human review: yes (you do this; Claude gives instructions)
- Build (follow the workbench setup checklist): confirm ADR-005 first. Create the repo (public per ADR-005), push `main`. Turn on: branch protection for `main` (require a PR, require the `verify` and `quality` checks, no force pushes), secret scanning with push protection, Dependabot alerts, CodeQL default setup, 2FA on your account. Install the CodeRabbit GitHub app on the repo. Replace `@YOUR_GITHUB_USERNAME` in `.github/CODEOWNERS`.
- Done when: a test PR shows `verify` and `quality` running and blocking merge until green, and CodeRabbit reviews it (comment `@coderabbitai review` while the repo has fewer than 10 stars). ✔ PR #1 (2026-11-22): the Windows `verify` jobs failed on CRLF checkouts and blocked merge until `.gitattributes` forced LF; all nine checks then passed, CodeRabbit included, and it was squash-merged.

### T-002 · Core types and JSON Schema

- Status: done
- Depends on: T-000
- Human review: no
- Build: Finalize `ScanReport`, `Finding`, `Target`, `Location`, `Diagnostic`, `Severity` in `packages/core` exactly as in `docs/ARCHITECTURE.md` §5. Export a JSON Schema for `ScanReport` (hand-written, in `packages/core/schema/scan-report.v1.json`). Add `validateReport(json)`.
- Done when:
  - [x] A valid example report passes validation; five deliberately broken ones fail with clear messages. (22 hand-written broken cases with exact messages, plus one generated violation per schema constraint.)
  - [x] Types and schema agree (a test builds a report through the types and validates it against the schema). (Also field sets, required vs optional fields and enums are compared both ways; the constraint inventory is a snapshot.)

### T-003 · Catalog format, loader and validator

- Status: done
- Depends on: T-002
- Human review: no
- Build: `loadCatalog(dir)` in `packages/core` reads `catalog/**/*.yaml`, validates each entry (required fields, `id` matches file path, `sourceUrl` is https and on an allowed official domain list, severity valid, fixture paths exist), returns typed entries. Validate `id` with the same grammar as the report's `ruleId` (ADR-011); share one pattern from core rather than copying it. Add one real entry: `next16/sync-request-apis` (verify its text against the Next.js 16 upgrade guide; paste the exact URL).
- Done when:
  - [x] Invalid entries (missing source, unknown severity, missing fixture) produce clear errors naming the file.
  - [x] A test fails if any entry in `catalog/` lacks a source or fixtures. The real-catalog test checks that sources are official and that fixture folders exist (ADR-014).

### T-004 · Fixture harness, snapshots and dependency rule

- Status: done
- Depends on: T-002
- Human review: no
- Build: Test helper `scanFixture(name, targets)` that runs the scan pipeline on `fixtures/repos/<name>` and returns a normalized report (replaces `scannedAt` with the fixed value `1970-01-01T00:00:00Z`, so the normalized report still passes `validateReport`; it is the only field that varies between runs; ADR-011). Golden snapshot helper. A test that fails if any package imports from a package to its left in the dependency direction (`docs/ARCHITECTURE.md` §3).
- Done when:
  - [x] An empty fixture repo produces a stable snapshot. `fixtures/expected/empty.json`; scanning twice gives identical JSON; an edited or missing golden file fails, and CI never writes one.
  - [x] Introducing a forbidden import (tried in a test) is caught: by package name, by a relative path into another package, through `import()` and through `require()`.
  - [x] Fixture and golden names resolving outside their respective folders are rejected, including traversal and symlinks.

### T-005a · .gitignore matcher

- Status: done (PR #9, `0a4fa24`)
- Depends on: T-004
- Human review: no
- Build: `packages/scanner/src/gitignore.ts`. It parses a `.gitignore` into rules once and matches repo-relative paths, with git's semantics for wildcards, classes, escapes, negation, directory-only, anchored and `**` rules, and nesting. It builds no regular expressions from rule text, and its work per path is capped by a step budget (past it: "too-costly", fail open). Lines over 1 KiB, POSIX classes, unclosed classes and trailing backslashes are dropped as problems (fail open). ADR-015.
- Done when:
  - [x] It agrees with real git on every case of a table generated once with `git check-ignore` (`fixtures/gitignore/cases.json`, generated by `fixtures/gitignore/generate.mjs`; git is never run by tests or the scanner).
  - [x] Hostile rules within the caps (2,000 rules of 1 KiB) get an answer or "too-costly" within a generous time bound per path, one test per shape from the T-005 review and the T-005a review (segment-heavy rules, 1,100-segment paths, 255-byte names). A heavy real-world `.gitignore` never reaches the budget.
  - [x] Empty, CRLF, BOM, over-long and malformed input is tested.

### T-005b · File discovery

- Status: done (PR #8, `43767f3`)
- Depends on: T-005a
- Human review: no
- Build: walk the repo:
  - apply `.gitignore` files with the T-005a matcher (nested too), within ADR-015's caps: 64 KiB per `.gitignore` and 2,000 rules in force. Over a cap, skip with a diagnostic naming the file and keep scanning (fail open);
  - always skip `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`;
  - skip files over 1 MB (record as skipped);
  - never follow any symlink, inside or outside the root: report it as skipped with a diagnostic (ADR-015);
  - return repo-relative paths with forward slashes on all OSes. A path that fails the report schema's `RepoPath` pattern (ADR-011; test it with `isRepoPath` from core, not by restating the rules) is skipped with a diagnostic that has no `file`.
  - This is PR #8, reworked from the original T-005 to use T-005a.
- Done when:
  - [ ] Fixture with nested `.gitignore`, a symlink pointing outside, a 2 MB file and a `node_modules` folder gives exactly the expected file list.
  - [ ] Test passes on Windows in CI (paths use `/`).
  - [ ] Each scanned file is read through a single handle: open it, `fstat` that handle, and read at most the size cap from it. Anything that isn't a regular file is skipped. Use no-follow where the platform supports it (`O_NOFOLLOW`); otherwise `lstat` plus `realpath` containment inside the scan root. Tests run in Linux and Windows CI. (Scanned repos are hostile; ARCHITECTURE §7.)
  - [x] Mutation score of `discover.ts` at least 80%. (89.0%.)

### T-005c · Scan-wide matching budget

- Status: done (PR #11, `d149e9f`)
- Depends on: T-005b
- Human review: no
- Build: foundational (Opus). On top of ADR-015's budget of 1,000,000 steps per path, cap the `.gitignore` matching work for the whole scan. Once it is spent, the rest of the scan applies no `.gitignore` rules (fail open), with one diagnostic. Sreeram, 2026-11-23.
- Done when:
  - [x] `.gitignore` matching for a whole scan takes under 10 s in the worst case, whatever the repository: tests run T-005a's hostile shapes across many paths.
  - [x] Running out of the scan budget keeps the rest of the files in the scan and reports exactly one diagnostic.
  - [x] A large real-world `.gitignore` (300 varied rules) never runs out of the scan budget on a 25,000-path repository (Sreeram, 2026-11-23).
  - [x] A `.gitignore` that can't be applied (over a cap, unreadable, or past the rules-in-force limit) makes its folder's subtree apply no inherited rules either, so a parent rule can't exclude a file the skipped file would have re-included (fail open; CodeRabbit on PR #10, folded in by Sreeram, 2026-11-24).

## Phase 1a — Thin end-to-end path (Sreeram, 2026-11-23)

After T-005b and T-005c: one runtime finding all the way to the terminal. Goal: by **Saturday, Nov 28**, `neukee scan` runs on a real public repository and prints a real finding. Each task is scoped to what the path needs; the remaining detectors (Phase 1), then JSON and SARIF (T-032), follow in their existing order. Same gates on every task.

Guardrails (Sreeram, 2026-11-23):

- T-014 and T-030 are built to their full interfaces in `docs/ARCHITECTURE.md`, implementing only what this path needs. Nothing a later task has to undo.
- Saturday is a target, not a deadline. If a gate fails, the date moves.
- Every finding on a real repository must be one its maintainer would agree with. Each false positive and false negative goes in `docs/VALIDATION.md`, with the repository and commit.
- The thin path's output is internal. Nothing is published until the launch scope is done.

### T-010 · Runtime sources: version files and package.json

- Status: done (PR #15, `f983a69`)
- Depends on: T-005b
- Human review: no
- Review: on Opus (Sreeram, 2026-11-24). The first detector sets the pattern later runtime sources copy; routine detectors after it use Sonnet.
- Build: Read `.nvmrc`, `.node-version`, `package.json` `engines.node` and `volta.node`. Normalize (`v22` → `22`, ranges kept as ranges, `lts/*` → unpinned).
- Done when:
  - [x] Fixtures cover each source and each odd format; every declared version comes back with its file and line.

### T-014 · Runtime findings

- Status: done (PR #17, `26b53eb`; wording follow-up PR #19)
- Depends on: T-010
- Human review: no
- Build: Node release data (not under `catalog/`, where every `*.yaml` is an entry, ADR-014; for example `packages/core/data/node-releases.yaml`) with each Node major's end-of-life date (source: the official Node.js release schedule). Findings: `runtime/below-target`, `runtime/sources-disagree`, `runtime/end-of-life`.
- Scope (thin path, 2026-11-23): works from T-010's sources. Dockerfile (T-011) and GitHub Actions (T-012) sources plug in later.
- Done when: a fixture where `.nvmrc` says 24 but `package.json` `engines.node` says 20 produces `sources-disagree` pointing at both lines.

### T-030 · Report assembly

- Status: done (PR #20, `2a04356`)
- Depends on: T-014
- Human review: no
- Build: run the detectors that exist, deduplicate, sort deterministically, compute stats, attach diagnostics. Scope (thin path, 2026-11-23): runtime findings first; framework-rule findings join when T-019 lands.
- Done when: scanning the same fixture twice gives byte-identical JSON (except `scannedAt`).

### T-031 · Terminal and markdown renderers

- Status: in-progress
- Depends on: T-030
- Human review: no
- Note: any text that came from the scanned repo (paths in diagnostics, version strings, package names) is untrusted. Neutralise control and bidi-override characters and escape markdown before rendering.
- Done when: snapshot tests for both formats on three fixture repos; markdown renders correctly on GitHub (paste into a test PR once).

### T-033 · CLI

- Status: todo
- Depends on: T-031
- Human review: no
- Build: `neukee scan` with the options in `docs/SPEC-SCANNER.md` §1 except the JSON and SARIF formats, which T-032 adds (thin path, 2026-11-23), exit codes, `--help` text, friendly errors. Remove the temporary `ignoreDependencies` for `packages/cli` from `knip.json`.
- Note: the report has no timing (ADR-011: only `scannedAt` varies). Timing can return later behind an opt-in flag (for example `--timing`, printed to stderr or as a separate field added under the compatibility policy). It is never part of the default output.
- Done when: e2e tests run the built CLI as a child process on fixtures and check output and exit codes.

## Phase 1 — Detectors

### T-005d · Dropped negations fail open

- Status: todo
- Depends on: T-005c, T-033 (after the thin path; it must not delay T-010)
- Human review: no
- Build: foundational (Opus). A `.gitignore` line that `parseIgnoreFile` drops (a POSIX class, over 1 KiB, an unclosed `[`, a trailing backslash) might be a negation that re-includes files. Treat a `.gitignore` with a dropped `!` line like one that can't be applied: rules from parent folders stop applying in its folder and below (fail open), with a diagnostic that says so. Sreeram, 2026-11-24.
- Done when:
  - [ ] A regression test: a root `.gitignore` of `*.js`, and `src/.gitignore` holding `!*[[:digit:]].js` (dropped as a POSIX class). `src/1.js` is scanned; `dropped.js` at the root stays ignored.
  - [ ] A same-file regression test: a root `.gitignore` holding both `*.js` and `!*[[:digit:]].js`. The file's own rules stop too, so root `1.js` is scanned.
  - [ ] A dropped line that isn't a negation changes nothing beyond today's diagnostic.
  - [ ] ADR-015 records the rule.

### T-011 · Runtime sources: Dockerfiles

- Status: todo
- Depends on: T-010
- Human review: no
- Build: All `Dockerfile*` files; `FROM node:<tag>` incl. `--platform=…`, `AS stage`, digests (`node:22@sha256:…`), `ARG`-based tags (report as unresolved).
- Done when: its sources join T-014's findings: a fixture where `.nvmrc` says 24 but the Dockerfile says 20 produces `sources-disagree` pointing at both lines. Also: fixtures for multi-stage, platform flag, digest and ARG cases pass.

### T-012 · Runtime sources: GitHub Actions

- Status: todo
- Depends on: T-010
- Human review: no
- Build: `.github/workflows/*.yml`: `actions/setup-node` steps' `node-version` (incl. matrix references) and `node-version-file`.
- Done when: its sources join T-014's findings: a fixture where `.nvmrc` says 24 but a workflow's `node-version` says 20 produces `sources-disagree` pointing at both lines. Also: fixtures with a matrix `[20, 22]`, a literal and a version file pass.

### T-015 · Lockfile: package-lock.json

- Status: todo
- Depends on: T-005b
- Human review: no
- Build: v2/v3 `packages` map → resolved versions, direct vs transitive, `hasInstallScript`. Add `fast-check` (ADR-007) and property-based tests: the parser never throws on arbitrary input.
- Done when: fixtures from real `npm install` output (small) parse exactly; a corrupt lockfile gives a diagnostic, not a crash; lockfile parsers accept CRLF input; a CRLF fixture lives under `fixtures/**/crlf/` (`.gitattributes` keeps those files byte-exact).

### T-016 · Lockfile: pnpm-lock.yaml

- Status: todo
- Depends on: T-015
- Human review: no
- Build: lockfile versions 6, 7 (if present), 9; importers for workspaces.
- Done when: fixtures for v6 and v9 parse to the same normalized structure as the npm fixture of the same dependencies.

### T-019 · Framework detection and rule matching

- Status: todo
- Depends on: T-016, T-003
- Human review: no
- Build: Detect installed `next`, `react`, `react-dom`, `prisma`, `@prisma/client`, `express` versions (lockfile first, `package.json` fallback marked as "range only"). Implement matching from `docs/SPEC-SCANNER.md` §2.5. Yarn lockfiles are post-launch (ADR-013). A repo with `yarn.lock` gets a diagnostic saying Yarn lockfiles aren't supported yet, and its versions come from `package.json` as "range only".
- Done when: a rule for Next 16 fires for a Next 15 project, not for a Next 16 project, and says "current version unknown" when undetectable.

### T-020 · Native addons: install-time builds (minimal)

- Status: todo
- Depends on: T-015, T-016
- Human review: no
- Build: from the lockfile's install-script flags only (npm `hasInstallScript`, and pnpm's equivalent if its lockfile format records one: check the format before relying on it), flag each dependency that runs an install script, typically a native build. Such a package has to be rebuilt, and often updated, for a new Node major. No version table, no network lookups (ADR-013). One catalog entry with an official source explaining why native addons depend on the Node version, fetched and quoted, never from memory. The finding names the package and the lockfile line. It says the flag shows an install script, which is usually but not always a native build.
- Done when: a fixture lockfile with an install-script dependency produces the finding at the right line; a lockfile without one produces none; a lockfile in a format that records no such flag produces a diagnostic, not a guess. This is the headline finding of the outreach pitch.

### T-021 · AST infrastructure

- Status: todo
- Depends on: T-005b
- Human review: no
- Build: Parse each source file with `oxc-parser`; a small visitor helper; line/column from offsets (1-based, columns in UTF-16 code units; ADR-011); parse errors become diagnostics; parse files in parallel only if measurement shows it is needed.
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

### T-027 · Research: compare MergeWarden

- Status: moved to the strategy chat (Sreeram, 2026-11-23). Not a repo task.

## Phase 2 — Output and CLI

### T-032 · JSON and SARIF

- Status: todo
- Depends on: T-030, T-033 (adds `--format json` and `--format sarif` to the CLI)
- Human review: no
- Note: findings may have no `locations` (repo-wide). Check whether GitHub code scanning needs a location on every SARIF result; if it does, use a documented fallback (for example the manifest that declared the version). Set `run.columnKind: "utf16CodeUnits"` explicitly, to match the report's columns (ADR-011).
- Done when: JSON output validates against the schema; SARIF validates against the SARIF 2.1.0 schema (vendored copy) and uploads cleanly in a test repo (manual check, note it in PROGRESS).

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
- Note: not a launch blocker (ADR-013). It reviews the packaged Action too, so it follows T-040, and it's due by Mar 31 (brief §7). It moves; it isn't cut.
- Build: checklist in `docs/SECURITY-REVIEW.md` (network, file writes, path traversal, symlinks, YAML and regex denial of service, dependency list, Action permissions, release signing, OpenSSF Scorecard results); external reviewer signs off. Actions are already SHA-pinned (ADR-007); confirm Dependabot keeps them current.
- Done when: all items checked and the reviewer's notes are resolved.

### T-053 · Name, packages and release pipeline

- Status: todo
- Depends on: T-033
- Human review: yes (you own the npm and GitHub accounts)
- Build: trademark search for Neukee (USPTO, EUIPO, India; ADR-008), Changesets, and a release workflow that publishes through **npm trusted publishing (OIDC)** from GitHub Actions, which adds provenance automatically. No npm token is ever stored in GitHub (ADR-009). Action version tags.
- Done when: a dry-run release produces correct packages; nothing is published yet.

### T-054 · Documentation

- Status: todo
- Depends on: T-033
- Human review: no
- Build: README quickstart. A copy-paste GitHub workflow replaces the packaged Action at launch (ADR-013): it installs and runs the CLI, writes SARIF, and uploads it with GitHub's official SARIF upload action, pinned to a commit SHA (ADR-007), with `security-events: write` only for that job.
- Done when: README quickstart works from a clean machine in 60 seconds; the copy-paste workflow runs once in a test repo and the findings appear in code scanning (manual check, noted in PROGRESS); every rule has a docs page generated from its catalog entry.

### T-055 · Launch

- Status: todo
- Depends on: T-050, T-051, T-053, T-054
- Human review: yes (you press publish)
- Build: trusted publishing can't do a package's first publish. Sreeram publishes v0.1.0 of each package once from his laptop with 2FA, then sets each package's trusted publisher (repo `neukee/neukee`, the release workflow) on npmjs.com and turns on "require 2FA and disallow tokens". Every later release goes through GitHub Actions.
- Done when: v0.1.0 on npm with provenance, trusted publishing configured for every package, README live with the copy-paste workflow, launch post drafted (Show HN, LinkedIn, blog).

## Phase 5 — Post-launch (first 2 weeks)

Deferred from launch by ADR-013 (Option A, 2026-11-22). The order is Sreeram's. T-013, T-035 and T-036 moved here on 2026-11-23 (ADR-017). T-026 and T-038 were deferred too and come last. Nothing here blocks T-055.

### T-017 · Lockfile: yarn.lock v1

- Status: todo
- Depends on: T-015
- Human review: no
- Build: small hand-written parser (no new dependency unless justified in DECISIONS.md).
- Done when: fixture with multiple ranges resolving to one version parses correctly.

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
- Note: besides the Node 26 rules, this task also carries `node24/url-parse`, `node24/child-process-shell-args`, `node24/openssl-security-level` and `node-any/md4-hash`. All of them are post-launch with it (ADR-013, Option A).
- Build: `node24/url-parse`, `node24/child-process-shell-args`, `node24/openssl-security-level` (info), `node-any/md4-hash`, plus the statically detectable rules from T-024.
- Done when: each rule has fixtures and a sourced catalog entry.

### T-040 · GitHub Action

- Status: todo
- Depends on: T-033
- Human review: yes (permissions and supply chain)
- Note: at launch, the README's copy-paste workflow covers CI use (T-054). This packages it as `uses: neukee/neukee@v0`.
- Build: `packages/action` with `action.yml`, esbuild bundle committed under `dist/`, inputs `targets`, `fail-on`, `sarif`, `path`; writes the markdown report to the job summary; documentation of required permissions. `validateReport` reads `schema/scan-report.v1.json` relative to its module, so if the bundle calls it, ship `schema/` next to the bundle and test that path.
- Done when: the Action runs on a test repo, writes the summary, uploads SARIF when enabled, and fails the job only per `fail-on`.

### T-018 · Lockfile: Yarn Berry

- Status: todo
- Depends on: T-017
- Human review: no
- Done when: Berry fixture parses; `__metadata` handled; PnP noted as unsupported in the report.

### T-037 · Corpus job (nightly)

- Status: todo
- Depends on: T-033
- Human review: no
- Build: `corpus/repos.yaml` lists 100+ public Node.js and Next.js repos, each pinned to a commit SHA (mixed sizes and package managers). A script clones them shallowly in CI only (never in tests), runs the CLI, and compares the JSON output with stored expectations. The nightly workflow fails on any crash, timeout (over 60 s), or unexpected output change.
- Done when: the job runs green nightly; a deliberately broken detector in a branch makes it fail.

### T-034 · Fleet mode

- Status: todo
- Depends on: T-033
- Human review: no
- Note: fleet JSON wraps each report as `{ repo, report }`; each report keeps `root: "."` and stays valid on its own (ADR-011).
- Done when: three fixture repos produce one combined markdown report with a summary table.

### T-006 · Change-signature schema

- Status: todo
- Depends on: T-002
- Human review: yes (Sreeram confirms nothing identifying can leak)
- Build: `ChangeSignature` type and JSON Schema in `packages/core` per ADR-006: package name, from and to versions, change category, verdict, catalog entry id (if any), and a SHA-256 hash of the normalized change shape. No code, paths, test names, hostnames or values. Nothing uses it yet; it exists so the format never needs a breaking change.
- Done when:
  - [ ] Schema and type agree (test).
  - [ ] A test feeds a change containing a path, a hostname and a secret-looking value and proves none of them appear in the signature.

### T-013 · Runtime sources: deployment config

- Status: todo
- Depends on: T-010
- Human review: no
- Build: `netlify.toml` `NODE_VERSION`; `serverless.yml` `provider.runtime` and per-function `runtime`; AWS SAM `template.yaml` `Runtime: nodejsXX.x`; `vercel.json` (document that Vercel's Node version is usually a project setting, so report "not declared in repo").
- Done when: one fixture per source passes.

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

### T-026 · Next.js 15: fetch caching default (info)

- Status: todo
- Depends on: T-022
- Human review: no
- Done when: a server-side `fetch` without explicit cache options in a Next 14 project produces an info finding for target `next@15`.

### T-038 · Mutation score target

- Status: todo
- Depends on: T-033
- Human review: no
- Build: raise the Stryker `break` threshold to 80% for `packages/core` and `packages/scanner` by strengthening tests (never by excluding files without an ADR).
- Done when: the nightly mutation job passes at 80%.

## Phase 6 — Benchmark (by April 30, 2027)

### T-056 · UpgradeBench

- Status: todo
- Depends on: T-033 (collection can start earlier)
- Human review: yes (each regression is checked against its GitHub issue)
- Build: `bench/` with 50 real upgrade regressions from public GitHub issues (Node.js and Next.js majors, pg, Prisma, undici, ioredis): the repo and commit, the upgrade, the issue link, and a reproduction test. A runner reports catch rates for: tests alone, the scanner, record/replay tools where runnable, and the engine once it exists.
- Done when: 50 cases reproduce; results table published in `bench/README.md` (target: public by April 30, 2027).

## Phase E — Engine (after launch; detailed later)

- **E-001 Competitive spike (first):** in a small demo app, upgrade `pg` or `ioredis` by one major version and change behavior the tests don't assert. Run Tusk Drift's demo replay, Keploy and the Neukee approach (real database containers, no mock of the upgraded library). Record which tools catch the change. Due by Dec 31.
- E-002 Recorder spike · E-003 Noise spike · E-004 Replay spike — see `docs/SPEC-ENGINE.md` §3. All: human review yes.
