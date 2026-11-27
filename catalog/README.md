# Catalog

What breaks in each release, with the official source for every claim. One YAML file per entry, at `catalog/<id>.yaml`: the file path is the entry's id (for example `catalog/next16/sync-request-apis.yaml` for `next16/sync-request-apis`).

`loadCatalog` in `packages/core` (T-003) reads and checks every entry. The format and rules are in `docs/ARCHITECTURE.md` §6, and the decisions behind them in ADR-003 and ADR-014.

**Never add an entry from memory.** Read the official source, paste its exact URL, and add positive and negative fixtures under `fixtures/rules/<rule>/`. Every `*.yaml` file here is treated as an entry, so put other data elsewhere.

**Wording for runtime entries (Sreeram, 2026-11-26; revised 2026-11-27, ADR-023).** A pin (`.nvmrc`, `.node-version`, `volta.node` and, later, Dockerfile and CI versions) selects a runtime. `engines.node` is a range: npm documents it as advisory unless `engine-strict` is set, but Vercel, Heroku and DigitalOcean App Platform use it to choose the Node.js version for builds and deployments. An entry may say it selects the runtime on those platforms, naming them and citing their docs; elsewhere it only allows or excludes versions. Cite the docs of every platform or tool an entry names.
