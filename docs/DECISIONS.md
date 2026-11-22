# Decisions

One entry per decision that changes architecture, dependencies, schemas, targets or scope. Newest first. Format: context → decision → consequences. Claude adds an entry whenever a task makes such a change, and never deletes old ones (superseded entries are marked as such).

---

## ADR-010 · Claude runs the PR loop; Sreeram approves merges (2026-11-22)

- **Context:** after T-001, `main` is protected by a ruleset (PR required, `verify` and `quality` checks required, no force pushes). Having Sreeram push every task branch and open every PR by hand slows each task without adding safety, because nothing reaches `main` without a green PR and his merge.
- **Decision:** at the end of every task Claude runs `pnpm check:all`, pushes the task branch, opens the PR (`gh pr create --fill`), requests CodeRabbit, watches the checks, and fixes CI failures and real review findings. Merging still needs Sreeram's explicit yes every time. Pushing to `main`, force-pushing, deleting branches and publishing still need it too. The merge question names both actions (merge, then delete the task branch), so one yes covers both. `.claude/settings.json` allows `git push` and the `gh pr`/`gh run` read and comment commands. It keeps `gh pr merge` and every branch-deleting push form (`--delete`, `-d`, `:branch`, `--mirror`, `--prune`) on "ask", and denies force pushes in any form (`--force`, `-f`, `+` refspecs).
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
