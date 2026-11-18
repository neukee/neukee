# Progress

Updated by Claude at the end of every task (`/next`) and every checkpoint (`/checkpoint`). Newest entries first.

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

## Log

### 2026-11-18 · T-000 · Repository scaffold — done

- Workspace, strict TypeScript, Biome, Vitest (network blocked in tests), three packages, CI, Claude Code setup.
- `pnpm verify`: typecheck, lint and tests pass.
- Next: T-001 (you: create the GitHub repo and protections), T-002 (Claude: core types and schema).
