# Progress

Updated by Claude at the end of every task (`/next`), every session (`/wrap`) and every checkpoint (`/checkpoint`). Newest entries first.

## Resume here

- **Last updated:** 2026-11-22, 12:45 IST (Step 2 mostly done: GitHub org, npm org, 2FA; ADR-005 confirmed)
- **Branch:** `main`
- **Last finished:** T-000 scaffold, plus workbench additions (brief, `/wrap`, quality gates, pinned Actions)
- **In progress:** nothing
- **Exact next step:** Sreeram finishes workbench Step 2 (GitHub org `neukee`, npm org, domain, trademark search) and T-001 (repo on GitHub, protections, CodeRabbit). Then open Claude Code and run `/status`, then `/next` (T-002).
- **Blocked / waiting on Sreeram:** confirm the target customer (brief §5); NEWKEY trademark details (pronunciation decision)
- **Next dated checkpoint:** Dec 5, scanner runs on 10 public repos (14 days). Launch Dec 6 (15 days).

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
- **Current task:** T-001 (you) and T-002 (Claude)
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

| Date       | Task  | Size | Claude sessions | Sreeram hours | Result | Note                   |
| ---------- | ----- | ---- | --------------- | ------------- | ------ | ---------------------- |
| 2026-11-18 | T-000 | M    | 1               | —             | done   | Scaffold; verify green |

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

### 2026-11-18 · T-000 · Repository scaffold — done

- Workspace, strict TypeScript, Biome, Vitest (network blocked in tests), three packages, CI, Claude Code setup.
- `pnpm verify`: typecheck, lint and tests pass.
- Next: T-001 (you: create the GitHub repo and protections), T-002 (Claude: core types and schema).
