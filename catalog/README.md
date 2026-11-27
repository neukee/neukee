# Catalog

What breaks in each release, with the official source for every claim. One YAML file per entry, at `catalog/<id>.yaml`: the file path is the entry's id (for example `catalog/next16/sync-request-apis.yaml` for `next16/sync-request-apis`).

`loadCatalog` in `packages/core` (T-003) reads and checks every entry. The format and rules are in `docs/ARCHITECTURE.md` §6, and the decisions behind them in ADR-003 and ADR-014.

**Never add an entry from memory.** Read the official source, paste its exact URL, and add positive and negative fixtures under `fixtures/rules/<rule>/`. Every `*.yaml` file here is treated as an entry, so put other data elsewhere.

**Wording for runtime entries (Sreeram, 2026-11-26; revised 2026-11-27, ADR-023).** A pin (`.nvmrc`, `.node-version`, `volta.node` and, later, Dockerfile and CI versions) selects a runtime. `engines.node` is a range: npm documents it as advisory unless `engine-strict` is set, but some hosting platforms use it to choose the Node.js version for builds and deployments. Vercel and Heroku say so in their docs, and so does DigitalOcean App Platform for buildpack deployments (a Dockerfile in the root folder takes precedence there); other platforms may too. An entry may say a platform selects the runtime from `engines.node` only for a platform whose docs it names, and it shows those docs' URLs in the message, because `sourceUrl` is one URL on the official-host list. For anything else it says only what npm's docs say. Cite the docs of every platform or tool an entry names.
