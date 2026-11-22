# How we work

## Where the work happens

| What                         | Where                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building                     | VS Code with the Claude Code extension, in this repository                                                                                                             |
| Code, reviews, CI, releases  | GitHub, public from day one (ADR-005); CodeRabbit reviews every PR                                                                                                     |
| The CLI package              | npm (published with provenance from GitHub Actions)                                                                                                                    |
| The GitHub Action            | At launch: a copy-paste workflow in the README (CLI plus SARIF upload). Packaged Action (`packages/action`, GitHub Marketplace) in the first two weeks after (ADR-013) |
| Marketing site and docs      | A **separate** repository (Astro or Next.js) on Cloudflare Pages, or Vercel Pro. Vercel's free Hobby plan is non-commercial only. The product itself has no server.    |
| Company email                | Your domain (Google Workspace or Zoho)                                                                                                                                 |
| Operating brief              | `docs/BRIEF.md`; also attached to the Claude chat project "Neukee HQ"                                                                                                  |
| Leads, calls, audits, pilots | `docs/business/PIPELINE.md`                                                                                                                                            |

This is different from a web app: there is no backend, database or hosting for the product. What you ship is a package and an Action that run on other people's machines, so the quality bar is "never breaks someone's CI" and "never touches what it should not."

## The daily loop (you + Claude)

1. Open the repo in VS Code and start Claude Code.
2. Type `/status` to see where things stand and what is next.
3. Type `/next`. Claude picks the next task from `docs/TASKS.md`, restates what "done" means, writes the tests first, builds, runs `pnpm verify`, asks the reviewer subagent to check its work, fixes what the review finds, updates the docs and commits on a task branch.
4. Claude then handles the GitHub side: it runs `pnpm check:all`, pushes the task branch, opens the pull request with `gh pr create --fill`, comments `@coderabbitai review` (needed while the repo has fewer than 10 stars), and watches the checks with `gh pr checks --watch`. It fixes any CI failure and any real CodeRabbit finding, and pushes the fixes.
5. When CI is green, CodeRabbit has reviewed the latest commit, and every review comment is resolved, Claude asks you to approve merging the PR and deleting its task branch. It doesn't ask for a PR that changes only Markdown docs or code comments, or one you approved in advance (CLAUDE.md, "Merging"). You say yes, and Claude squash-merges and deletes the branch (`gh pr merge --squash --delete-branch`), then switches to `main` and pulls. Claude never merges without your yes (ADR-010). Repeat `/next` as many times as your day allows. Fast days do more tasks; slow days do fewer. The order never changes.
6. End the session with `/wrap`. Next time, `/status` picks up exactly there.

**Claude cannot finish a turn with a failing gate:** a stop hook runs typecheck, lint and tests whenever files have changed, and sends failures back to Claude to fix.

## The weekly loop (you + reviewers)

- **Once a week, `/checkpoint`:** Claude measures progress against the launch targets, says whether the December 8 launch (validation checkpoint Dec 7) still fits, and lists risks and anything that needs a person.
- **Before the weekend, `/review-prep`:** Claude writes a review pack: what changed, which files, the exact questions for reviewers, and what is risky.
- **Weekend:** reviewers review the pull requests and the pack on GitHub. Their comments become tasks or fixes.

## Working with outside engineers

- Everyone sees the whole project and knows who else is helping. Agreements are written: paid reviews, advisor equity, or credit on the open-source scanner.
- Reviews happen on GitHub pull requests, not in chat, so the history stays with the code.
- Security-sensitive work (Action permissions, release signing, anything that reads customer files in new ways) always gets a human review before release.

## Rules that keep earlier work from breaking

- One task per branch; the gate passes before the next task starts.
- Snapshot tests: any change in scanner output fails until it is deliberately approved with a reason.
- Tests are never deleted or weakened to make a change pass. If a test is wrong, fixing it is its own commit with a reason.
- Schema or architecture changes need a decision record in `docs/DECISIONS.md`.
