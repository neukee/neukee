---

name: verify
description: Run the full quality gate (typecheck, lint, tests) and explain any failure in plain language.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(git status) Bash(git diff *)
---

Run `pnpm verify`.

- If it passes, say so in one line and include the test count.
- If it fails, group the failures by cause (type error, lint, failing test), name the files, explain each cause in one sentence, and propose the fix. Do not change any code unless the person asks.
