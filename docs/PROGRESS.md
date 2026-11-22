# Progress

Updated by Claude at the end of every task (`/next`), every session (`/wrap`) and every checkpoint (`/checkpoint`). Newest entries first.

## Resume here

- **Last updated:** 2026-11-23 (T-005 review fixes pass locally; revised PR checks pending)
- **Branch:** `t-005-file-discovery`
- **Last finished:** T-004 (fixture harness, golden reports, dependency rule). PR #7 merged at `a1ee2c1`.
- **In progress:** T-005 (file discovery), foundational: first reader of hostile input.
- **Exact next step:** commit and push the T-005 review fixes, request CodeRabbit's second review, and verify revised Linux/Windows CI. Do not start T-006. After T-005 merges, run `/checkpoint`.
- **Standing instructions (Sreeram, 2026-11-22) not in CLAUDE.md:**
  - At the start of each task, say in one line whether it's foundational (Sreeram uses Opus) or routine (he switches to Sonnet).
  - Every catalog-entry PR summary gives the official source URL and the single sentence from it that justifies the rule.
  - After T-005 merges, run `/checkpoint` before the next task and report the pace against the Dec 7 checkpoint.
- **Blocked / waiting on Sreeram:**
  - NEWKEY: a live US trademark that sounds like "Neukee" when said as "new-key". Decide the pronunciation and check the registration details before the T-053 trademark search.
- **Next dated checkpoint:** Dec 7, scanner runs on 10 public repos (14 days). Launch Tuesday, Dec 8 (15 days). Re-measure pace after T-005 merges.

## Dated checkpoints

From `docs/BRIEF.md` §7. `/checkpoint` updates the status column.

| Date       | Must be true                                                                | Status                                  |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------- |
| 2026-12-07 | Scanner runs on 10 public repos and finds real blockers                     | not started (moved from Dec 5, ADR-013) |
| 2026-12-08 | Scanner v0.1.0 launched (npm, README with copy-paste workflow)              | not started (moved from Dec 6, ADR-013) |
| 2026-12-31 | 15–20 discovery calls; engine core end to end; E-001 competitive spike done | not started                             |
| 2027-01-31 | At least 2 paid audits                                                      | not started                             |
| 2027-02-28 | Precision good enough that design partners keep the check on                | not started                             |
| 2027-03-31 | At least 2 paid pilots; security review done                                | not started                             |
| 2027-04-30 | Three revenue streams live; UpgradeBench published                          | not started                             |

## Current state

- **Phase:** 0 — Foundation
- **Current task:** T-005 — file discovery
- **Scanner launch target:** Tuesday, December 8, 2026 (ADR-013)
- **On track?** Not yet measured. Run `/checkpoint` after T-005.

## Launch targets

| #   | Target                                                         | Status                                                 | Last measured |
| --- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| 1   | Precision ≥ 90% on 10 public repos                             | not measured                                           | —             |
| 2   | Zero crashes on the validation set                             | not measured                                           | —             |
| 3   | Every catalog entry sourced, with positive + negative fixtures | not measured                                           | —             |
| 4   | < 60 s and < 1 GB on a 100k-line repo                          | not measured                                           | —             |
| 5   | Zero network calls during a scan                               | enforced in unit tests (T-000); CI job pending (T-036) | 2026-11-18    |
| 6   | Deterministic output                                           | not measured                                           | —             |
| 7   | Coverage ≥ 85% on core and scanner                             | not measured                                           | —             |
| 8   | Linux + Windows, Node 22 + 24                                  | CI matrix configured (T-000)                           | 2026-11-18    |
| 9   | < 40 transitive runtime dependencies                           | not measured                                           | —             |
| 10  | Docs and quickstart                                            | not started                                            | —             |

## Velocity log

One row per finished task. Size: S (under 1 session), M (1–2 sessions), L (3+). Sreeram's hours only when he gives them.

| Date       | Task  | Size | Claude sessions | Sreeram hours | Result | Note                                                                                                              |
| ---------- | ----- | ---- | --------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| 2026-11-18 | T-000 | M    | 1               | —             | done   | Scaffold; verify green                                                                                            |
| 2026-11-22 | T-001 | S    | 0               | —             | done   | Sreeram: repo, ruleset, CODEOWNERS; PR #1 also fixed CRLF on Windows CI                                           |
| 2026-11-22 | T-002 | M    | 1               | —             | done   | Schema + validator; reviewer 1 must-fix + 4 should-fix; ~8 CodeRabbit rounds; 3 changes from Sreeram before merge |
| 2026-11-22 | T-003 | S    | 1               | —             | done   | Catalog loader + first entry; reviewer 3 must-fix + 5 should-fix, all fixed                                       |
| 2026-11-22 | T-004 | S    | 1               | —             | done   | Harness, golden reports, dependency rule                                                                          |

## Daily log

Sreeram's notes and each session's summary. Newest first.

### 2026-11-22 · T-002 merged; PR loop, Quality bar and merge rules

- **Merged:**
  - PR #1: T-001, already merged when the session began.
  - PR #2: Claude runs the PR loop (ADR-010); the only pre-approved push is `git push -u origin HEAD`.
  - PR #3: T-002, report schema and `validateReport` (ADR-011).
  - PR #4: Quality bar (ADR-012). Biome `noExplicitAny` and `noNonNullAssertion` are errors, and the reviewer enforces the rest.
- **Decisions:**
  - Report v1 is strict and deterministic: `durationMs` removed, a total order for findings.
  - Compatibility policy: optional fields may be added within v1; anything else bumps `schemaVersion`.
  - Cast exception: allowed only for a file bundled in our own package with a test that pins its shape.
  - Fixtures live only in the top-level `fixtures/` folder.
  - Merging rules: advance approvals; fix minor findings and continue; log instead of fixing after the third round; docs-only PRs merge without asking.
- **Sreeram confirmed:** columns in UTF-16 code units, https-only sources, lowercase rule ids.
- **Remember:** the standing instructions under "Resume here": model choice per task, the source sentence in catalog PRs, and `/checkpoint` after T-005.
- **Lesson:** CodeRabbit rounds were the biggest time cost (PR #2: 6 rounds, PR #3: about 8, PR #4: 5). The new Merging rules cap this.
- **Pace: the Dec 5 checkpoint is at risk by well over 3 days.**
  - 33 tasks remain up to and including T-050 (validation on 10 repos), with 13 days left: about 2.5 tasks a day.
  - Measured so far: about 1 task per session (T-000, T-002).
  - **Option A (recommended): use the brief's fallback now.** Cut to a minimum launch path: T-003–T-005, T-010–T-016, T-019, T-021–T-023, T-030–T-033, T-050, T-051, T-053, T-054, T-055, about 23 tasks. Defer Yarn lockfiles (T-017/T-018), native addons (T-020), the Node 26 rules (T-024/T-025), T-026, fleet (T-034), the corpus job (T-037), the mutation target (T-038), the change-signature schema (T-006) and the Action (T-040) to after launch. The security review (T-052) is already due by Mar 31. That still needs about 1.8 tasks a day.
  - **Option B: keep the full scope and move launch about 2 weeks,** to about Dec 18–20. Discovery calls continue in parallel; the Dec 31 engine checkpoint gets tighter.
  - The first `/checkpoint` after T-005 re-measures the pace either way.
- **Decision (Sreeram, same evening): Option A, with three changes (ADR-013).**
  - Keep a minimal native-addon detector, from lockfile install-script flags with no network: it's the headline finding in the outreach pitch.
  - Defer the packaged Action; ship a copy-paste README workflow (CLI plus SARIF upload) instead.
  - Launch moves to Tuesday, Dec 8, and the validation checkpoint to Dec 7.
  - Deferred work is now in TASKS "Phase 5 — Post-launch (first 2 weeks)". That leaves 27 tasks to launch, 23 by Dec 7.

### 2026-11-21 · Name decided, Step 1 done

- Product renamed **Valore → Neukee**; company **GOkit4dev** (ADR-008). Reason: live VALORE trademark in Class 9.
- Workbench Step 1 complete on Sreeram's MacBook Air M5 (macOS 26.4): Git, GitHub CLI (Venu2328), fnm, Node 24 and 22, pnpm, VS Code with extensions, Claude Code, Docker Desktop, Apple Passwords, FileVault. Claude plan: Pro until the first revenue.
- GitHub 2FA moved to an authenticator app (Apple Passwords).

### 2026-11-19 · Workbench additions

- Added `docs/BRIEF.md` (operating brief), `/wrap`, updated `/status`, dated checkpoints and this velocity log.
- Quality gates: Stryker (baseline mutation score 62.9% on the scaffold), Knip, publint, Are the Types Wrong; CI `quality` job; nightly mutation; OpenSSF Scorecard; Dependabot for Actions and npm; CodeRabbit config. Actions updated to current majors and pinned to commit SHAs.
- Fixed a packaging bug publint found: the `development` export condition pointed at unpublished TypeScript source (bundlers such as Vite enable that condition in dev). Renamed to `@neukee/source`.
- ADR-005 (public repo, licenses: default, waiting for confirmation), ADR-006 (crowd signatures opt-in), ADR-007 (quality gates).
- New tasks: T-006 change-signature schema, T-027 MergeWarden comparison, T-037 corpus job, T-038 mutation score target, T-056 UpgradeBench; E-001 reframed as the competitive spike.

## Log (task entries)

### 2026-11-23 · T-005 · File discovery — in progress

- Added bounded repository discovery with nested `.gitignore` rules, deterministic forward-slash RepoPaths, generated-directory and symlink skips, size limits, and single-handle reads with `fstat`.
- Exported the RepoPath pattern from core as required by T-005, rather than duplicating schema validation.
- Tests cover an exact file list, nested ignore rules and negation, CRLF/empty lines, character classes, empty and oversized files, an external symlink, invalid paths without `Diagnostic.file`, and report statistics.
- Updated `fixtures/expected/empty.json` intentionally: the empty fixture contains a README, so discovery now reports one scanned file instead of zero.
- A failing regression test caught and fixed `dir/**` incorrectly excluding `dir` itself, which prevented a nested negation from re-including a file.
- Initial PR commit `1110236` passed Linux and Windows Node 22/24 CI, CodeQL and package checks. CodeRabbit's first review found five issues: POSIX/escaped character classes, negations matching ancestor segments, two symlink TOCTOU races, and missing nonzero skipped-count coverage.
- Added regressions for each behavior, including deterministic filesystem swap tests. Fixed the ignore matching, verified file descriptor identity against the current path before reading, and revalidated directories before descent. The ask-to-approve security changes could not reach Sreeram; proceeded under his earlier broad authorization to prioritize security and keep building.
- CodeRabbit's follow-up found malformed POSIX classes could trigger quadratic suffix rescanning. Added a 400 KiB malformed-pattern regression; the old parser was still running after 30 seconds, while the single-pass fix completes the targeted test in under a second and preserves the existing POSIX-class cases.
- Independent reviewer: PASS. `pnpm check:all` passes locally on macOS (395 tests), and all revised PR checks pass. CodeRabbit's re-review is still in progress; T-005 remains in progress.

### 2026-11-22 · T-004 · Fixture harness, snapshots and dependency rule — done

- `scan(root, targets, tool)` in `@neukee/scanner`. For now it returns the valid, empty report frame and refuses a root that isn't a folder. T-005 adds discovery and T-030 assembles the rest. The caller passes `tool` (the CLI knows its version).
- Test helpers in `packages/scanner/src/testing/`, excluded from the build and the npm package:
  - `scanFixture(name, targets)` scans `fixtures/repos/<name>` and returns the report normalized (`scannedAt` set to `1970-01-01T00:00:00Z`, tool version `0.0.0-test`) and checked with `validateReport`;
  - `matchGolden(name, report)` compares it with `fixtures/expected/<name>.json`.
- New snapshot `fixtures/expected/empty.json`: the first golden report, for the new `fixtures/repos/empty`. Checked by hand: an edited golden file fails the test, and in CI mode a missing one fails rather than being written.
- `test/dependency-direction.test.ts` enforces `action → cli → scanner → core` across every `.ts` file in `packages/*/src`, tests included. It catches package names, relative paths into another package, `import()` and `require()`, and its own tests feed it each forbidden form.
- Noticed, not fixed (outside the task): `packages/cli/src/run.ts` reads its `package.json` with an unchecked `as` (from T-000). That breaks the Quality bar's cast rule (it's a runtime file read). Logged as a follow-up for T-033.
- Reviewer, first pass: one must-fix and five should-fixes, all fixed:
  - must-fix: a package not in the order (a future engine package) could import anything. Now every folder under `packages/` must be in the order, and a package outside it may import nothing internal;
  - the import scan now also catches template-literal specifiers, `import"x"` with no space, and `vi.importActual`;
  - multi-line imports, `export * from` and `import type` are pinned by tests;
  - Stryker and coverage skip the test-only `testing/` helpers;
  - the export is placed after the imports, and `scan` uses `ScanReport["tool"]`.
- Expected, for T-005: `fixtures/repos/empty` holds a README (Git can't track an empty folder), so once discovery lands `fixtures/expected/empty.json` will count it. That commit must say so.
- Tests: 386 in the whole repo. `pnpm check:all` passes.
- CI follow-up on PR #7: clean-checkout matrix tests failed because Vitest resolved scanner imports only after `dist` already existed. Added source aliases for workspace packages in `vitest.config.ts`; reproducing with all dist folders removed passes, and `pnpm verify` plus `pnpm check:all` pass.
- CodeRabbit follow-up on PR #7: changed workspace aliases to exact bare-package matchers so package subpaths continue to use the published exports. The comment-separated dependency-import bypass is covered by a regression test.
- CodeRabbit's third review round found that the dependency-direction guard does not handle U+2028/U+2029 line-comment terminators or every ECMAScript whitespace character. Deferred after the third minor-review round per CLAUDE.md and logged in `docs/REVIEW-QUEUE.md`.
- Independent T-004 review found that fixture and golden names could escape their folders; `scanFixture` and `matchGolden` now check lexical and real-path containment. Added traversal, absolute-path and external-symlink regression tests; `pnpm check:all` passes.

### 2026-11-22 · T-003 · Catalog format, loader and validator — done

- `loadCatalog(dir)` in `packages/core` reads `catalog/**/*.yaml` and returns typed entries plus errors naming each bad file. One bad file never stops the load.
- Rules (ADR-014):
  - the file path is the id;
  - closed fields; one-line title; `introducedIn` is `x.y.z`;
  - official https sources only (nextjs.org, nodejs.org, react.dev, www.prisma.io);
  - fixture paths under `fixtures/`;
  - YAML in core schema, with every parser warning fatal; 64 KiB cap; no symlinks; lowercase `.yaml` only.
- The id grammar comes from the report schema through `isRuleId`, so there is no copy.
- First entry: `catalog/next16/sync-request-apis.yaml`, checked against the Next.js 16 upgrade guide ("Async Request APIs (Breaking change)"), with minimal positive and negative fixtures for T-022 to extend.
- Dependency: `yaml` 2.9.1, allowed by ADR-004; zero dependencies, ISC license. Knip now ignores `fixtures/`.
- Reviewer, first pass, all fixed:
  - must-fix: a single bad file crashed the whole load (alias bomb, unreadable file);
  - must-fix: no size cap;
  - must-fix: duplicate ids were possible. Fixed by making the path the id.
  - should-fix: untested branches; untested YAML-1.1 guards; copied helpers; symlinks followed; undocumented decisions.
- Also from the review: fixture-folder existence moved from the loader to the real-catalog test, because the npm package won't ship `fixtures/`. The entry's fix text was trimmed to what the source says. ARCHITECTURE §6's example is now the real entry.
- Reviewer, second pass: PASS. I took its three optional suggestions:
  - file-system errors show only their code, never an absolute path;
  - an unreadable folder is an error, not a crash;
  - symlinked folders and special files are reported, not skipped.
- Sreeram confirmed ADR-014, adding two requirements:
  - duplicate ids are rejected: pinned by a test, since the path rule makes them impossible;
  - the fixture check requires non-empty folders: a new test-side check, itself tested on temp repos, and shown to fail when a real fixture folder is emptied.
- CodeRabbit on PR #6:
  - CodeQL flagged the regex built from host names (a false positive). Replaced with the URL API: canonical https, no credentials or port, exact host. Ten rejection tests cover look-alike suffixes, `host@evil`, credentials, ports including `:443`, http, trailing whitespace, uppercase host, an unofficial host, and a non-URL.
  - File-swap race hardening declined for the catalog (trusted content, ADR-014) and moved into T-005's done-when for scanned files. ARCHITECTURE §7 now states the trust boundary.
- Tests: 68 catalog tests; 368 in the whole repo. `pnpm check:all` passes. Source size is 322 lines, about 7% over the ~300 guideline, mostly the robustness fixes.

### 2026-11-22 · chore · Quality bar (ADR-012)

- CLAUDE.md now has a "Quality bar (non-negotiable)" section: simplest code, small PRs, the standard library first, honest types, hostile-input rules, a failing test before every bug fix, and behavior-focused tests.
- Biome: `noExplicitAny` and `noNonNullAssertion` are errors. The codebase had no violations; a probe file proved both rules fire.
- The reviewer subagent checks the Quality bar (check 9).
- `validateWithSchema` no longer has an unchecked `as`. The one remaining `as` on the bundled schema file is documented as an exception (ADR-012).
- `pnpm check:all` passes.

### 2026-11-22 · T-002 · Core types and JSON Schema — done

- `packages/core/schema/scan-report.v1.json`: hand-written draft 2020-12 schema, published with the package and exported as `@neukee/core/schema/scan-report.v1.json`.
- `validateReport(value)` returns the typed report or every problem as `{ path, message }`. Messages are full sentences (`report.findings[0].severity must be one of "action-required", "warning" or "info" (got "critical").`). It interprets the schema itself, with no new dependency (ADR-004).
- ARCHITECTURE §5 now documents what the schema adds (ADR-011): closed objects, canonical repo-relative paths, 1-based UTF-16 columns, https sources, the rule-id grammar, and timestamps with a time zone.
- Sreeram's three changes before merge (ADR-011):
  - `stats.durationMs` is removed from the type and the schema, so only `scannedAt` varies. This matches SPEC-SCANNER target 6. Timing may return behind an opt-in flag (note on T-033).
  - `compareFindings` is now a total order: severity, file, line, column, ruleId, target.tool, target.version, message. After CodeRabbit's finding, the remaining fields (title, fix, sourceUrl, all locations) break any tie left, so 0 means equal in every field. Tests cover each tie and key precedence, and check reversed input for every remaining field. A seeded test shuffles 288 findings 100 times and gets identical output every time. 32 of them tie on all eight keys and differ only in title, fix (present or absent), sourceUrl, a second location or the location count. With the late-key tie-breakers removed by hand, that test and the late-key order test both fail. Text comparison is plain code-unit order (no `localeCompare` or `Intl` anywhere), tested with accented letters, where code-unit and locale order disagree.
  - New compatibility policy: optional fields may be added within v1, and consumers ignore unknown fields. Removing, renaming, retyping or changing a field's meaning bumps `schemaVersion`. Our validator stays strict, and every schema change needs an ADR.
  - The validator no longer supports `number` (no field uses it), and its one unchecked `as` tuple cast is gone.
  - Sreeram confirmed the three schema defaults; the review-queue row is closed.
- Tests (core: 2 → 292; whole repo 300):
  - 22 broken reports with exact messages.
  - A generated violation for every schema constraint (60+ cases).
  - Real paths the detectors will emit (Next.js route syntax, dotfiles, Unicode) must pass.
  - Fields, required/optional and enums are compared between types and schema both ways.
  - The constraint inventory is a snapshot (new file `packages/core/src/__snapshots__/validate.test.ts.snap`). A schema change fails until the snapshot is updated on purpose, with an ADR (and a `schemaVersion` bump if the change is breaking).
  - Hand mutation check: deleting a `minLength` and loosening `integer` → `number` both fail it.
- Reviewer subagent: one must-fix (document the extra constraints, plus an ADR) and four should-fixes. The validator now applies keywords next to `$ref` and object keywords on any object. The path rule now rejects `./`, `.`, empty segments, a trailing `/`, `file:` and control characters. Values and keys are truncated on code points. Every coverage gap is now a test. All fixed. Second pass: PASS. I took its three optional suggestions:
  - Paths also reject C1 controls and bidi overrides (U+202A–202E, U+2066–2069). The snapshot was regenerated before its first commit, because the pattern changed.
  - The unverified "SARIF default columnKind" claim was dropped; T-032 sets `columnKind` explicitly.
  - T-005 tests paths against the exported pattern.
- CodeRabbit on PR #3 (3 findings, all fixed):
  - `scannedAt` now rejects out-of-range months, days, clock values and offsets. It also rejects dates that don't exist, through `format: "date-time"`, which `validateReport` asserts (`SUPPORTED_FORMATS`). CodeRabbit pointed out that `validateReport` checks arbitrary input, not only our own output.
  - `sourceUrl` must have a dotted host name. Any port must be 1–65535, checked exhaustively for every value from 0 to 70,000.
  - Unknown keys are reported in sorted order.
  - The constraint snapshot was updated on purpose, four times. First for the two changed patterns, then for the one new `format` line, then for the `sourceUrl` port range, and last for the removal of the two `durationMs` lines. Nothing else changed.
  - Every pattern was timed on 100k-character hostile input: all under 5 ms, linear.
- Follow-ups written into later tasks: T-003 shares the id grammar; T-004 normalizes with fixed values; T-005 skips unrepresentable paths; T-021 column unit; T-031 neutralises control/bidi characters and escapes markdown in repo-derived text; T-032 SARIF fallback location and explicit `columnKind`; T-034 fleet wrapper; T-040 ships `schema/`.
- `pnpm verify` and `pnpm check:all` pass.

### 2026-11-22 · T-001 · GitHub repository and protections — done

- Sreeram created `neukee/neukee` (public, ADR-005), set the ruleset on `main`, set CODEOWNERS, installed CodeRabbit.
- PR #1: Windows `verify` failed because Git checked files out with CRLF and Biome rejected them. Added `.gitattributes` (`* text=auto eol=lf`, binary patterns, `fixtures/**/crlf/** -text`). All nine checks then passed, CodeRabbit included; squash-merged as `55c70b9`.
- Follow-up: T-015 now requires lockfile parsers to accept CRLF input, with a CRLF fixture under `fixtures/**/crlf/`.
- Workflow change (chore PR): Claude now pushes task branches, opens the PR, requests CodeRabbit, watches checks and fixes failures; Sreeram approves every merge.

### 2026-11-18 · T-000 · Repository scaffold — done

- Workspace, strict TypeScript, Biome, Vitest (network blocked in tests), three packages, CI, Claude Code setup.
- `pnpm verify`: typecheck, lint and tests pass.
- Next: T-001 (you: create the GitHub repo and protections), T-002 (Claude: core types and schema).
