---

name: next
description: Pick the next task from docs/TASKS.md and build it end to end, test-first, with review and the full quality gate.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git status) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *) Bash(git switch *) Bash(git checkout -b *)
---

Build exactly one task from `docs/TASKS.md`, completely.

1. **Orient.** Read `CLAUDE.md`, `docs/PROGRESS.md` and `docs/TASKS.md`. Run `git status`; if the working tree has uncommitted changes from earlier work, stop and tell the person instead of continuing.
2. **Select.** Take the first task with `Status: todo` whose `Depends on` tasks are all `done`. If it is a task for the person (T-001, decisions about accounts, publishing), give them clear step-by-step instructions and stop. If every remaining task is blocked, say why and stop.
3. **Branch.** `git switch -c t-XXX-short-name` from an up-to-date `main`.
4. **Plan.** Restate the task's "Done when" criteria in your own words. List the files you expect to touch. Read the relevant sections of `docs/ARCHITECTURE.md` and `docs/SPEC-SCANNER.md`. If the task needs an official source (catalog entries, version data), fetch and read it now; never work from memory.
5. **Tests first.** Write the tests and fixtures (positive and negative for rules). Run them; confirm they fail for the right reason.
6. **Build.** Implement the smallest change that passes them. Stay inside the task.
7. **Gate.** Run `pnpm verify` until it passes. Fix causes, not symptoms. Never weaken, skip or delete a test.
8. **Independent review.** Delegate to the `reviewer` subagent with: the task text, the list of changed files, and the relevant spec sections. Fix every issue it marks as must-fix, re-run `pnpm verify`, and repeat until it returns PASS.
9. **Record.** Update `docs/TASKS.md` (status and ticked criteria), add a `docs/PROGRESS.md` log entry (what changed, verify result, anything learned), add to `docs/REVIEW-QUEUE.md` if the task says `Human review: yes` or anything is uncertain, and add a `docs/DECISIONS.md` entry if architecture, schema, dependencies or targets changed.
10. **Commit.** `git add` the changed files and commit with `T-XXX: <what changed>`. Do not push.
11. **Report** in five lines or fewer: what was built, the verify result, what the reviewer flagged, anything waiting for a person, and the next task.
