---

name: review-prep
description: Prepare the weekend review pack for human reviewers — what changed, what to look at, and the exact questions.
disable-model-invocation: true
allowed-tools: Bash(git log *) Bash(git diff *) Bash(git tag *) Bash(git status)
---

Prepare a review pack for engineers who will review on the weekend.

1. Find the last review tag (`git tag --list 'review/*'`); if none, use the first commit.
2. List the tasks completed since then (from `git log` and `docs/TASKS.md`).
3. Write `docs/reviews/review-YYYY-MM-DD.md` with:
   - a five-line summary of what changed and why;
   - for each task: the files, what a reviewer should check, and the risk if it is wrong;
   - every open item from `docs/REVIEW-QUEUE.md`;
   - three to five specific questions where a human's judgement matters most (security, correctness of catalog entries against their sources, design choices);
   - how to run it locally (`pnpm install && pnpm verify`, and one example scan command).
4. Tell the person which pull requests to send to which reviewer (security-sensitive files first).
5. After the person confirms the review is done, create the tag `review/YYYY-MM-DD` (ask first).
