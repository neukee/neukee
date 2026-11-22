---

name: next
description: Pick the next task from docs/TASKS.md and build it end to end, test-first, with review and the full quality gate.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git status) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *) Bash(git switch *) Bash(git checkout -b *) Bash(git push -u origin HEAD) Bash(gh pr create *) Bash(gh pr comment *) Bash(gh pr checks *) Bash(gh pr view *) Bash(gh run list *) Bash(gh run view *)
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
10. **Commit.** `git add` the changed files and commit with `T-XXX: <what changed>`.
11. **Pull request.** Run `pnpm check:all`, then:
    1. `git push -u origin HEAD` from the task branch, exactly as written (it is the only pre-approved push; any other form asks the person). Never force-push; never push to `main`.
    2. `gh pr create --fill`.
    3. `gh pr comment <number> --body "@coderabbitai review"`.
    4. `gh pr checks <number> --watch`.
    5. If a check fails, read the log (`gh run view <run-id> --log-failed`), fix the cause, commit, `git push -u origin HEAD` and watch again. Read CodeRabbit's comments; fix each real finding, and for one you disagree with, reply with the reason. Never weaken a test to turn a check green.
    6. After each fix push, confirm CodeRabbit is reviewing the new commit (its check turns pending). If it hasn't started within a few minutes, comment `@coderabbitai review` again. Repeat 4–6 until nothing is left to fix.
12. **Ask for the merge.** When every check is green, CodeRabbit has posted its review of the latest commit (not just an earlier one), and every review comment is resolved, tell the person the PR link and the result, and ask them to approve merging the PR and deleting its task branch (one question, both actions named). Only after a yes: `gh pr merge <number> --squash --delete-branch`, `git switch main`, `git pull`. `gh pr merge` always needs the person's approval. If they already approved this PR in advance, merge when the conditions in CLAUDE.md "Merging" hold, and handle CodeRabbit findings as that section says (fix minor ones and continue; stop and ask for the rest).
13. **Report** in five lines or fewer: what was built, the verify result, what the reviewer and CodeRabbit flagged, the PR link and its check status, anything waiting for a person, and the next task.
