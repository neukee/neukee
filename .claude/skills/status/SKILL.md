---

name: status
description: Start of session — say where the project stands, the exact next step, what is blocked, and the days left to the next dated checkpoint, in under ten lines.
disable-model-invocation: true
allowed-tools: Bash(git status) Bash(git log *) Bash(git branch *)
---

Read `docs/PROGRESS.md` (start with "Resume here"), `docs/TASKS.md`, `docs/REVIEW-QUEUE.md` and `docs/BRIEF.md` §7, and run `git status`, `git branch --show-current` and `git log --oneline -5`. Then report, in under ten lines:

1. Where the last session stopped (from "Resume here") and whether the repo state matches it.
2. The exact next step: the task `/next` will pick, or the half-finished task to complete first.
3. Items waiting for Sreeram (review queue, `needs-human` tasks, decisions marked "default, waiting for Sreeram to confirm" in the brief).
4. The next dated checkpoint from the brief and the days left; tasks remaining before T-055 and the pace that requires.
5. Uncommitted changes, if any.
