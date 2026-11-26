# `engines.node` selects the runtime on hosting platforms

Found 2026-11-27 by Claude (chat) while building the validation answer key. **It contradicts the catalog wording rule added on 2026-11-26** ("`engines.node` may only be described as allowing or excluding versions"). That rule followed npm's documentation, which is right about npm but incomplete: several hosting platforms read `engines.node` to choose which Node.js runs the build and the deployed app.

## Official sources

- **Vercel**, Supported Node.js versions, https://vercel.com/docs/functions/runtimes/node-js/node-js-versions : the major version in `engines.node` overrides the version selected in Project Settings. Its example: with Project Settings at 24.x and `engines.node` set to a valid range for 26 (e.g. `26.x`), Vercel deploys with the latest 26.x. Vercel's Node 20 deprecation notice (https://vercel.com/changelog/node-js-20-is-being-deprecated) tells users to upgrade by setting `engines`.
- **Heroku**, Node.js Support, https://devcenter.heroku.com/articles/nodejs-support : "To specify the version of Node.js to use on Heroku, use the engines section of package.json." Without it, Heroku uses its default (24.x at the time of reading). Heroku's changelog (https://devcenter.heroku.com/changelog-items/3512) says a wide range such as `>=22` would resolve to the newest release, and now limits wide ranges to Active LTS.
- **DigitalOcean App Platform**, https://docs.digitalocean.com/products/app-platform/languages-frameworks/nodejs/ : the Node.js version is set in the `engines` section; 22.x is the default when it isn't.
- **npm**, package.json docs: `engines` is advisory unless `engine-strict` is set. Still true, for npm.

## What should change (for Sreeram to decide; Claude Code to implement)

1. **Catalog wording rule (catalog/README.md):** replace "may only be described as allowing or excluding versions" with: npm treats `engines.node` as advisory, but hosting platforms including Vercel, Heroku and DigitalOcean App Platform use it to choose the Node.js version for builds and deployments. Describe it as selecting the runtime *on those platforms*, citing their docs.
2. **`below-target.yaml` and `sources-disagree.yaml` messages:** the old text ("environments that read it keep running the old runtime") was closer to the truth for deployments than the 2026-11-26 rewrite. Mention the platforms.
3. **Wide ranges:** on Vercel a range like `>=20` deploys the newest matching major, so production can jump majors without a commit. Candidate rule (post-launch): `engines.node` with no upper bound in a project deployed to such a platform.
4. **A Vercel or Heroku project with no `engines.node`** runs the platform default, whatever `.nvmrc` says (answer key #14). Candidate rule: `.nvmrc` present, `engines.node` absent, platform detected.
