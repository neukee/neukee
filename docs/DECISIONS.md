# Decisions

One entry per decision that changes architecture, dependencies, schemas, targets or scope. Newest first. Format: context → decision → consequences. Claude adds an entry whenever a task makes such a change, and never deletes old ones (superseded entries are marked as such).

---

## ADR-022 · CLI targets: a default per tool, one target per tool, an incomplete catalog (2026-11-27)

- **Context:** T-033 built `neukee scan`. Three behaviors weren't fixed by the spec: whether a named target removes the Node.js default, whether a tool may have several targets, and what to do with a catalog that loads but lacks a rule the scanner needs. The scanner skips a rule it can't find, so an incomplete catalog would look like a clean repository.
- **Decision (Sreeram, 2026-11-27):**
  - **One target per tool for v0.1.0.** `--target node@24 --target node@26` is a usage error that says to run once per target. (`runtimeFindings` uses one Node.js target; fleet and the audits may want several later.)
  - **A named target replaces the default only for its own tool.** `--target next@16` still checks Node.js against the default `node@26`, with ADR-021's softening, because that Node.js target came from the default.
  - **The report says where each target came from (approved by Sreeram, 2026-11-27: a core type and schema change).** `ScanReport.targets` is a list of `ReportTarget`, a `Target` plus `source`: `"flag"` for a target named with `--target`, `"default"` for one the scanner added. The `Targets` line prints `node@26 (default)` from it, and `runtimeFindings` softens below-target when the Node.js target's source is `"default"`, so there is no separate flag to pass around. `Finding.target` stays a plain `Target`.
  - **`schemaVersion` stays 1.** `source` is a required field, and the compatibility policy would bump the version for that. There is no npm release yet (the pkg.pr.new previews of ADR-019 are per-commit builds, not releases), so no consumer depends on the schema. After v0.1.0 is published, a change like this bumps `schemaVersion`.
  - **An incomplete catalog exits 3**, like a missing, broken or empty one, naming the rule ids it lacks (`missingRuleIds` in the scanner).
  - **The catalog ships inside `@neukee/cli`** (task T-033b), so a preview or published install can scan.
- **Consequences:** SPEC-SCANNER §1 and ARCHITECTURE §5 record all of it. ADR-021's "no `--target`" now reads "no Node.js `--target`". The core types, `packages/core/schema/scan-report.v1.json` and the constraint snapshot change in the same PR; the golden reports gain `"source"` in `targets`. T-032's JSON and SARIF output carry the source.

## ADR-021 · Default target node@26 at launch, with a coverage note and a softened below-target (2026-11-25)

- **Context:** Node.js 26 entered Active LTS on 2026-10-28 and Node.js 24 moved to Maintenance LTS on 2026-10-20 (the official release schedule). The scanner's default target was `node@24`. But v0.1.0 has no rules for APIs removed in Node 23 to 26 (T-024 and T-025 are post-launch, ADR-013), and an implicit target would make `runtime/below-target` flag every repository on a supported LTS.
- **Decision (Sreeram, 2026-11-25):**
  - **The default target is `node@26`** (and the latest supported major of each detected framework, as before). SPEC-SCANNER §1.
  - **Coverage note.** Every report says plainly that v0.1.0 checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26, and that those rules come after launch. The renderers and the CLI (T-031, T-033) print it.
  - **Softened below-target, exactly:** when the Node.js target came from the default (no Node.js `--target`), `runtime/below-target` is `info` if the declared line has at least 12 months of support left from the scan date (`scannedAt`), and `warning` if it has less. An explicit `--target` is never softened. Its catalog severity is `warning`. On 2026-11-25 that makes Node 24 `info` and Node 22 a `warning`. Fixtures: 24 (info), 22 (warning), and 22 with `--target node@26` (warning).
  - **T-024 stays where it is.** The `/checkpoint` on Saturday, Nov 28 decides whether it moves up.
- **Consequences:** `runtimeFindings` reads the Node.js target's `source` (`"default"` softens below-target; ADR-022), and T-033 sets it. T-031 and T-033 print the coverage note.

## ADR-020 · Runtime findings: per-package scope, ungated catalog entries, semver (2026-11-25)

- **Context:** T-014 turns T-010's Node.js version declarations into findings. Three questions came up: how monorepos scope `runtime/sources-disagree`, how rules that aren't tied to a release fit a catalog whose entries all need `applies.introducedIn`, and how to check a pin against an `engines.node` range.
- **Decision (Sreeram, 2026-11-25):**
  - **Scope per package, never across packages.** A package is any folder with a `package.json`, the root included. Pins are `.nvmrc`, `.node-version` and `volta.node`; `engines.node` is a range. A package's `.nvmrc` or `.node-version` is its own, else the nearest in a parent folder, the way nvm resolves `.nvmrc`. `volta.node` applies to its own package only (Sreeram, 2026-11-25): Volta's docs say a nested package shares a root pin only through `"extends"`, which isn't followed yet, so such a package gets no Volta pin rather than a wrong one. A package disagrees when two applicable pins name different majors, or an applicable pin is outside its `engines.node`. Majors only; `lts/*` never disagrees. Each declaration says which folders it covers, so Dockerfiles (their own folder) and GitHub Actions (repo-wide unless `node-version-file` says otherwise) plug in later without rework. No special cases for `examples/` or `fixtures/`; T-050 shows whether they're noisy. Details in SPEC-SCANNER §2.1.
  - **`applies.introducedIn` is optional** (amends ADR-014). Without it a rule has no version gate. The three runtime rules are ordinary catalog entries with sources and positive and negative fixtures.
  - **`semver`** joins the scanner for range checks (`intersects`, `gtr`), as ADR-004 allows. Sreeram approved adding it.
  - **`docs.npmjs.com` becomes an official host** (amends ADR-014). `runtime/sources-disagree` cites npm's `engines` documentation, because Node's own docs don't describe the field.
- **Choices in T-014, for review:**
  - severities: all three are `warning`; `runtime/below-target` softens to `info` under the default target (ADR-021);
  - runtime findings need a `node` target;
  - end-of-life is dated by the date in the report's `scannedAt` against the official release schedule (copied into `packages/scanner/src/node-releases.ts` with its source), so a scan is deterministic for its date; `runtime/end-of-life` cites https://nodejs.org/en/about/eol;
  - an `engines.node` range is "below the target" only when every version it allows is.
- **Consequences:** T-011 and T-012 add their sources by extending the declaration's `source` and its coverage; the compiler flags every switch to update. T-030 assembles these findings into the report.

## ADR-019 · Continuous preview packages with pkg.pr.new (2026-11-24)

- **Context:** reviewers and design partners need to try a pull request's build without cloning the repo, and nothing goes to npm before v0.1.0 (ADR-009, T-055). pkg.pr.new publishes npm-compatible preview packages to its own URLs, not to npm.
- **Decision:** `.github/workflows/pkg-pr-new.yml` publishes `@neukee/core`, `@neukee/scanner` and `@neukee/cli` on every pull request from this repository and every push to `main`. The three packages drop `"private": true`, because pkg.pr.new skips private packages; the root stays private. They gain `repository`, `homepage` and `bugs` fields, which `--compact` URLs and npm provenance both need. `pkg-pr-new` is a root dev dependency pinned to an exact version, so the lockfile carries its integrity hash.
- **Safety:** fork pull requests are skipped, so nobody else's code becomes installable under the neukee/neukee name. The workflow's token is read-only; the pkg.pr.new GitHub App posts the comment. Accidental npm publishing stays blocked by 2FA and by having no npm token anywhere (ADR-009).
- **Consequences:** previews install from URLs like `https://pkg.pr.new/neukee/neukee/@neukee/cli@<sha>`; after the packages exist on npm, `--compact` shortens them on its own. One manual step: install the pkg.pr.new GitHub App on neukee/neukee.

## ADR-018 · Lead offer, audit pricing, pitch and market stance (2026-11-23)

- **Context:** the brief priced the audit as an assumption ($300–1,500) and listed competitors without a clear stance on each. NodeSource and the OpenJS Foundation give Node.js-only upgrade assessments for free and sell a paid blueprint from $2,499, so Node.js end-of-life alone is not a strong headline.
- **Decision (Sreeram, 2026-11-23):**
  1. **Lead offer:** a Next.js 16 upgrade audit that includes the Node.js runtime. Node.js end-of-life is supporting urgency, not the headline.
  2. **Audit:**
     - list price $800, and $400 for the first 5 founding audits;
     - payment on delivery, and free if nothing is actionable;
     - delivered from the report the customer generates locally, with no access to their repository.
  3. **Subscription:** per-organization size tiers, never per repository.
  4. **Pitch pillars:**
     - sourced findings, each with a file and line;
     - nothing leaves the customer's machine;
     - we never sell the fix;
     - a dated report the customer can show auditors.
  5. **Proof before claims:**
     - publish measured precision and recall from the answer-key repositories;
     - benchmark NodeSource's CLI on the same repositories before making any comparison.
  6. **Market stance:**
     - NodeSource is the free floor plus paid services (the OpenJS LTS Upgrade program);
     - Speedscale is the engine's competitor (behavioral diffs on PRs);
     - HeroDevs and TuxCare are adjacent (extended support);
     - Codemod is a complement: we link the official fix;
     - staffing firms are a post-launch channel, with per-audit pricing and never referral fees;
     - a later option is to become an OpenJS upgrade-program partner.
- **Consequences:**
  - BRIEF §5 (decisions in force) and §6 (market table) carry these.
  - Public comparisons wait for measured precision and recall, and for the NodeSource benchmark on the same repositories.
  - The thin path's findings feed the answer-key repositories (`docs/VALIDATION.md`).

## ADR-017 · Launch scope trim; Dec 15 fallback (2026-11-23)

- **Context:** at the 2026-11-23 wrap, 26 tasks remained to T-055 with 14 days to the Dec 7 checkpoint: about 1.9 a day needed, against a recent pace of 1–1.5.
- **Decision (Sreeram, 2026-11-23):**
  - **Moved to Phase 5 (post-launch):** T-013 (deployment config runtime sources), T-035 (performance benchmark) and T-036 (network-free CI job). T-014 then depended on T-011 and T-012 only (superseded the same day by the thin path below: T-014 depends on T-010).
  - **T-027 (MergeWarden comparison)** moves to the strategy chat; it is no longer a repo task.
  - **Added:** T-005c, a scan-wide `.gitignore` matching budget (worst case under 10 s, fail open with one diagnostic), right after T-005b.
  - **README (GitHub kit):** the runtime row drops "Vercel, Netlify, Serverless and AWS SAM config". Deployment config joins the post-launch roadmap line.
  - **If the `/checkpoint` after T-005b still shows more than 3 days behind,** propose moving launch to Tuesday, Dec 15, rather than cutting validation.
  - **Added 2026-11-24 (Sreeram):** T-005d, dropped negations fail open, after the thin path. It must not delay T-010.
  - **Thin end-to-end path first (Sreeram, 2026-11-23, later the same day):** after T-005b and T-005c, build T-010 → T-014 → T-030 → T-031 → T-033, each scoped to what the path needs. T-014 works from T-010's sources (T-011 and T-012 plug in later, and T-011 carries the Dockerfile check), T-030 assembles runtime findings without T-019, and T-033 leaves JSON and SARIF to T-032. Goal: by Saturday, Nov 28, `neukee scan` runs on a real public repository and prints a real finding. The remaining detectors follow in their existing order. Same gates on every task. Guardrails: T-014 and T-030 follow ARCHITECTURE's full interfaces, implementing only what the path needs; the date moves if a gate fails; every real-repo finding must be one the maintainer would agree with, with false positives and negatives logged in `docs/VALIDATION.md`; nothing is published before the launch scope is done.
- **Consequences:**
  - Launch targets 4 (speed and memory) and 5 (zero network calls: a CI job in addition to the unit-test guard) are measured after launch. The unit tests still block the network in every test run.
  - 23 tasks remain to launch: T-005b to T-055 less the four above, plus T-005c.

## ADR-016 · Speedrun workflow: standing merge approval, two tasks in flight, docs-sync, model routing (2026-11-23)

- **Context:** each merge waited for Sreeram, tracking docs in every task PR conflicted between PRs, and every review ran on Opus. ADR-010's loop was too slow for the Dec 7 checkpoint.
- **Decision (Sreeram, 2026-11-23):**
  - **Standing merge approval** for every task PR when all of these hold:
    - the 4 verify jobs and the quality job are green;
    - CodeRabbit reviewed the latest commit and every thread is resolved;
    - the reviewer's **PASS** verdict is quoted in the PR, with the SHA it reviewed, and that SHA is the head (a CHANGES REQUIRED verdict blocks the merge until a new review of the head passes): any commit after a PASS gets its own reviewer run on just those commits (Opus for a foundational task or a change to matching logic, Sonnet otherwise; Sreeram, 2026-11-24), and the new verdict is quoted with the new head SHA (Sreeram, 2026-11-23);
    - the four-line check shows no core type or schema change, no new dependency, and no CI, workflow, permission or security-model change.
      Anything else: stop and ask. Squash-merge with the PR title in Conventional Commits form.
  - **At most two tasks in flight:** one building and one in review, in separate worktrees. Never two building at once.
  - **Daily docs-sync PR:** task PRs don't touch `docs/PROGRESS.md`, `docs/TASKS.md` or `docs/REVIEW-QUEUE.md`; ADRs stay in the task PR. Resume-here updates go on the day's `docs-sync/YYYY-MM-DD` branch, pushed after each update and merged at `/wrap` under the docs-only rule.
  - **Model routing:** the reviewer subagent defaults to Sonnet. Foundational reviews (hostile-input parsing: T-005b, T-005c, T-015, T-016, T-021) pass Opus explicitly. The reviewer's scope is the diff, the task and the spec sections it touches.
  - **Rule changes need explicit approval:** changes to `CLAUDE.md` or anything under `.claude/` (agents, skills, hooks, settings) always need Sreeram's explicit approval, even in a docs-only or docs-sync PR. He approved the rule changes in PR #10, all requested on 2026-11-23.
- **Consequences:** CLAUDE.md ("How to work", "Merging") and `.claude/agents/reviewer.md` carry these rules. This amends ADR-010: merges no longer wait for Sreeram when the conditions hold.

## ADR-015 · Our own .gitignore matcher; caps; symlinks never followed (2026-11-23)

- **Context:**
  - T-005 discovery must apply `.gitignore` files from scanned repositories, which are hostile input (ARCHITECTURE §7). ADR-004 allowed the `ignore` package for this, but `ignore` compiles each rule into a backtracking regular expression. A rule like `*a*a*a*a*a*a*a*a*b` can take seconds against a short name.
  - Copilot's first version hand-wrote a matcher without recording why. It was quadratic on `**` chains (a 1 MB rule ≈ 95 s per file), mishandled anchored wildcards, and scored 46% on mutation testing.
- **Decision (Sreeram, 2026-11-23):**
  - **Own matcher** (`packages/scanner/src/gitignore.ts`, T-005a):
    - rules are parsed once into tokens, with no regular expression built from rule text;
    - matching works on UTF-8 bytes, like git;
    - a segment match backtracks only to the last `*`, and a path match is a segment DP that stops once nothing is reachable;
    - rules are tried last to first (the last match decides), and an anchored rule whose depth can't fit the path is rejected at once;
    - repeated `**` segments collapse at parse time, each run keeping the fewest folders it needs;
    - classes are 256-bit sets.
      The semantics are git's (wildmatch), and tests compare the matcher with a table generated once from real git. **ADR-004 is amended:** `ignore` is not used for scanned input.
  - **Caps, fail open:**
    - a rule line over **1 KiB** is dropped;
    - a `.gitignore` over **64 KiB** is skipped;
    - at most **2,000 rules** are in force at once.
      Anything over a cap is skipped with a diagnostic naming the file, and the scan continues. It may then scan a few more files, which is the safe direction.
  - **Work budget per path (added 2026-11-23 after the reviewer measured 3–19 s per path for segment-heavy rules at the caps; confirmed by Sreeram, 2026-11-23):** each path gets **1,000,000 matching steps** (name bytes compared plus path positions tried). If the rules haven't decided by then, the answer is "too-costly": the path stays in the scan and T-005b reports it (fail open). The caps alone don't bound the work, because the cost multiplies rules × rule length × path length.
    - Measured on a development Mac, 2,000 rules at the caps: the worst hostile shapes take about 6–10 ms per path, then answer "too-costly". A heavy real-world `.gitignore` (2,000 varied rules) takes about 1.2 ms per path and never reaches the budget.
    - So a hostile repository costs at most about 10 ms per file and folder: about 100 s for 10,000 paths. T-005c adds a scan-wide budget (below).
  - **Work budget per scan (T-005c; Sreeram asked for a worst case under 10 s, fail open with one diagnostic, 2026-11-23):** a whole scan gets **200,000,000 matching steps**, and each path draws its share (at most the per-path 1,000,000) from it.
    - Every piece of work is charged at about its measured cost: reading the path and resolving each `.gitignore` base (path length plus 16 per segment), each rule tried (4), each DP row allocated (8), and parsing each `.gitignore` (48 per byte, which covers the costliest parse shape measured: long runs of `/`).
    - Measured on a development Mac, every tested matching shape spends the whole budget in 1.2–2.3 s, and every tested parsing shape in under 1.4 s (one-character rules, unsupported classes, slash runs, segments, escaped slashes, class ranges). The shapes are T-005a's hostile ones plus short anchored rules, one `.gitignore` in each of 400 nested folders, and `!*` as the last rule. These are measurements of the tested shapes on one development machine, not a guaranteed bound: an untested shape or a slower machine may take longer. A test scales a slice of each shape up to the full budget and fails above 10 s, so CI checks the bound for every tested shape.
    - Once the budget is spent, the rest of the scan applies no `.gitignore` rules and parses no more `.gitignore` files (fail open), and one diagnostic names the path where it ran out.
    - **A `.gitignore` that can't be applied** (over 64 KiB, unreadable, or past the rules-in-force cap) might have re-included files that a parent rule ignores. So its folder and everything below apply no inherited rules either (fail open; CodeRabbit on PR #10).
    - **The bar (Sreeram, 2026-11-23):** a large real-world `.gitignore` of 300 varied rules never runs out on a 25,000-path repository (measured: it lasts 27,808 paths; the test counts files only, while a real scan also pays for folders and nested bases). In the tested workloads (paths of about 50–60 bytes and 5–6 segments), a typical 15-rule file never runs out on 100,000 paths, and an extreme 2,000-rule file runs out after about 4,400 paths and then fails open. These are measurements of that workload, not guarantees: the charge grows with path length, so a repository of very long paths spends the budget sooner, even with few rules.
  - **Symlinks are never followed**, inside or outside the root. Each one is reported as skipped with a diagnostic. This is simplest and safest for v0.1, and can be revisited after launch.
  - **Deliberate differences from git:**
    - POSIX classes (`[[:digit:]]`) aren't supported: any `[:` inside a class drops the rule with a problem (even `[[:x]`, which git reads as a plain class), and the file stays in the scan;
    - a `/` inside a class (`a[!/]b`, `[a/]b`), which git accepts, makes the class read as unclosed, so the rule is dropped with a problem;
    - matching is case-sensitive, while git defaults to case-insensitive on macOS and Windows;
    - unclosed classes and trailing backslashes match nothing, as in git, but are reported as problems.
- **Consequences:**
  - T-005 splits into T-005a (the matcher) and T-005b (the walker, the safe reader and the scan wiring; PR #8 reworked), to stay near the size guideline and to test the matcher alone.
  - The generator script lives in `fixtures/gitignore/`. Rerun it when git's behaviour is in question.

## ADR-014 · Catalog layout and loader rules (2026-11-22)

- **Context:** T-003 builds `loadCatalog`. The task says "id matches file path", and catalog/README.md had suggested `catalog/<tool>/<name>.yaml`. With that layout one id could live in two folders, and `node24/x` and `node26/x` would collide. The reviewer subagent also found that the loader crashed on one bad file and that a runtime check for fixture folders would fail in the npm package.
- **Decision:**
  - **Path = id:** an entry lives at `catalog/<id>.yaml` (`catalog/next16/sync-request-apis.yaml`). Duplicate ids are impossible, and ids with three or more segments map to nested folders.
  - **Official hosts:** `nextjs.org`, `nodejs.org`, `react.dev`, `www.prisma.io`, and `docs.npmjs.com` (added by ADR-020 for npm's `engines` documentation). Adding a host needs a line in this ADR, approved through its PR. The check uses the URL API, no regex (Sreeram, after a CodeQL alert on the old regex):
    - https only, with no username, password or port;
    - the hostname must equal an official host exactly;
    - the URL must already be canonical (`new URL(v).href === v`), because the parser silently strips whitespace, drops an explicit `:443` and lowercases the host. So an uppercase host is rejected, not normalized.
  - **Closed fields:** unknown keys are errors. Required: `id`, `title` (one line), `applies.tool`, `applies.introducedIn` (`x.y.z`), `severity`, `detector`, `message`, `sourceUrl`, `fixtures.positive`, `fixtures.negative`. Optional: `fix`.
  - **Fixtures:** the loader checks that both paths sit under the top-level `fixtures/` folder. The real-catalog test checks that the folders exist, because the npm package ships the catalog without fixtures.
  - **YAML as untrusted input:**
    - The catalog is ours, but the guards cost little: core schema only, and any parser warning is fatal, which rejects custom tags (`!!js/function`, YAML 1.1 `!!binary`) and merge keys.
    - The library caps aliases, which stops alias bombs.
    - Files over 64 KiB are rejected, symlinks are not followed, and the extension must be lowercase `.yaml`.
  - **One bad file never stops the load.** It becomes one error naming the file (the first problem found), and the other entries still load. Entries are sorted by id and errors by file.
  - **Everything under `catalog/` is an entry,** so other data, such as Node release dates for T-014, lives elsewhere.
- **Consequences:**
  - catalog/README.md and ARCHITECTURE §3 and §6 describe the new layout.
  - ARCHITECTURE §6's example is now the real entry, whose text was checked against the Next.js 16 guide.
  - T-014 picks a location outside `catalog/` for release data.
- **Declined (Sreeram, 2026-11-22):** CodeRabbit's file-swap race (TOCTOU) hardening for the catalog: reading from the checked file descriptor and re-checking folders before descending. Catalog files are trusted package content, and exploiting the race needs write access to the package folder, which already allows editing the entries. The same defenses are required where they matter, for scanned files in T-005 (ARCHITECTURE §7).
- **Confirmed by Sreeram (2026-11-22):**
  - The `catalog/<id>.yaml` layout. The loader rejects an entry whose id doesn't match its path; that same rule makes duplicate ids impossible, and a test pins it.
  - The fixture check in a test. Every entry needs a non-empty positive and negative fixture folder; the check runs in CI through `pnpm verify`.
  - 322 source lines for T-003.

## ADR-013 · Launch scope and date: Option A, launch Tuesday Dec 8 (2026-11-22)

- **Context:** at the 2026-11-22 wrap, 33 tasks remained up to the Dec 5 validation checkpoint, with 13 days left. The measured pace was about 1 task per session. The full plan didn't fit.
- **Decision (Sreeram, 2026-11-22): Option A, with three changes.**
  1. **Keep a minimal native-addon detector (T-020).** Flag dependencies that build native code at install time, from the lockfile's install-script flags only, with no version table and no network lookups. It's the headline finding in the outreach pitch.
  2. **Defer the packaged GitHub Action (T-040).** At launch the README ships a copy-paste workflow that runs the CLI and uploads SARIF to GitHub code scanning (T-054).
  3. **Launch moves to Tuesday, Dec 8.** The validation checkpoint moves to Dec 7.
- **Moved to "Phase 5 — Post-launch (first 2 weeks)"**, in this order:
  1. Yarn v1 lockfiles (T-017).
  2. Node 26 rules (T-024, T-025). T-025 also carries the `node24/*` and `node-any/md4-hash` rules, so they move too.
  3. Packaged GitHub Action (T-040).
  4. Yarn Berry (T-018).
  5. Nightly corpus job (T-037).
  6. Fleet mode (T-034).
  7. Change-signature schema (T-006).
  8. Also deferred under Option A, so last: Next 15 fetch caching (T-026) and the mutation-score target (T-038).
     T-056 (UpgradeBench, due Apr 30) moves to its own phase after these, so `/next` doesn't pick it first.
- **Kept before launch, though Option A didn't list them:**
  - T-027 (MergeWarden comparison): the brief says to do it before launch.
  - T-035 (performance benchmark): launch target 4.
  - T-036 (network-free CI check): launch target 5.
- **Security review (T-052):** no longer blocks launch. It reviews the packaged Action too, so it follows T-040, and it's due by Mar 31 (brief §7). It moves; it isn't cut.
- **Consequences:**
  - 27 tasks remain to launch, 23 of them by the Dec 7 checkpoint: about 1.5 tasks a day.
  - A repo with `yarn.lock` gets a diagnostic and falls back to `package.json` ranges until T-017 (noted on T-019).
  - The brief (v1.4), PROGRESS, TASKS, SPEC-SCANNER §4, ARCHITECTURE, README, WORKFLOW and the `/checkpoint` skill carry the new dates.
  - The first `/checkpoint` after T-005 re-measures the pace.

## ADR-012 · Quality bar for every change (2026-11-22)

- **Context:** AI writes both the code and the tests here (ADR-007). T-002 showed how easily scope, size and cleverness grow: a validator, tests that derive from the schema, and edits to eight other tasks. The scanner also reads untrusted repos, so every reader is an attack surface.
- **Decision (Sreeram, 2026-11-22):** CLAUDE.md gets a "Quality bar (non-negotiable)" section:
  - the simplest code that passes the tests, with no abstraction or option before a second real use;
  - one task per PR, under about 300 source lines (tests and fixtures excluded);
  - Node's standard library first;
  - no `any`, no non-null `!`, no unchecked `as` (validate at the boundary), and exhaustive switches. The one narrow exception: a cast is allowed only for a file bundled in our own package and covered by a test that pins its exact shape. Never for scanned input, user config, environment variables or anything read at runtime from outside the package;
  - every scanned file treated as hostile: size cap, no symlinks out of the root, no `eval` or dynamic import, YAML without custom tags, linear-time regexes, and tests for malformed, empty, huge and CRLF input;
  - every bug fix starts with a failing test;
  - tests check behavior, not internals;
  - fixtures live only in the top-level `fixtures/` folder, and the reviewer flags fixtures anywhere else.
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
  - T-031: renderers neutralise control and bidi characters and escape markdown in any repo-derived text. Markdown (Sreeram's paste test through GitHub's Markdown API, 2026-11-27): backslash escapes and HTML entities don't stop a mention, an issue link, an emoji or a mailto link, so values (paths, versions, rule ids, targets) are code spans, and prose gets an empty `<span></span>` right after every `@`, `#` and emoji colon (an empty HTML comment fails inside table cells). No zero-width characters, which break copying package names. The output therefore holds raw HTML, which a strict CommonMark viewer shows literally, and `a:b:c` becomes `a:<span></span>b:c` because `:b:` looks like an emoji name.
  - T-032: SARIF sets `columnKind: "utf16CodeUnits"` explicitly, and needs a fallback location for findings with no `locations` if GitHub requires one.
  - T-034: fleet JSON wraps each report as `{ repo, report }`.
  - T-040: if the Action calls `validateReport`, its bundle ships `schema/` beside it.
  - T-033: a timing report, if it returns, sits behind an opt-in flag and stays out of the default JSON.
- **Confirmed by Sreeram (2026-11-22):** columns in UTF-16 code units, https-only sources, and lowercase rule ids (`node26/slowbuffer`, `native/node-rs-bcrypt`).

## ADR-010 · Claude runs the PR loop; Sreeram approves merges (2026-11-22)

- **Context:** after T-001, `main` is protected by a ruleset (PR required, `verify` and `quality` checks required, no force pushes). Having Sreeram push every task branch and open every PR by hand slows each task without adding safety, because nothing reaches `main` without a green PR and his merge.
- **Decision:** at the end of every task Claude runs `pnpm check:all`, pushes the task branch, opens the PR (`gh pr create --fill`), requests CodeRabbit, watches the checks, and fixes CI failures and real review findings. Merging still needs Sreeram's explicit yes every time. (Amended 2026-11-22, see CLAUDE.md "Merging": he may approve a specific PR in advance, and a PR that changes only Markdown docs or code comments merges without asking.) Pushing to `main`, force-pushing, deleting branches and publishing still need it too. The merge question names both actions (merge, then delete the task branch), so one yes covers both. `.claude/settings.json` pre-approves exactly one push command, `git push -u origin HEAD`, with no wildcard. It's used for the first push and every fix push, so it works whatever the local `push.default` is. Every other push form (deleting, mirroring, pruning, clustered flags such as `-qd`) falls back to Claude Code's default prompt. A blocklist on top of `git push *` can always be dodged by spelling flags differently, so it isn't used. Force-push patterns stay on "deny" as a backstop, and the ruleset on `main` is the real guard. The `gh pr`/`gh run` read and comment commands are allowed; `gh pr merge` is on "ask".
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
- **Decision:** runtime dependencies allowed without a new decision: `oxc-parser`, `yaml`, `semver`, `ignore` (for `.gitignore` matching; amended by ADR-015: not used for scanned input). Anything else needs its own entry: why, maintenance status, install scripts, transitive count.
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
