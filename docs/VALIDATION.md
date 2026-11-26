# Validation on real repositories

Used from task T-050. Every finding the scanner reports on a real public repo is checked by hand. Precision = confirmed ÷ (confirmed + false positives).

## Thin-path scans (2026-11-26, internal)

The first runs of the built CLI (`neukee scan`, T-033 at `7e2f341`) on shallow clones of public repositories, default target `node@26`. Internal until launch (Sreeram, 2026-11-23): nothing here is posted or sent anywhere. Verdicts are Claude's reading of each finding against the repository's own files; Sreeram settles the "unsure" ones. These are not the T-050 validation set.

| Repo | Commit | Findings | Verdict | Note |
| ---- | ------ | -------- | ------- | ---- |
| shadcn-ui/ui | `0e5b2e6` | `runtime/below-target` and `runtime/end-of-life` at `.nvmrc:1:1` (pins 20.5.1) | confirmed | Node 20 reached end-of-life on 2026-04-30 (official schedule). |
| shadcn-ui/ui | `0e5b2e6` | 4 × `runtime/sources-disagree`: root `.nvmrc` 20.5.1 against `templates/*/package.json` `engines.node` `>=22.23.4` | unsure | The templates are scaffolds that get copied out, so the root `.nvmrc` may not govern them in practice. The rule is per package and nvm does walk up, so the finding follows the spec. Candidate for the noise note below. |
| vercel/next.js | `cf73f8ca` | `runtime/below-target` and `runtime/end-of-life` at `.node-version:1:1` (pins 20) | confirmed | Same end-of-life date. |
| vercel/next.js | `cf73f8ca` | `runtime/sources-disagree`: root `.node-version` 20 against `examples/eve/package.json` `engines.node` `>=24` | unsure | An example project with its own engines. |
| strapi/strapi | `1f04620` | `runtime/below-target` at `.nvmrc:1:1` (pins 22, warning: the 22 line has under 12 months of support left) | confirmed | The finding is true; its `engines.node` already allows up to 26, so a maintainer may see it as low priority. |
| payloadcms/payload | `432a254` | 2 × `runtime/below-target`, info, at `.node-version:1:1` and `.nvmrc:1:1` (pin 24.22.3) | confirmed | Info, because Node 24 has support until 2028-04-30. |
| facebook/docusaurus, mochajs/mocha, prettier/prettier, expressjs/express | `3430978`, `04eb516`, `da84d53`, `43fca52` | none | not checked | Their pins are 26 or their ranges allow 26. Not examined for false negatives. |

Noise notes for T-050:

- `sources-disagree` between a root pin and a `templates/` or `examples/` package is the likely source of false positives (SPEC §2.1 has no special case for them, on purpose).
- The `Detected Node.js` line lists every distinct `engines.node` range, up to 9 values for shadcn/ui; long and not very useful in a monorepo.
- Every `below-target` finding carries the catalog's whole explanation (about 400 characters), so a repository with many findings prints a lot of text.

## Choosing the 10 repos

- Public Next.js and/or Node.js applications (not libraries), actively maintained.
- A mix of sizes (small, medium, at least one over 100,000 lines).
- A mix of package managers (npm, pnpm, yarn v1, yarn Berry).
- A mix of versions (some on Next 14/15, some on Node 18/20/22).
- At least two with Dockerfiles and two with deployment config.

| #   | Repo | Size (lines) | Package manager | Next / Node | Scanned on | Commit |
| --- | ---- | ------------ | --------------- | ----------- | ---------- | ------ |

## Findings

| Repo | Rule | Location | Verdict (confirmed / false-positive / unsure) | Note |
| ---- | ---- | -------- | --------------------------------------------- | ---- |

## Results

| Measured on | Findings | Confirmed | False positives | Unsure | Precision |
| ----------- | -------- | --------- | --------------- | ------ | --------- |
