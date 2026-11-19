---

name: wrap
description: End a work session so the next one (any day, any hour) resumes exactly here — update "Resume here", the velocity log and the daily log.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git status) Bash(git log *) Bash(git diff *) Bash(git add *) Bash(git commit *)
---

Close the session cleanly.

1. Run `git status`. If there are uncommitted changes from a finished task, commit them as `/next` would. If a task is half done, do **not** commit broken work: describe exactly where it stopped instead (files, failing test, next step).
2. Run `pnpm verify` and note the result in one line.
3. Update `docs/PROGRESS.md`:
   - **Resume here:** the date and time (IST), the branch, the last finished task, the task in progress and its exact next step, anything blocked and who unblocks it, and the next dated checkpoint with days left.
   - **Velocity log:** one row per task finished this session (date, task, size S/M/L, Claude sessions, Sreeram's hours if he gave them, result, note).
   - **Daily log:** a dated entry with what changed, decisions made and anything Sreeram said to remember.
4. If anything in `docs/BRIEF.md` §7 (dated checkpoints) is at risk by more than 3 days, say so first in the report, with two options.
5. Commit the doc updates as `chore: wrap session YYYY-MM-DD`. Do not push.
6. Report in five lines or fewer: done this session, where it stopped, the first command for next time, the next date and days left, anything waiting for Sreeram.
