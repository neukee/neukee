# Human review queue

Work that a qualified person must look at. Claude adds items when a task is marked `Human review: yes`, when it is unsure about correctness or security, or when a reviewer's eye would catch what tests cannot. `/review-prep` turns this into a weekend review pack.

**Rules for reviewers:** every reviewer knows the whole project and has a written agreement (paid, advisor equity or open-source credit). Reviews happen on pull requests on GitHub, so comments stay with the code.

## Waiting for review

| Added      | Task            | What to check                                                                                                                                                                   | Files                                                                 | Risk if wrong                                                                                                                        |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-19 | ADR-005         | Sreeram confirms: public repo from day one; Apache-2.0 scanner; FSL engine                                                                                                      | `docs/DECISIONS.md`                                                   | Publishing code is irreversible                                                                                                      |
| 2026-11-19 | Brief §5        | Sreeram confirms the target customer                                                                                                                                            | `docs/BRIEF.md`                                                       | Sales effort aimed at the wrong buyers                                                                                               |
| 2026-11-18 | T-001           | Branch protection, required checks and CODEOWNERS are set up correctly                                                                                                          | GitHub settings, `.github/CODEOWNERS`                                 | Unreviewed code reaches `main`                                                                                                       |
| 2026-11-22 | T-002 / ADR-011 | Sreeram confirms three schema defaults: columns are 1-based UTF-16 code units; `sourceUrl` is https only; rule ids are lowercase (`node26/slowbuffer`, not `node26/SlowBuffer`) | `packages/core/schema/scan-report.v1.json`, `docs/ARCHITECTURE.md` §5 | Wrong column unit misplaces SARIF annotations from T-021 on; a stricter id grammar than needed forces renames once T-003 enforces it |

## Reviewed

| Date | Task | Reviewer | Outcome |
| ---- | ---- | -------- | ------- |
