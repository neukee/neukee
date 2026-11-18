# Human review queue

Work that a qualified person must look at. Claude adds items when a task is marked `Human review: yes`, when it is unsure about correctness or security, or when a reviewer's eye would catch what tests cannot. `/review-prep` turns this into a weekend review pack.

**Rules for reviewers:** every reviewer knows the whole project and has a written agreement (paid, advisor equity or open-source credit). Reviews happen on pull requests on GitHub, so comments stay with the code.

## Waiting for review

| Added      | Task  | What to check                                                          | Files                                 | Risk if wrong                  |
| ---------- | ----- | ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------ |
| 2026-11-18 | T-001 | Branch protection, required checks and CODEOWNERS are set up correctly | GitHub settings, `.github/CODEOWNERS` | Unreviewed code reaches `main` |

## Reviewed

| Date | Task | Reviewer | Outcome |
| ---- | ---- | -------- | ------- |
