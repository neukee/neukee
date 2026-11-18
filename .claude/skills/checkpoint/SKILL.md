---

name: checkpoint
description: Weekly evaluation against the launch targets — what is on track, what is at risk, what needs a person, and what to change.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git log *) Bash(git status)
---

Evaluate the project honestly. Do not soften bad news.

1. Run `pnpm verify` and `pnpm test -- --coverage` and note the results.
2. Read `docs/TASKS.md`, `docs/PROGRESS.md`, `docs/SPEC-SCANNER.md` §5 (launch targets), `docs/REVIEW-QUEUE.md` and the last two weeks of `git log`.
3. Measure each launch target that can be measured now; mark the others "not yet measurable" with the task that will measure them.
4. Estimate pace: tasks completed per week over the last two weeks, tasks remaining before T-055, and whether December 6 still fits. If not, propose what to cut or reorder (never cut tests, the catalog source rule or the security review).
5. List risks: flaky tests, growing dependencies, rules without enough fixtures, review items older than a week, anything built without a source.
6. List exactly what needs a person this week (reviews, accounts, decisions), with the question for each.
7. Update the "Current state" and "Launch targets" tables in `docs/PROGRESS.md` and add a dated checkpoint entry to its log.
8. Report the summary to the person in under fifteen lines.
