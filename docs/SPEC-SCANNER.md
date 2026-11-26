# Scanner (v0a) specification

**Launch target:** Tuesday, December 8, 2026 (ADR-013). **Status:** see `docs/PROGRESS.md`.

The scanner answers one question for a repository: _what stands between this code and the target versions, and how do I fix it?_ It is free and open source. It is also the engine of the paid upgrade audits and the lead generator for the company, so its findings must be accurate first and complete second.

## 1. Command-line interface

```
neukee scan [path] [--target <tool@version>]... [--format <terminal|markdown|json|sarif>] [--output <file>] [--fail-on <action-required|warning|never>]
neukee fleet <dir-or-list-file> --target <tool@version>... [--format markdown|json] [--output <file>]
neukee --version
neukee --help
```

| Option      | Default                                                             | Behavior                                                                                                                              |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `path`      | `.`                                                                 | Repository root to scan                                                                                                               |
| `--target`  | `node@26` and the latest supported major of each detected framework | Repeatable. Supported in v0a: `node@24`, `node@26`, `next@15`, `next@16`                                                              |
| `--format`  | `terminal`                                                          | `terminal` (colored, human), `markdown` (for PRs and audit reports), `json` (the `ScanReport` schema), `sarif` (GitHub code scanning) |
| `--output`  | stdout                                                              | Write the report to a file instead                                                                                                    |
| `--fail-on` | `action-required`                                                   | Exit code 1 when a finding at or above this severity exists; `never` always exits 0                                                   |

**Default target and coverage (Sreeram, ADR-021).** Without `--target`, Node.js is checked against `node@26`. Every report then says plainly that v0.1.0 checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26, and that those rules come after launch. Under the default target, `runtime/below-target` is `info` while the declared line has at least 12 months of support left from `scannedAt`, and `warning` when it has less; an explicit `--target` is never softened.

**Targets and the catalog (T-033).** Targets you name replace the defaults, one per tool: `--target node@24 --target node@26` is a usage error (a report checks one Node.js target), and `--target next@16` alone checks Next.js 16 and runs no Node.js check. `--format json` and `sarif` exit 2 until T-032 adds them. The catalog is read from the package's own `catalog/` folder (the repository's, in a checkout); a missing, broken or empty catalog exits 3, because a scan without it would report nothing and look clean. `--output` refuses a symbolic link at the path or, when the path is inside the scanned folder, on the way to it, since a scanned repository could plant one.

**Exit codes:** `0` no blocking findings · `1` blocking findings · `2` usage error (bad arguments) · `3` internal error (a bug; prints a short message asking for a report).

`fleet` scans every repository directory under a folder (or listed in a file) and produces one combined report with a per-repo summary table. It exists for the paid audits.

## 2. Detectors (what is read, what is produced)

### 2.1 Runtime sources — `runtime/*`

Every place that pins the Node.js version the app runs on, plus `engines.node`, a supported range that doesn't select a runtime (npm treats it as advisory unless `engine-strict` is set):

| Source                                      | What to read                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.nvmrc`, `.node-version`                   | The version string (handle `v22`, `22`, `22.11.0`, `lts/*` → reported as "unpinned LTS") |
| `package.json`                              | `engines.node`, `volta.node`                                                             |
| `Dockerfile*`                               | `FROM node:<tag>` lines, including multi-stage builds and `--platform` flags             |
| `.github/workflows/*.yml`                   | `actions/setup-node` `node-version` and `node-version-file`, including matrix values     |
| `vercel.json`, `netlify.toml`               | Node version settings (`NODE_VERSION` in Netlify)                                        |
| `serverless.yml`, `template.yaml` (AWS SAM) | `runtime: nodejsXX.x`                                                                    |

**Produces:** a list of declared versions with their source location. The report's `detected.node` lists the distinct declared values as the readers normalize them (`v22` becomes `22`, `lts/iron` stays, a range is trimmed), sorted; an empty `engines.node` declares nothing. **Findings:** (a) a declared version below the target, (b) sources that disagree with each other (e.g. `.nvmrc` says 24, Dockerfile says 20) — the most common reason a "successful" upgrade still runs the old runtime in production, (c) a declared version past end-of-life. Runtime findings need a `node` target; end-of-life is dated by the scan's date and the official release schedule.

**Which declarations disagree (Sreeram, 2026-11-25, ADR-020).** Disagreement is scoped per package, never across packages:

- A package is any folder with a `package.json`, the root included.
- Pins are `.nvmrc`, `.node-version` and `volta.node`; `engines.node` is a range.
- The `.nvmrc` or `.node-version` that applies to a package is its own, else the nearest one in a parent folder, the way nvm resolves `.nvmrc` ("nvm use et. al. will traverse directory structure upwards from the current directory looking for the `.nvmrc` file", nvm's README). `volta.node` applies to its own package only: Volta shares a root pin only through `"extends"`, which isn't followed yet.
- A package disagrees when two applicable pins name different majors, or an applicable pin is outside the package's own `engines.node`. Majors only: `20` satisfies `>=20.9`. `lts/<codename>` counts as its line's major; `lts/*` and other unpinned aliases never disagree.
- Each declaration covers folders: `.nvmrc` and `.node-version` their folder and below, `engines.node` and `volta.node` their own package. Later sources plug in the same way: a Dockerfile covers its own folder, a GitHub Actions workflow the whole repository unless `node-version-file` points elsewhere.
- No special cases for `examples/` or `fixtures/`. Validation (T-050) shows whether they're noisy, and any noise goes in `docs/VALIDATION.md`.

### 2.2 Lockfiles — `lockfile/*`

| Lockfile                  | Notes                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `package-lock.json` v2/v3 | `packages` map; `hasInstallScript` marks packages with install scripts                |
| `pnpm-lock.yaml` (v6–v9)  | Parse with `yaml`; package keys differ between lockfile versions                      |
| `yarn.lock` v1            | Post-launch (T-017). At launch: a diagnostic, and versions from `package.json` ranges |
| `yarn.lock` Berry (v2+)   | Post-launch (T-018). At launch: same diagnostic and fallback as v1                    |

**Produces:** resolved versions of every package (direct and transitive) and which are direct dependencies. **Feeds:** framework versions (`next`, `react`, `react-dom`, `prisma`, `@prisma/client`, `express`) and the native-addon detector. A missing lockfile is a diagnostic, not a failure; fall back to `package.json` ranges and say so in the report.

### 2.3 Native addons — `native/*`

Packages with compiled code break across Node majors when they lack builds for the new version. **At launch (ADR-013, T-020)** the only signal is the lockfile's install-script flag (`hasInstallScript` in npm, and pnpm's equivalent if its format records one), with no version table and no network lookups. **Finding:** this dependency runs an install script, usually a native build, so check it before the Node major upgrade. A per-package table of first compatible versions (each row with a source link, kept outside `catalog/`, where every file is an entry) is a possible later addition, not part of v0a.

### 2.4 Source code rules — `ast/*`

Files: `.js .jsx .mjs .cjs .ts .tsx .mts .cts`, parsed with `oxc-parser`. A file that fails to parse is a diagnostic; the scan continues.

Initial rules (each becomes a catalog entry with fixtures; verify every detail against the source before implementing):

| Rule id                                  | Target   | Detects                                                                                                                                                          | Official source                               |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `next16/sync-request-apis`               | next@16  | `cookies()`, `headers()`, `draftMode()` called without `await` (or `use()`); `params`/`searchParams` props read synchronously                                    | Next.js 16 upgrade guide                      |
| `next16/middleware-to-proxy`             | next@16  | A `middleware.ts/js` file at the root or in `src/` (renamed to `proxy`)                                                                                          | Next.js 16 upgrade guide                      |
| `next16/webpack-config`                  | next@16  | A custom `webpack` function in `next.config.*` (Turbopack is the default builder)                                                                                | Next.js 16 upgrade guide                      |
| `next16/removed-config`                  | next@16  | `experimental.ppr`, AMP config, `serverRuntimeConfig` / `publicRuntimeConfig`                                                                                    | Next.js 16 upgrade guide                      |
| `next16/next-lint-script`                | next@16  | `next lint` in `package.json` scripts                                                                                                                            | Next.js 16 upgrade guide                      |
| `next16/parallel-route-default`          | next@16  | A parallel route slot (`@name` folder) without `default.js/tsx`                                                                                                  | Next.js 16 upgrade guide                      |
| `next16/segment-config-cache-components` | next@16  | `export const dynamic/revalidate/fetchCache` in a project with `cacheComponents: true`                                                                           | Next.js "Migrating to Cache Components" guide |
| `next15/fetch-cache-default`             | next@15  | `fetch` calls in server code relying on default caching (info severity: behavior change)                                                                         | Next.js 15 upgrade guide                      |
| `node24/url-parse`                       | node@24  | `url.parse()` usage (deprecated)                                                                                                                                 | Node.js 22 → 24 migration guide               |
| `node24/child-process-shell-args`        | node@24  | `execFile`/`spawn` with `shell: true` and an args array (deprecated)                                                                                             | Node.js 22 → 24 migration guide               |
| `node24/openssl-security-level`          | node@24  | Info: OpenSSL 3.5 security level 2 rejects RSA/DSA/DH keys under 2048 bits and RC4 suites; flags TLS configuration code for review (cannot be proven statically) | Node.js 22 → 24 migration guide               |
| `node-any/md4-hash`                      | node@any | `createHash('md4')` (OpenSSL 3 legacy provider)                                                                                                                  | Node.js 17 release notes / OpenSSL 3 docs     |
| `node26/*`                               | node@26  | Removed APIs — **research task T-024 builds this list from the official Node 26 release notes before any rule is written**                                       | Node.js 26 release notes                      |

### 2.5 Matching and severity

A finding is produced only if the rule's `applies` range is crossed by the upgrade: the detected current version is below `introducedIn` and the target is at or above it. If the current version cannot be detected, the rule still runs and the finding says "current version unknown." A rule not tied to a release, such as `runtime/*`, has no `introducedIn` and no version gate (ADR-020).

## 3. Output formats

- **terminal:** grouped by severity, each finding with file:line, a one-line fix, and the source link. Ends with a summary line and the exit-code reason.
- **markdown:** the same structure as tables; this is the audit report and the PR comment body.
- **json:** exactly `ScanReport` from `packages/core`; validated against the exported JSON Schema in tests.
- **sarif:** SARIF 2.1.0; one rule per catalog entry, `helpUri` = `sourceUrl`; uploadable with `github/codeql-action/upload-sarif`.

## 4. GitHub Action (T-040, post-launch)

**At launch (ADR-013)** the README ships a copy-paste workflow instead: it installs and runs the CLI, writes SARIF, and uploads it to GitHub code scanning with the official upload action. The packaged Action below follows in the first two weeks after launch.

```yaml
- uses: <org>/neukee@v0
  with:
    targets: node@24 next@16
    fail-on: action-required
    sarif: true # optional: upload to code scanning
```

Bundled with esbuild into one file; runs the same scan as the CLI; writes a job summary (markdown format); never needs network access or tokens beyond the defaults; documented permissions: `contents: read` (+ `security-events: write` only when `sarif: true`).

## 5. Launch targets (measured, not guessed)

Targets are checked by `/checkpoint` and recorded in `docs/PROGRESS.md`. A target that cannot be met is a decision to make openly (in `docs/DECISIONS.md`), not a silent miss.

| #   | Target                                                                                       | How it is measured                                                             |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **Precision ≥ 90%** of findings confirmed real across the validation set                     | Manual verification of every finding on 10 public repos (`docs/VALIDATION.md`) |
| 2   | **Zero crashes** on the validation set                                                       | Every repo completes; parse failures appear as diagnostics                     |
| 3   | **Every catalog entry** has a source link and passing positive + negative fixtures           | Catalog test suite                                                             |
| 4   | **Under 60 s and under 1 GB memory** on a 100,000-line repo on a standard GitHub runner      | Benchmark fixture + CI timing                                                  |
| 5   | **Zero network calls** during a scan                                                         | Network-blocking test setup; CI job without network for the e2e test           |
| 6   | **Deterministic output:** the same repo twice gives byte-identical JSON (except `scannedAt`) | Snapshot test runs the scan twice                                              |
| 7   | **Coverage ≥ 85% lines** on `core` and `scanner`                                             | Vitest coverage report in CI                                                   |
| 8   | **Runs on Linux and Windows,** Node 22 and 24                                                | CI matrix                                                                      |
| 9   | **Install footprint:** fewer than 40 transitive runtime dependencies                         | `pnpm list --prod --depth Infinity` count, checked in CI                       |
| 10  | **Docs:** README with a 60-second quickstart, every rule documented                          | Manual check at T-054                                                          |

Targets 1, 4 and 9 are first estimates. If measurement shows they are wrong, change them in a decision record; never quietly.

## 6. Out of scope for v0a

Running the project's code or tests (that is the engine), auto-fixing code (codemods exist; we link to them), a dashboard, accounts, telemetry, GitLab, frameworks other than Next.js, languages other than JS/TS.
