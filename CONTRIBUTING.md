# Contributing to Neukee

Thanks for helping. Neukee is pre-release, so the most valuable contributions right now are reports from real upgrades: a breaking change we don't cover, or a finding that's wrong.

## Ways to help

- **Report a missing breaking change.** Use the [missing breaking change form](https://github.com/neukee/neukee/issues/new?template=missing-breaking-change.yml). Include the official release note or migration guide; rules are only accepted with a primary source.
- **Report a false positive or a false negative.** Use the [false positive form](https://github.com/neukee/neukee/issues/new?template=false-positive.yml) with the smallest snippet that reproduces it. Never paste proprietary code.
- **Fix a bug or add a rule.** Open an issue first so we can agree on the approach before you write code.

Security issues go through [`SECURITY.md`](SECURITY.md), never a public issue.

## Development setup

You need Node.js 22 or later and Corepack.

```bash
corepack enable
pnpm install
pnpm verify       # typecheck, lint and tests
pnpm check:all    # verify, plus unused-code and package checks
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing code. It explains the pipeline, the core types and the security model.

## Rules every change follows

These are checked in CI or in review, and a pull request that breaks one won't be merged.

1. **No network access.** No `fetch`, sockets or DNS anywhere in the scanner. Tests run with all three blocked.
2. **Never run the scanned project.** No executing its code, scripts or package manager.
3. **Repo-relative paths only** in reports, and no file contents beyond the one line needed to locate a finding.
4. **Deterministic output.** The same input always produces byte-identical output.
5. **Detectors never throw.** Failures become diagnostics in the report.
6. **Dependencies flow one way:** cli → scanner → core.
7. **No new runtime dependency** without a decision record in [`docs/DECISIONS.md`](docs/DECISIONS.md).
8. **Tests come with the change.** Don't weaken, skip or delete existing tests to make a change pass.

## Adding a catalog rule

Each rule is one YAML file in [`catalog/`](catalog), and its file path is its id (for example `catalog/next16/sync-request-apis.yaml`). A rule needs:

- the exact URL of the official release note or migration guide (`https` only); never write a rule from memory
- a positive fixture where the rule must fire and a negative fixture where it must not, under `fixtures/rules/<rule>/`
- a severity: `action-required` only when the change breaks the build or the running app, `warning` for deprecations, `info` for behavior changes worth knowing

In the pull request, quote the sentence from the source that justifies the rule.

See [`catalog/README.md`](catalog/README.md) for the format.

## Pull requests

- Keep each pull request to one concern, and explain the why in the description.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for titles, for example `fix(scanner): handle digest-pinned node images`.
- CI must pass on Ubuntu and Windows with Node.js 22 and 24.
- Every pull request is reviewed by CodeRabbit and needs the maintainer's approval. Expect review comments. They're about the code, never about you.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), as section 5 of the license describes.

## Conduct

Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md).
