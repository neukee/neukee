---

name: status
description: Say where the project stands, what was done last, and what comes next, in under ten lines.
disable-model-invocation: true
allowed-tools: Bash(git status) Bash(git log *)
---

Read `docs/PROGRESS.md`, `docs/TASKS.md` and `docs/REVIEW-QUEUE.md`, and run `git status` and `git log --oneline -5`. Then report, in under ten lines:

1. The current phase and the last completed task.
2. The next task `/next` will pick, and anything blocking it.
3. Items waiting for a person (from the review queue and `needs-human` tasks).
4. Days left to the December 6, 2026 launch target, and how many tasks remain before T-055.
5. Uncommitted changes, if any.
