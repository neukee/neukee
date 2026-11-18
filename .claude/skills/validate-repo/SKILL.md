---

name: validate-repo
description: Run the scanner on a real public repository clone and record every finding for manual verification (task T-050 onward).
disable-model-invocation: true
argument-hint: [path-to-local-clone]
allowed-tools: Bash(pnpm *) Bash(git -C *)
---

Validate the scanner on the local clone at `$ARGUMENTS`.

1. Confirm the path is a local clone of a public repository (never a customer's private code) and record its remote URL and commit (`git -C $ARGUMENTS remote get-url origin`, `git -C $ARGUMENTS rev-parse HEAD`).
2. Build the CLI (`pnpm build`) and run `node packages/cli/dist/index.js scan $ARGUMENTS --format json --output /tmp/valore-validate.json`, plus the markdown format for reading.
3. Add the repo to the table in `docs/VALIDATION.md` (size, package manager, versions, commit).
4. For every finding: open the cited file and line, check it against the catalog entry and its official source, and add a row to the Findings table with a proposed verdict (`confirmed`, `false-positive` or `unsure`) and a one-line reason. Mark every verdict as **proposed**: a person confirms them.
5. Record crashes, diagnostics and the scan's duration.
6. For each false positive, add a `todo` task under T-051 in `docs/TASKS.md` with a fixture that reproduces it.
7. Report the counts and the proposed precision for this repo.
