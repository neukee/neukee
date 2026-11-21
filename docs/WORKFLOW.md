# How we work

## Where the work happens

| What                         | Where                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building                     | VS Code with the Claude Code extension, in this repository                                                                                                          |
| Code, reviews, CI, releases  | GitHub, public from day one (ADR-005); CodeRabbit reviews every PR                                                                                                  |
| The CLI package              | npm (published with provenance from GitHub Actions)                                                                                                                 |
| The GitHub Action            | This repo (`packages/action`), listed on the GitHub Marketplace at launch                                                                                           |
| Marketing site and docs      | A **separate** repository (Astro or Next.js) on Cloudflare Pages, or Vercel Pro. Vercel's free Hobby plan is non-commercial only. The product itself has no server. |
| Company email                | Your domain (Google Workspace or Zoho)                                                                                                                              |
| Operating brief              | `docs/BRIEF.md`; also attached to the Claude chat project "Neukee HQ"                                                                                               |
| Leads, calls, audits, pilots | `docs/business/PIPELINE.md`                                                                                                                                         |

This is different from a web app: there is no backend, database or hosting for the product. What you ship is a package and an Action that run on other people's machines, so the quality bar is "never breaks someone's CI" and "never touches what it should not."

## The daily loop (you + Claude)

1. Open the repo in VS Code and start Claude Code.
2. Type `/status` to see where things stand and what is next.
3. Type `/next`. Claude picks the next task from `docs/TASKS.md`, restates what "done" means, writes the tests first, builds, runs `pnpm verify`, asks the reviewer subagent to check its work, fixes what the review finds, updates the docs and commits on a task branch.
4. Read Claude's summary. If it is right, run `pnpm check:all`, push the branch and open a pull request; CI runs the same gate and CodeRabbit reviews it (comment `@coderabbitai review` while the repo has fewer than 10 stars).
5. Merge when CI is green and review comments are resolved. Repeat `/next` as many times as your day allows. Fast days do more tasks; slow days do fewer. The order never changes.
6. End the session with `/wrap`. Next time, `/status` picks up exactly there.

**Claude cannot finish a turn with a failing gate:** a stop hook runs typecheck, lint and tests whenever files have changed, and sends failures back to Claude to fix.

## The weekly loop (you + reviewers)

- **Once a week, `/checkpoint`:** Claude measures progress against the launch targets, says whether the December 6 target still fits, and lists risks and anything that needs a person.
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
