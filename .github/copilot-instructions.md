# Instructions for GitHub Copilot

This repository's rules live in [`CLAUDE.md`](../CLAUDE.md). They apply to every change, whoever writes it. Read it before working, and follow it exactly.

The rules that matter most:

- **Quality bar** (CLAUDE.md, "Quality bar"): the simplest code that passes the tests; no `any`, no `!`, no unchecked `as`; every scanned file is treated as hostile; fixtures only under `fixtures/`.
- **Tests first,** and never weaken, skip or delete a test to make something pass.
- **Work only on the task `/next` selects** in `docs/TASKS.md`, on a branch named `t-XXX-short-name`. One task per pull request.
- **Every task pull request opens with the four-line check:** tests added, files changed outside the task's area, decisions beyond the spec, new dependencies or core type/schema changes.
- **Task pull requests never touch** `docs/PROGRESS.md`, `docs/TASKS.md` or `docs/REVIEW-QUEUE.md`; those go on the day's docs-sync branch (ADR-016).
- **Changes to `CLAUDE.md` or anything under `.claude/`** always need Sreeram's explicit approval.
- **Never claim a review that didn't happen.** Quote the reviewer's verdict with the commit it reviewed, exactly as given.
- **Never commit in a checkout where another agent is working.** Use a separate worktree.
