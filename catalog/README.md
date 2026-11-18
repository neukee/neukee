# Catalog

What breaks in each release, with the official source for every claim. One YAML file per entry, at `catalog/<tool>/<id-after-slash>.yaml` (e.g. `catalog/next/sync-request-apis.yaml` for `next16/sync-request-apis`).

Format and rules: `docs/ARCHITECTURE.md` §6. The loader and validator arrive in task T-003; the first entry is written then, from the Next.js 16 upgrade guide.

**Never add an entry from memory.** Read the official source, paste its exact URL, and add positive and negative fixtures under `fixtures/rules/<rule>/`.
