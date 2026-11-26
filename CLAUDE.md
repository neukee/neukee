# Neukee — project memory for Claude

Working name **Neukee** (trademark check pending; rename in T-053). A local-first verification tool for Node.js and Next.js upgrades. First product: the **scanner** (static analysis, launch target **Tuesday, December 8, 2026**). Later: the **engine** (behavioral comparison on the customer's tests).

## Read before working

- `docs/BRIEF.md` — **first, every session.** Who we are (Sreeram + Claude, nobody else), the goal, principles, decisions, dates, and when to stop and ask.
- `docs/ARCHITECTURE.md` — the source of truth for structure, types, security model and quality gate.
- `docs/SPEC-SCANNER.md` — exact scanner behavior and the launch targets.
- `docs/TASKS.md` — the ordered task list. Work only on the task `/next` selects.
- `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/REVIEW-QUEUE.md` — where things stand, why, and what needs a person.

## Sessions

- **Start:** `/status` (where we stopped, the exact next step, the next date). **Work:** `/next`, repeated. **End:** `/wrap` (updates "Resume here" and the velocity log so any later session resumes exactly here). **Sunday:** `/checkpoint`.
- A date in `docs/BRIEF.md` §7 at risk by more than 3 days: tell Sreeram the same day, with options.
- **Commit on the task branch every time the tests pass,** even mid-task, so no green step is ever lost.
- **When Sreeram says usage is above 80%,** don't start a new task. Commit the current step on its branch and run `/wrap`.

## Commands

- `pnpm install` · `pnpm verify` (typecheck + lint + tests; must pass before any task is done)
- `pnpm check:all` (verify + `knip` unused code + `pack:check` package correctness; run before opening a PR) · `pnpm mutation` (Stryker; slow, nightly in CI)
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:fix`, `pnpm build`
- Tests for one package or file: `pnpm test packages/scanner` (Vitest filters by path)

## How to work (every task)

1. Restate the task's "Done when" criteria in your own words before writing code.
2. Write or extend tests first (fixtures for scanner rules: positive and negative). Run them and see them fail.
3. Implement the smallest change that makes them pass. Stay inside the task's scope.
4. Run `pnpm verify`. Read failures; fix causes, not symptoms.
5. Commit on a branch named `t-XXX-short-name` with message `T-XXX: <what changed>`. Never commit to `main` directly. Commit before the review, so the SHA you quote is exactly what was reviewed.
6. Ask the `reviewer` subagent to review that commit: the diff, the task and the spec sections it touches. It runs on Sonnet; pass Opus explicitly only for foundational reviews (hostile-input parsing: T-005b, T-005c, T-015, T-016, T-021) or when Sreeram asks. Fix what it finds in a new commit, re-run `pnpm verify`, have the reviewer check the new commit, and quote its verdict with the SHA it reviewed in the PR (ADR-016).
7. Put `docs/DECISIONS.md` changes (architecture, schema, dependencies or targets) in the task PR. Updates to `docs/TASKS.md`, `docs/PROGRESS.md` and `docs/REVIEW-QUEUE.md` go on the day's `docs-sync/YYYY-MM-DD` branch, pushed after each update and merged at `/wrap` (ADR-016). Task PRs never touch those three files.
8. Run `pnpm check:all`, push the task branch, `gh pr create --fill`, comment `@coderabbitai review`, `gh pr checks --watch`. Fix CI failures and real CodeRabbit findings. Then merge as described in "Merging" (ADR-010).

## Merging

- **Standing approval for task PRs (ADR-016).** Merge without asking when all of these hold:
  - the 4 verify jobs and the quality job are green;
  - CodeRabbit reviewed the latest commit and every thread is resolved;
  - the reviewer's **PASS** verdict is quoted in the PR with the SHA it reviewed, and that SHA is the PR's head. A CHANGES REQUIRED verdict blocks the merge until a new review of the head passes. If any commit lands after a PASS, re-run the reviewer on just those commits (Opus only when they change product code on a foundational task or matching logic; Sonnet for merges from main, docs, comments and test-only commits) and quote the new verdict with the new head SHA;
  - the four-line check shows no core type or schema change, no new dependency, and no CI, workflow, permission or security-model change.
    Squash-merge with the PR title in Conventional Commits form. Anything else needs Sreeram's approval, which he may give in advance for a specific PR, with conditions.
- **A PR that changes only Markdown docs or code comments** (including the daily docs-sync PR) merges under these rules without asking.
- **Changes to `CLAUDE.md` or anything under `.claude/`** (agents, skills, hooks, settings) always need Sreeram's explicit approval, even in a docs-only or docs-sync PR.
- **At most two tasks in flight:** one building and one in review, in separate worktrees. Never two building at once.
- **Every task PR's merge request opens with this four-line check:**
  - Tests added for this task: yes/no, how many
  - Files changed outside the task's area: list, or "none"
  - Decisions beyond the spec: list with ADR number, or "none"
  - New dependencies, core type/schema, CI, workflow, permission or security-model changes: list, or "none"
- **Merge only when** every CI check is green, CodeRabbit has reviewed the latest commit, and every review thread is resolved. Squash-merge and delete the branch (`gh pr merge <n> --squash --delete-branch`), then `git switch main` and `git pull`.
- **Minor CodeRabbit findings** in docs, comments, tests or tooling: fix them, reply on the thread, and continue under the existing approval. List each one in the merge summary.
- **If a PR gets a third round of minor findings, stop fixing.** Log the rest as follow-ups in `docs/REVIEW-QUEUE.md`, resolve each thread with a short reply, and merge under the existing approval.
- **Stop and ask Sreeram** if a finding touches product code behavior, core types or the report schema, security, CI workflows or permissions, or dependencies, or if you disagree with CodeRabbit.

## Rules (non-negotiable)

- **Never weaken, skip or delete a test to make something pass.** If a test is wrong, fix it in a separate commit and explain why.
- **Never update a snapshot without saying why** in the commit message and PROGRESS.
- **No network access in product code or tests.** No `fetch`, sockets or DNS. Tests block the network on purpose.
- **Never run the scanned project's code, scripts or package manager.** The scanner only reads files.
- **No absolute paths, secrets or file contents in reports** beyond the single line that locates a finding.
- **Catalog entries come from official sources only.** Fetch and read the source before writing an entry; paste the exact URL. Never write an entry from memory.
- **New runtime dependencies need a decision** in `docs/DECISIONS.md` first (see ADR-004 for the allowed list).
- **Workspace packages resolve to source through the `@neukee/source` export condition** (tests and typecheck). Never use the `development` condition: bundlers enable it for consumers.
- **Respect the dependency direction:** `action → cli → scanner → core`; `core` imports nothing internal.
- **Deterministic output:** sort findings; no timestamps except `scannedAt`; no `Math.random`.
- **Detectors never throw.** Errors become `Diagnostic` entries; one bad file never stops a scan.
- **Stop and ask the person** before: changing core types or the report schema, changing CI or release workflows, changing Action permissions, deleting files outside the current task, merging a PR (except as "Merging" allows: an advance approval, or a PR that changes only Markdown docs or code comments), pushing to `main`, force-pushing, publishing, or deleting branches. Pushing a task branch and opening, commenting on and watching its PR are routine and need no approval (ADR-010).

## Quality bar (non-negotiable)

The reviewer subagent checks every item below (ADR-012).

- **Simplest code that passes the tests.** No abstractions, options or extension points until a second real use exists.
- **Small PRs.** One task per PR. Source changes stay under about 300 lines; tests and fixtures don't count.
- **Prefer Node's standard library** to a dependency or hand-rolled helper (and see ADR-004 for runtime dependencies).
- **Types that don't lie:**
  - no `any` (Biome `noExplicitAny`: error);
  - no non-null `!` (Biome `noNonNullAssertion`: error);
  - no unchecked `as`: validate data at the boundary, then let the types follow. A cast is allowed only for a file bundled in our own package and covered by a test that pins its exact shape. Never for scanned input, user config, environment variables or anything read at runtime from outside the package;
  - every `switch` over a union is exhaustive.
- **Treat every scanned file as hostile:**
  - cap file size;
  - follow no symlinks outside the root;
  - no `eval`, `new Function` or dynamic `import()` of anything from the repo;
  - parse YAML without custom tags;
  - write only linear-time regexes (no nested ambiguous quantifiers);
  - test malformed, empty, huge and CRLF input.
- **Every bug fix starts with a failing test** that reproduces it.
- **Tests check behavior, not internals.** Assert on outputs and observable effects, never on private helpers or call counts.
- **Fixtures live only in the top-level `fixtures/` folder;** the reviewer flags fixtures anywhere else.

## When you are unsure

Say so. Add the question to `docs/REVIEW-QUEUE.md` with the file and the risk, and continue with what is certain. A wrong guess in a security tool costs more than a pause.

## Style

TypeScript strict, ESM, named exports, small pure functions, no classes unless they earn it. Comments explain why, not what. Error messages say what happened and what to do.
