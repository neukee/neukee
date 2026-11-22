# Decisions

One entry per decision that changes architecture, dependencies, schemas, targets or scope. Newest first. Format: context → decision → consequences. Claude adds an entry whenever a task makes such a change, and never deletes old ones (superseded entries are marked as such).

---

## ADR-012 · Quality bar for every change (2026-11-22)

- **Context:** AI writes both the code and the tests here (ADR-007). T-002 showed how easily scope, size and cleverness grow: a validator, tests that derive from the schema, and edits to eight other tasks. The scanner also reads untrusted repos, so every reader is an attack surface.
- **Decision (Sreeram, 2026-11-22):** CLAUDE.md gets a "Quality bar (non-negotiable)" section:
  - the simplest code that passes the tests, with no abstraction or option before a second real use;
  - one task per PR, under about 300 source lines (tests and fixtures excluded);
  - Node's standard library first;
  - no `any`, no non-null `!`, no unchecked `as` (validate at the boundary), and exhaustive switches. The one narrow exception: a cast is allowed only for a file bundled in our own package and covered by a test that pins its exact shape. Never for scanned input, user config, environment variables or anything read at runtime from outside the package;
  - every scanned file treated as hostile: size cap, no symlinks out of the root, no `eval` or dynamic import, YAML without custom tags, linear-time regexes, and tests for malformed, empty, huge and CRLF input;
  - every bug fix starts with a failing test;
  - tests check behavior, not internals.
- **Enforcement:**
  - Biome makes `suspicious/noExplicitAny` and `style/noNonNullAssertion` errors, so `pnpm verify` and CI fail on them. A probe file containing both was rejected.
  - The rest is checked by the reviewer subagent (`.claude/agents/reviewer.md`, check 9) on every task, before the PR.
- **Existing code:** no Biome violations.
  - The unchecked `as` in `validateWithSchema` was removed; it now takes a typed `SchemaNode`.
  - One cast uses the exception, documented in place: `JSON.parse(...) as SchemaNode` for the bundled `scan-report.v1.json`. It meets both conditions: the file ships in `@neukee/core`, and `validate.test.ts` pins its exact shape (keywords, types, formats, value shapes, and the constraint snapshot). Sreeram chose to keep it (2026-11-22).
  - `value as ScanReport` in `validateReport` follows full validation, which is the allowed boundary pattern.
- **Consequences:**
  - Some tasks will need splitting to stay under about 300 source lines; the reviewer says how.
  - Snapshot and schema rules (ADR-011) are unchanged.

## ADR-011 · Report schema v1: strict validator, deterministic report, compatibility policy (2026-11-22)

- **Context:** T-002 adds the hand-written JSON Schema for `ScanReport` and `validateReport`. ARCHITECTURE §5 gives field types only. The task doesn't say how strict the schema is, what the validator returns, how the schema ships or evolves, or how findings are fully ordered. A schema that accepts anything the types allow would let absolute paths, control characters from untrusted file names, or typos reach reports, terminals and PR comments unnoticed.
- **Decision: the report is deterministic** (Sreeram, 2026-11-22).
  - `stats.durationMs` is removed from the type and the schema. It changed on every run, which broke SPEC-SCANNER target 6 (byte-identical output except `scannedAt`). `stats` now holds counts only.
  - Timing may come back later behind an opt-in flag (T-033).
  - v1 has never been published, so it changes in place. Under the compatibility policy below, the same removal after release would bump `schemaVersion`.
- **Decision: findings have a total order** (Sreeram, 2026-11-22). §4 listed four keys. `compareFindings` now breaks every tie. The sort keys come first, in Sreeram's order: severity, first location's file, line, column (absent sorts first), `ruleId`, `target.tool`, `target.version`, `message`. CodeRabbit showed that findings differing only in `title`, `fix`, `sourceUrl` or a later location still tied on those eight. So the remaining fields follow, in this order: `title`, `fix` (absent first), `sourceUrl`, then every location element by element (a shorter list first). The comparator returns 0 only for findings equal in every field. Text compares by code unit, never by locale. `target.version` compares as text (`"16"` sorts before `"9"`); the order only has to be stable, not semantic. Text comparison is plain code-unit order (`a < b ? -1 : a > b ? 1 : 0`), never `localeCompare` or `Intl.Collator`, which vary by locale and ICU version across Linux, macOS and Windows. A test shuffles 288 findings 100 times with a seeded generator and always gets identical output. 32 of them tie on all eight keys and differ only in the late keys.
- **Decision: what a valid v1 report is.** Everything below goes beyond §5.
  - Every object is closed (`additionalProperties: false`). This is our validator's check on our own output; consumers ignore unknown fields (compatibility policy).
  - Report paths (`Location.file`, `Diagnostic.file`) are canonical repo-relative paths. They never take an absolute, drive-letter, `scheme:`, backslash, `.`/`..`, empty-segment, trailing-slash, control-character (C0, DEL, C1) or bidi-override form. Repos are untrusted, and these characters can disguise a file name in terminal output or PR comments. Directory locations have no trailing slash (`app/@modal`).
  - `line` and `column` are 1-based integers, with columns in UTF-16 code units (JavaScript string indexes, editors).
  - `sourceUrl` is an https URL with a dotted host name, an optional port of 1–65535 with no leading zero, then an optional path, query or fragment. Userinfo and whitespace are rejected.
  - `title` is one line. Required strings are non-empty.
  - `ruleId` follows the catalog id grammar `^[a-z0-9][a-z0-9.-]*(?:/[a-z0-9][a-z0-9.-]*)+$`: lowercase, at least two segments.
  - `scannedAt` is RFC 3339 with a time zone (offsets up to ±14:00), and its date exists.
  - `root` is the literal `"."`. ARCHITECTURE §5 said `string`; the code has said `"."` since T-000, so the doc now matches.
  - `locations` may be empty, for repo-wide findings.
- **Decision: how `validateReport` works.**
  - No dependency (ADR-004). It interprets only the subset of draft 2020-12 the schema uses, with standard semantics: keywords next to `$ref` apply, and object keywords apply to any object.
  - It deviates from JSON Schema in one place, on purpose: it asserts `format: "date-time"` instead of treating it as an annotation, because a report must hold real values. Other formats are ignored. Tests fail if the schema uses a keyword, type or format outside `SUPPORTED_KEYWORDS`, `SUPPORTED_TYPES` or `SUPPORTED_FORMATS`.
  - It returns `{ valid: true, report }` or `{ valid: false, errors }`, and collects every error rather than stopping at the first.
  - Each error is `{ path, message }`. The path looks like `report.findings[0].severity`, and the message is a full sentence naming what was expected and what was found.
  - Errors follow schema order. Unknown keys and `additionalProperties` entries are checked in sorted order, so the output doesn't depend on input key order.
  - Values and keys in messages and paths are cut at 60 code points. Two very long keys that share their first 60 can therefore give the same `path`.
  - Every pattern must run in linear time on hostile input: no nested ambiguous quantifiers. Each was timed on 100k-character input.
- **Decision: how the schema ships and changes.**
  - The schema is published with `@neukee/core` (`files`) and exported as `@neukee/core/schema/scan-report.v1.json`.
  - `validateReport` reads it from disk relative to its own module, lazily, on the first call.
  - **Compatibility policy** (Sreeram, 2026-11-22; replaces "every change means v2"):
    - Within `schemaVersion: 1` we may add optional fields. Consumers must ignore unknown fields.
    - Removing, renaming or retyping a field, changing its meaning, or making an optional field required bumps `schemaVersion`.
    - Our validator stays strict (closed objects). Any addition updates the schema, the types and the tests in the same PR.
    - Every schema change needs an ADR, breaking or not.
  - A snapshot of every constraint (`packages/core/src/__snapshots__/validate.test.ts.snap`) fails until a schema change is made on purpose.
- **Consequences: later tasks were edited in this PR so the rules are where they'll be read.**
  - T-003: the catalog `id` uses the same grammar, shared from core.
  - T-004: normalization replaces `scannedAt` with a fixed value (`1970-01-01T00:00:00Z`) instead of removing it, so normalized reports still validate. `durationMs` no longer exists. This changes T-004's original wording.
  - T-005: a path that fails the `RepoPath` pattern is skipped with a diagnostic that has no `file`.
  - T-021: columns are 1-based UTF-16 code units.
  - T-031: renderers neutralise control and bidi characters and escape markdown in any repo-derived text.
  - T-032: SARIF sets `columnKind: "utf16CodeUnits"` explicitly, and needs a fallback location for findings with no `locations` if GitHub requires one.
  - T-034: fleet JSON wraps each report as `{ repo, report }`.
  - T-040: if the Action calls `validateReport`, its bundle ships `schema/` beside it.
  - T-033: a timing report, if it returns, sits behind an opt-in flag and stays out of the default JSON.
- **Confirmed by Sreeram (2026-11-22):** columns in UTF-16 code units, https-only sources, and lowercase rule ids (`node26/slowbuffer`, `native/node-rs-bcrypt`).

## ADR-010 · Claude runs the PR loop; Sreeram approves merges (2026-11-22)

- **Context:** after T-001, `main` is protected by a ruleset (PR required, `verify` and `quality` checks required, no force pushes). Having Sreeram push every task branch and open every PR by hand slows each task without adding safety, because nothing reaches `main` without a green PR and his merge.
- **Decision:** at the end of every task Claude runs `pnpm check:all`, pushes the task branch, opens the PR (`gh pr create --fill`), requests CodeRabbit, watches the checks, and fixes CI failures and real review findings. Merging still needs Sreeram's explicit yes every time. Pushing to `main`, force-pushing, deleting branches and publishing still need it too. The merge question names both actions (merge, then delete the task branch), so one yes covers both. `.claude/settings.json` pre-approves exactly one push command, `git push -u origin HEAD`, with no wildcard. It's used for the first push and every fix push, so it works whatever the local `push.default` is. Every other push form (deleting, mirroring, pruning, clustered flags such as `-qd`) falls back to Claude Code's default prompt. A blocklist on top of `git push *` can always be dodged by spelling flags differently, so it isn't used. Force-push patterns stay on "deny" as a backstop, and the ruleset on `main` is the real guard. The `gh pr`/`gh run` read and comment commands are allowed; `gh pr merge` is on "ask".
- **Consequences:** CLAUDE.md's ask-first rule, the brief §8, the `/next` skill and `docs/WORKFLOW.md` now say the same thing. Task branches are public as soon as they're pushed (the repo is public, ADR-005), so the same rule applies as for any public commit: no secrets, ever.

## ADR-009 · npm trusted publishing, no stored tokens (2026-11-21)

- **Context:** npm is retiring tokens that bypass 2FA. Since early August 2026 they can't manage accounts or packages, and npm is targeting January 2027 to remove their direct publishing. Our launch (Dec 6) falls just before that date and every later release after it. A security tool that ships with a stealable publish token undercuts its own pitch.
- **Decision:** release through npm trusted publishing (OIDC) from GitHub Actions. That gives short-lived, per-run credentials and automatic provenance. Never create a 2FA-bypass or automation token. Trusted publishing can't do a package's first publish, so Sreeram publishes v0.1.0 of each package manually with 2FA (T-055), then configures the trusted publisher and sets the package to "require 2FA and disallow tokens".
- **Consequences:** no npm secret in the repo or in GitHub settings. The release workflow needs `id-token: write`. Fallback if trusted publishing breaks: npm's staged publishing, with a human 2FA approval.

## ADR-008 · Name: Neukee, owned by GOkit4dev (2026-11-21)

- **Context:** the working name "Valore" collides with a live US registration for VALORE in Class 9 (software), owned by Agora E-Commerce LLC, registered September 24, 2024. Renaming costs nothing before the repo, npm scope and domain exist.
- **Decision:** the product is **Neukee** (CLI `neukee`, packages `@neukee/*`, export condition `@neukee/source`). The company is **GOkit4dev**, which will own several B2B developer tools over time. Public surfaces (GitHub org, npm scope, domain, site) use the product name, so the company name can change without touching the product.
- **Checks done (2026-11-21):** npm: `neukee` unscoped name and `@neukee` scope have no packages. Web search: no product or company named Neukee found. Not yet done: USPTO and India trademark search (T-053), GitHub org and domain availability (Sreeram).
- **Consequences:** every `valore` reference was renamed. Older artifacts (spec doc, execution plan, CTO brief) still say "Valore"; the brief and the repo are the source of truth.

## ADR-007 · Extra quality gates for an AI-built codebase (2026-11-19)

- **Context:** Claude writes both the code and the tests, and CodeRabbit is also AI, so their blind spots are correlated. A test that passes without checking anything can get past all of them.
- **Decision:** add tools that follow fixed rules. **Stryker** mutation testing (nightly full run; threshold rises to 80% on core and scanner in T-038). **Knip** for unused files, exports and dependencies. **publint** and **Are the Types Wrong** for package correctness (`pnpm pack:check`). **OpenSSF Scorecard**. **Dependabot** for Actions and npm. Every Action is pinned to a full commit SHA with a version comment. **CodeRabbit** reviews every PR with the rules from `CLAUDE.md` (`.coderabbit.yaml`). The dependency-direction rule stays a custom test (T-004) rather than dependency-cruiser, to avoid relying on the TypeScript compiler API that TypeScript 7 removed.
- **Consequences:** `pnpm check:all` = verify + knip + pack:check. CI runs `quality` next to the matrix. Scaffold mutation baseline: 62.9%. `fast-check` (property-based tests) is added in T-015 when the first parser lands.

## ADR-006 · Crowd signatures are opt-in and explicit (2026-11-19)

- **Context:** a future "Behavior Confidence" signal needs data across repos, but ADR-002 promises no network and no telemetry.
- **Decision:** ADR-002 stands for every scan and verification run. If crowd data ships (v1 at the earliest), it is a separate, explicit command that the user runs on purpose. It uploads only hashed change signatures (package, versions, change category, verdict), never code, paths or test names. The signature format is defined now (T-006) so it never needs a breaking change.
- **Consequences:** no silent telemetry, ever. Contributors get crowd data in return (give-to-get).

## ADR-005 · Public monorepo and licenses (2026-11-19; confirmed by Sreeram 2026-11-22)

- **Context:** the scanner is open source anyway; public repos get CodeRabbit, GitHub Actions minutes, CodeQL and Scorecard for free; the engine is the paid product and must not be taken by record/replay competitors.
- **Decision:** the repository is public from day one. `core`, `scanner`, `cli` and the Action are Apache-2.0 (root `LICENSE`, `NOTICE`). The engine package (`packages/engine`, when created) carries the Functional Source License (FSL-1.1, converting to Apache-2.0 after two years): source visible, no competing use.
- **Consequences:** this supersedes "private repo until launch" in T-001 and WORKFLOW. Sreeram confirmed on 2026-11-22: public from day one. If he chooses a closed engine instead, the engine lives in a separate private repository.

## ADR-004 · Allowed runtime dependencies (2026-11-18)

- **Context:** a security tool's dependency tree is part of what buyers review.
- **Decision:** runtime dependencies allowed without a new decision: `oxc-parser`, `yaml`, `semver`, `ignore` (for `.gitignore` matching). Anything else needs its own entry: why, maintenance status, install scripts, transitive count.
- **Consequences:** target 9 (< 40 transitive runtime dependencies) stays reachable.

## ADR-003 · The catalog is YAML with mandatory official sources (2026-11-18)

- **Context:** a wrong catalog entry is the fastest way to lose trust.
- **Decision:** one YAML file per entry; `sourceUrl` must be an official source on an allowed domain list; every entry has positive and negative fixtures; tests enforce both.
- **Consequences:** entries are slower to write and much harder to get wrong.

## ADR-002 · Local-first: no network, no server (2026-11-18)

- **Context:** customers will run this on private code; EU buyers and security teams care most about data leaving their network.
- **Decision:** the scanner and engine make no network calls and run only on the user's machine or CI. No telemetry. Enforced by tests.
- **Consequences:** no usage analytics from the product; adoption is measured through npm downloads, GitHub stars and conversations.

## ADR-001 · Stack (2026-11-18)

- **Decision:** TypeScript (strict, ESM), Node ≥ 22, pnpm workspaces, `tsc` builds, esbuild for the Action bundle, Vitest, Biome, oxc-parser, GitHub Actions, Changesets with npm provenance.
- **Why:** the users' own ecosystem; the fewest tools that cover build, test, lint and release; parsing that does not depend on the TypeScript compiler API.
- **Consequences:** contributors need only Node and pnpm.
