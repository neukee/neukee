# Human review queue

Work that a qualified person must look at. Claude adds items when a task is marked `Human review: yes`, when it is unsure about correctness or security, or when a reviewer's eye would catch what tests cannot. `/review-prep` turns this into a weekend review pack.

**Rules for reviewers:** every reviewer knows the whole project and has a written agreement (paid, advisor equity or open-source credit). Reviews happen on pull requests on GitHub, so comments stay with the code.

## Waiting for review

_Nothing waiting._

| Added | Task | What to check | Files | Risk if wrong |
| ----- | ---- | ------------- | ----- | ------------- |

## Reviewed

| Date       | Task            | Reviewer | Outcome                                                                                         |
| ---------- | --------------- | -------- | ----------------------------------------------------------------------------------------------- |
| 2026-11-22 | ADR-005         | Sreeram  | Confirmed: public repo from day one; Apache-2.0 scanner, core, CLI and Action; FSL engine       |
| 2026-11-22 | Brief §5        | Sreeram  | Target customer confirmed (20–200 engineers, Node.js or Next.js, integration tests, SOC 2)      |
| 2026-11-22 | T-001           | Sreeram  | Repo, ruleset on `main`, required checks and CODEOWNERS set up; PR #1 proved checks block merge |
| 2026-11-22 | T-002 / ADR-011 | Sreeram  | Confirmed: columns in UTF-16 code units; `sourceUrl` https only; lowercase rule ids             |
