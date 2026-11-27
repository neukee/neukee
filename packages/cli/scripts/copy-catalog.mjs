// Copies the repository's catalog entries into this package, so an install of @neukee/cli can scan
// (T-033b). Runs as part of `pnpm build`; the copy is git-ignored and listed in `files`. The
// catalog's README isn't an entry and stays behind.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../../catalog/", import.meta.url));
const to = fileURLToPath(new URL("../catalog/", import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (path) => !path.endsWith(".md") });
