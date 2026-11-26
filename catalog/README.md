# Catalog

What breaks in each release, with the official source for every claim. One YAML file per entry, at `catalog/<id>.yaml`: the file path is the entry's id (for example `catalog/next16/sync-request-apis.yaml` for `next16/sync-request-apis`).

`loadCatalog` in `packages/core` (T-003) reads and checks every entry. The format and rules are in `docs/ARCHITECTURE.md` §6, and the decisions behind them in ADR-003 and ADR-014.

**Never add an entry from memory.** Read the official source, paste its exact URL, and add positive and negative fixtures under `fixtures/rules/<rule>/`. Every `*.yaml` file here is treated as an entry, so put other data elsewhere.

**Wording for runtime entries (Sreeram, 2026-11-26).** Only a pin (`.nvmrc`, `.node-version`, `volta.node` and, later, Dockerfile and CI versions) may be described as selecting or keeping a runtime. `engines.node` may only be described as allowing or excluding versions: npm documents it as advisory unless `engine-strict` is set. Cite npm's package.json docs where an entry talks about `engines`.
