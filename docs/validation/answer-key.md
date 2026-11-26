# Validation answer key (T-050 prep)

Public repositories that merged a Next.js 16 or Node.js 24 upgrade, and what each one had to change. Use them as an answer key: run the scanner on each repository's commit **before** the upgrade PR and check whether it reports what the PR fixed.

Status: collected 2026-11-27 by Claude (chat) from search results showing each PR's description. **Every row is "what the PR says", not yet verified against the diff.** Before a row becomes a test expectation, open the PR, read the diff, record the base commit SHA, and confirm the claim. Repos can be renamed, deleted or force-pushed; pin SHAs.

## Next.js 15 → 16

| # | PR | What the PR says had to change | Scanner rule it should exercise |
|---|---|---|---|
| 1 | [komma-systems/website#25](https://github.com/komma-systems/website/pull/25) | `middleware.ts` renamed to `proxy.ts` with a `proxy` export; `next lint` and the `eslint` option in `next.config` removed; OpenNext Cloudflare adapter bumped for 16.4 support; Next 15.5.7 had left the support window, which broke the Cloudflare build | middleware→proxy, next lint removal, eslint config option, adapter compatibility |
| 2 | [levisager11-oss/opendepartment#14](https://github.com/levisager11-oss/opendepartment/pull/14) | `src/middleware.ts` → `src/proxy.ts`; `eslint` option removed from `next.config.ts`; `tsconfig.json` needs `jsx: react-jsx` and `.next/dev/types/**/*.ts`; `tsc` fails on a fresh checkout unless `next typegen` runs first | middleware→proxy, eslint option, tsconfig changes, typegen before typecheck |
| 3 | [Toastbyte-Studios/git-all#197](https://github.com/Toastbyte-Studios/git-all/pull/197) | `next lint` removed; `eslint-config-next` 16 ships only flat configs; tsconfig `jsx` and `.next/dev/types`; Turbopack becomes the default build | next lint removal, flat config, tsconfig, Turbopack default |
| 4 | [alton-michaux/work-smarter#249](https://github.com/alton-michaux/work-smarter/pull/249) | Dependabot's Next 16 PR (#222) failed on Vercel: Next 16 builds with Turbopack by default and refuses to build when `next.config.js` has a custom `webpack` function but no `turbopack` config. Next 16 needs Node ≥ 20.9 | custom webpack config without turbopack config (a build failure a version-bump PR doesn't fix) |
| 5 | [exp3/StoryCanon#58](https://github.com/exp3/StoryCanon/pull/58) | Kept `next build --webpack` because a `webpack` hook in `next.config.ts` is required; `next lint` removed; OpenNext needs next ≥ 16.4.1 | custom webpack config, next lint removal |
| 6 | [MSBivens/dsp#8](https://github.com/MSBivens/dsp/pull/8) | Next 16 + Node 24 together: `engines.node` pinned to 24.x because Vercel discontinued Node 20; `params` is a Promise in a dynamic route and `generateMetadata`; ESLint 8 → 9 flat config; `sharp` to 0.35 | async params, next lint, Node runtime on Vercel via engines, native addon (`sharp`) |
| 7 | [bryan-delacruz/portfolio#2](https://github.com/bryan-delacruz/portfolio/pull/2) | `middleware.ts` → `proxy.ts`; ESLint flat config; motivated by a PostCSS advisory only fixed in Next 16 | middleware→proxy, flat config |
| 8 | [zaidg7/tidaq#150](https://github.com/zaidg7/tidaq/pull/150) | Next 15 left its support window on 2026-10-21 and OpenNext stopped building it; `@opennextjs/cloudflare` bumped | end-of-support framework version, adapter compatibility |
| 9 | [ncuyyGans/By-Sy#16](https://github.com/ncuyyGans/By-Sy/pull/16) | Used the official `@next/codemod` upgrade, "ahead of the 21 Oct 2026 EOL" | negative control: what the codemod already handles |
| 10 | [durastudents/durastudents#31](https://github.com/durastudents/durastudents/pull/31) | 15.5 → 16.4.2 to clear a PostCSS advisory bundled in Next 15 | baseline small app |

## Node.js 22 / 20 → 24

| # | PR | What the PR says had to change | Scanner rule it should exercise |
|---|---|---|---|
| 11 | [muxinc/guestbook#69](https://github.com/muxinc/guestbook/pull/69) | `.nvmrc` already said 24 but `engines.node` said 22.x and CI said 22. The Vercel dashboard setting was 16.x, and `engines.node` overrides it | `runtime/sources-disagree` (.nvmrc vs engines vs CI), Vercel selects via engines |
| 12 | [BryanOwens012/which-glp#217](https://github.com/BryanOwens012/which-glp/pull/217) | `.nvmrc` said 24 while three `package.json` files said `engines.node >=22`; `@types/node` was ahead of the runtime (^25) | sources-disagree per package (monorepo), types ahead of runtime |
| 13 | [Rockhopper-Co/mcp-server#373](https://github.com/Rockhopper-Co/mcp-server/pull/373) | `.nvmrc` 20 → 24; `coverage.yml` was the only workflow hardcoding `node-version: "20"`; dev dependencies needing Node ≥ 22 logged EBADENGINE | CI source (T-012), below-target |
| 14 | [matthewcsimpson/MatthewCSimpson.dev#33](https://github.com/matthewcsimpson/MatthewCSimpson.dev/pull/33) | `engines.node` was unset, so Heroku used its default while CI ran Node 20 (end of life April 2026) | missing declaration + platform default, CI source, end-of-life |
| 15 | [sluginashell/CloudPaw#20](https://github.com/sluginashell/CloudPaw/pull/20) | `better-sqlite3` 11 → 13 for Node 24 (native addon); `prebuild-install` and 33 install-time packages dropped; `.nvmrc` 24 and `engines` 24.x added | native addon detector (T-020): `hasInstallScript` packages |
| 16 | [openlint/openlint#7](https://github.com/openlint/openlint/pull/7) | `.nvmrc`, Dockerfile and release workflows to 24; `.nvmrc` pinned to 24.20.0 because a native binary fetcher had no 24.21.0 base yet; CI and Dockerfile now read `.nvmrc` | Dockerfile source (T-011), CI source, native binaries |
| 17 | [BryanOwens012/template-claude-nextjs-node#86](https://github.com/BryanOwens012/template-claude-nextjs-node/pull/86) | Added `engines` to root and `apps/web` and a root `.nvmrc` so every pin agrees; notes Vercel and Railpack read `engines.node` to select the build's Node version; `@types/node` two majors ahead of the runtime | monorepo sources, Dockerfile already `node:24-alpine` (negative) |

## Patterns worth a rule (from this sample)

- **Disagreeing version sources were the most common Node problem** (11, 12, 13, 14, 16, 17), which supports `runtime/sources-disagree` as a launch rule.
- **Hosting platforms select Node.js from `engines.node`** (11, 14, 17). See `docs/research/engines-node-selects-runtime.md`: this contradicts the catalog wording rule added on 2026-11-26.
- **`@types/node` ahead of the runtime** (12, 17): code can typecheck against APIs production doesn't have. Candidate post-launch rule.
- **Custom `webpack` config without `turbopack` config** (4, 5) breaks the default Next 16 build. Candidate high-value Next rule: a Dependabot-style version bump fails on it.
- **Adapter version floors** (1, 5, 8): OpenNext for Cloudflare needs next ≥ 16.4.1. Candidate post-launch rule if the adapter documents it officially.
