# Progress

Updated by Claude at the end of every task (`/next`), every session (`/wrap`) and every checkpoint (`/checkpoint`). Newest entries first.

## Resume here

- **Last updated:** 2026-11-22, evening IST (T-002 done on its branch; PR open)
- **Branch:** `t-002-core-schema` (PR waiting for merge approval)
- **Last finished:** T-002 (report JSON Schema and `validateReport`)
- **In progress:** nothing
- **Exact next step:** merge the T-002 PR once approved, then `/next` → T-003 (catalog loader).
- **Blocked / waiting on Sreeram:** confirm the three schema defaults in ADR-011 (column unit, https-only, lowercase rule ids); NEWKEY trademark details (pronunciation decision)
- **Next dated checkpoint:** Dec 5, scanner runs on 10 public repos (13 days). Launch Dec 6 (14 days).

## Dated checkpoints

From `docs/BRIEF.md` §7. `/checkpoint` updates the status column.

| Date       | Must be true                                                                | Status      |
| ---------- | --------------------------------------------------------------------------- | ----------- |
| 2026-12-05 | Scanner runs on 10 public repos and finds real blockers                     | not started |
| 2026-12-06 | Scanner v0.1.0 launched                                                     | not started |
| 2026-12-31 | 15–20 discovery calls; engine core end to end; E-001 competitive spike done | not started |
| 2027-01-31 | At least 2 paid audits                                                      | not started |
| 2027-02-28 | Precision good enough that design partners keep the check on                | not started |
| 2027-03-31 | At least 2 paid pilots; security review done                                | not started |
| 2027-04-30 | Three revenue streams live; UpgradeBench published                          | not started |

## Current state

- **Phase:** 0 — Foundation
- **Current task:** T-003 (Claude)
- **Scanner launch target:** December 6, 2026
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

| Date       | Task  | Size | Claude sessions | Sreeram hours | Result | Note                                                        |
| ---------- | ----- | ---- | --------------- | ------------- | ------ | ----------------------------------------------------------- |
| 2026-11-18 | T-000 | M    | 1               | —             | done   | Scaffold; verify green                                      |
| 2026-11-22 | T-002 | S    | 1               | —             | done   | Schema + validator; reviewer found 1 must-fix, 4 should-fix |

## Daily log

Sreeram's notes and each session's summary. Newest first.

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

### 2026-11-22 · T-002 · Core types and JSON Schema — done

- `packages/core/schema/scan-report.v1.json`: hand-written draft 2020-12 schema, published with the package and exported as `@neukee/core/schema/scan-report.v1.json`.
- `validateReport(value)` returns the typed report or every problem as `{ path, message }`. Messages are full sentences (`report.findings[0].severity must be one of "action-required", "warning" or "info" (got "critical").`). It interprets the schema itself, with no new dependency (ADR-004).
- The types are unchanged; they already matched §5. ARCHITECTURE §5 now documents what the schema adds (ADR-011): closed objects, canonical repo-relative paths, 1-based UTF-16 columns, https sources, the rule-id grammar, and timestamps with a time zone.
- Tests (core: 2 → 198; whole repo 206):
  - 22 broken reports with exact messages.
  - A generated violation for every schema constraint (60+ cases).
  - Real paths the detectors will emit (Next.js route syntax, dotfiles, Unicode) must pass.
  - Fields, required/optional and enums are compared between types and schema both ways.
  - The constraint inventory is a snapshot (new file `packages/core/src/__snapshots__/validate.test.ts.snap`). A schema change fails until the snapshot is updated on purpose, with a new `schemaVersion` and an ADR.
  - Hand mutation check: deleting a `minLength` and loosening `integer` → `number` both fail it.
- Reviewer subagent: one must-fix (document the extra constraints, plus an ADR) and four should-fixes. The validator now applies keywords next to `$ref` and object keywords on any object. The path rule now rejects `./`, `.`, empty segments, a trailing `/`, `file:` and control characters. Values and keys are truncated on code points. Every coverage gap is now a test. All fixed. Second pass: PASS. I took its three optional suggestions:
  - Paths also reject C1 controls and bidi overrides (U+202A–202E, U+2066–2069). The snapshot was regenerated before its first commit, because the pattern changed.
  - The unverified "SARIF default columnKind" claim was dropped; T-032 sets `columnKind` explicitly.
  - T-005 tests paths against the exported pattern.
- CodeRabbit on PR #3 (3 findings, all fixed):
  - `scannedAt` now rejects out-of-range months, days, clock values and offsets. It also rejects dates that don't exist, through `format: "date-time"`, which `validateReport` asserts (`SUPPORTED_FORMATS`). CodeRabbit pointed out that `validateReport` checks arbitrary input, not only our own output.
  - `sourceUrl` must have a dotted host name.
  - Unknown keys are reported in sorted order.
  - The constraint snapshot was updated on purpose, twice: first for the two changed patterns, then for the one new `format` line. Nothing else changed.
  - Every pattern was timed on 100k-character hostile input: all under 5 ms, linear.
- Follow-ups written into later tasks: T-003 shares the id grammar; T-004 normalizes with fixed values; T-005 skips unrepresentable paths; T-021 column unit; T-031 neutralises control/bidi characters and escapes markdown in repo-derived text; T-032 SARIF fallback location and explicit `columnKind`; T-034 fleet wrapper; T-040 ships `schema/`.
- `pnpm verify` and `pnpm check:all` pass.

### 2026-11-18 · T-000 · Repository scaffold — done

- Workspace, strict TypeScript, Biome, Vitest (network blocked in tests), three packages, CI, Claude Code setup.
- `pnpm verify`: typecheck, lint and tests pass.
- Next: T-001 (you: create the GitHub repo and protections), T-002 (Claude: core types and schema).
