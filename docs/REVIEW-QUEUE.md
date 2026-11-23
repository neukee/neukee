# Human review queue

Work that a qualified person must look at. Claude adds items when a task is marked `Human review: yes`, when it is unsure about correctness or security, or when a reviewer's eye would catch what tests cannot. `/review-prep` turns this into a weekend review pack.

**Rules for reviewers:** every reviewer knows the whole project and has a written agreement (paid, advisor equity or open-source credit). Reviews happen on pull requests on GitHub, so comments stay with the code.

## Waiting for review

_Nothing waiting._

| Added | Task | What to check | Files | Risk if wrong |
| ----- | ---- | ------------- | ----- | ------------- |

## Follow-ups (logged, not fixed)

Minor findings deliberately left for later (CLAUDE.md "Merging": after the third round of minor findings, log instead of fixing). Pick one up only when it starts to matter.

| Added      | From              | Item                                                                                                                                                                                                                                                                                                                                               | Files                               |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 2026-11-22 | PR #4, CodeRabbit | Size check excludes only `*.test.ts`. Exclude test files by any naming (`*.test.js`, `*.spec.ts`, `tests/` folders) once the repo has them.                                                                                                                                                                                                        | `.claude/agents/reviewer.md`        |
| 2026-11-22 | PR #4, CodeRabbit | The untracked-file count splits names with spaces at `xargs`. Use NUL-delimited paths (`git ls-files -z`, `grep -z`, `xargs -0`) if such files ever appear.                                                                                                                                                                                        | `.claude/agents/reviewer.md`        |
| 2026-11-22 | T-004 review      | `packages/cli/src/run.ts` reads `package.json` with an unchecked `as` (T-000 code), which the Quality bar forbids for runtime reads. Validate the parsed value when T-033 rewrites the CLI.                                                                                                                                                        | `packages/cli/src/run.ts`           |
| 2026-11-23 | PR #7, CodeRabbit | The dependency-direction test's trivia matcher handles CR/LF but not U+2028/U+2029 line terminators or all ECMAScript whitespace. A forbidden import after a line comment using those separators may evade the test guard; revisit with explicit regressions if this guard is expanded. Deferred after the third minor review round per CLAUDE.md. | `test/dependency-direction.test.ts` |
| 2026-11-23 | T-005a review     | `fixtures/gitignore/generate.mjs` starts processes and deletes folders, but Biome, typecheck and Knip skip `fixtures/` (Biome can't re-include one file from an excluded folder). Move the `CASES` data to a JSON file beside it and the ~50-line script to `scripts/`, so it is linted.                                                           | `fixtures/gitignore/generate.mjs`   |
| 2026-11-23 | T-005a review     | Invalid UTF-8 in a `.gitignore` or a file name decodes to U+FFFD on both sides, so a rule could match a name it shouldn't (the unsafe direction). Git cuts a rule at a NUL byte; we keep it (safe direction). Decide in T-005b follow-up whether to compare raw bytes.                                                                             | `packages/scanner/src/discover.ts`  |
| 2026-11-23 | T-005a review     | macOS may store a file name decomposed (NFD) while the rule is composed (NFC), so the rule doesn't match and the file is scanned (fail open). Revisit if users report noise from ignored files with accented names.                                                                                                                                | `packages/scanner/src/gitignore.ts` |

## Reviewed

| Date       | Task            | Reviewer | Outcome                                                                                                                                   |
| ---------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-23 | ADR-015 budget  | Sreeram  | Confirmed: 1,000,000 matching steps per path. A scan-wide budget follows in T-005c (under 10 s worst case, fail open with one diagnostic) |
| 2026-11-22 | ADR-005         | Sreeram  | Confirmed: public repo from day one; Apache-2.0 scanner, core, CLI and Action; FSL engine                                                 |
| 2026-11-22 | Brief §5        | Sreeram  | Target customer confirmed (20–200 engineers, Node.js or Next.js, integration tests, SOC 2)                                                |
| 2026-11-22 | T-001           | Sreeram  | Repo, ruleset on `main`, required checks and CODEOWNERS set up; PR #1 proved checks block merge                                           |
| 2026-11-22 | T-002 / ADR-011 | Sreeram  | Confirmed: columns in UTF-16 code units; `sourceUrl` https only; lowercase rule ids                                                       |
