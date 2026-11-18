# Valore — project memory for Claude

Working name **Valore** (trademark check pending; rename in T-053). A local-first verification tool for Node.js and Next.js upgrades. First product: the **scanner** (static analysis, launch target **December 6, 2026**). Later: the **engine** (behavioral comparison on the customer's tests).

## Read before working

- `docs/ARCHITECTURE.md` — the source of truth for structure, types, security model and quality gate.
- `docs/SPEC-SCANNER.md` — exact scanner behavior and the launch targets.
- `docs/TASKS.md` — the ordered task list. Work only on the task `/next` selects.
- `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/REVIEW-QUEUE.md` — where things stand, why, and what needs a person.

## Commands

- `pnpm install` · `pnpm verify` (typecheck + lint + tests; must pass before any task is done)
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:fix`, `pnpm build`
- Tests for one package or file: `pnpm test packages/scanner` (Vitest filters by path)

## How to work (every task)

1. Restate the task's "Done when" criteria in your own words before writing code.
2. Write or extend tests first (fixtures for scanner rules: positive and negative). Run them and see them fail.
3. Implement the smallest change that makes them pass. Stay inside the task's scope.
4. Run `pnpm verify`. Read failures; fix causes, not symptoms.
5. Ask the `reviewer` subagent to review the diff against the task and the specs. Fix what it finds, re-run `pnpm verify`.
6. Update `docs/TASKS.md` (status), `docs/PROGRESS.md` (log entry with what changed and the verify result), `docs/REVIEW-QUEUE.md` (if human review is required or you are unsure), `docs/DECISIONS.md` (if you changed architecture, schema, dependencies or targets).
7. Commit on a branch named `t-XXX-short-name` with message `T-XXX: <what changed>`. Never commit to `main` directly.

## Rules (non-negotiable)

- **Never weaken, skip or delete a test to make something pass.** If a test is wrong, fix it in a separate commit and explain why.
- **Never update a snapshot without saying why** in the commit message and PROGRESS.
- **No network access in product code or tests.** No `fetch`, sockets or DNS. Tests block the network on purpose.
- **Never run the scanned project's code, scripts or package manager.** The scanner only reads files.
- **No absolute paths, secrets or file contents in reports** beyond the single line that locates a finding.
- **Catalog entries come from official sources only.** Fetch and read the source before writing an entry; paste the exact URL. Never write an entry from memory.
- **New runtime dependencies need a decision** in `docs/DECISIONS.md` first (see ADR-004 for the allowed list).
- **Respect the dependency direction:** `action → cli → scanner → core`; `core` imports nothing internal.
- **Deterministic output:** sort findings; no timestamps except `scannedAt`; no `Math.random`.
- **Detectors never throw.** Errors become `Diagnostic` entries; one bad file never stops a scan.
- **Stop and ask the person** before: changing core types or the report schema, changing CI or release workflows, changing Action permissions, deleting files outside the current task, or anything that pushes, publishes or deletes branches.

## When you are unsure

Say so. Add the question to `docs/REVIEW-QUEUE.md` with the file and the risk, and continue with what is certain. A wrong guess in a security tool costs more than a pause.

## Style

TypeScript strict, ESM, named exports, small pure functions, no classes unless they earn it. Comments explain why, not what. Error messages say what happened and what to do.
