# Neukee

Find what blocks your Node.js and Next.js upgrades before your users do.

> Working name, pending trademark check. Pre-release: the scanner is under construction (launch target December 8, 2026).

## For contributors

```bash
corepack enable          # or: npm i -g pnpm
pnpm install
pnpm verify              # typecheck + lint + tests
pnpm check:all           # verify + unused-code check + package checks
pnpm build
node packages/cli/dist/index.js --help
```

Start with `docs/WORKFLOW.md`, then `docs/ARCHITECTURE.md`. Work is planned in `docs/TASKS.md`.

## Guarantees

- No network access, ever. No telemetry.
- Read-only: never runs your code, scripts or package manager.
- Reports contain repo-relative paths only.

## License

Apache-2.0 for the scanner, core, CLI and GitHub Action. See `LICENSE` and `NOTICE`.
