// Copies the repository's catalog entries into this package, so an install of @neukee/cli can scan
// (T-033b). Runs as part of `pnpm build`; the copy is git-ignored and listed in `files`. Only
// regular `.yaml` files and the folders holding them go (the loader's definition of an entry; it
// follows no symbolic link either); the README stays behind. The two paths can be given as
// arguments (the tests do); they default to the catalog and this package's `catalog` folder.
import { cpSync, lstatSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [fromArg, toArg] = process.argv.slice(2);
const from = fromArg ?? fileURLToPath(new URL("../../../catalog/", import.meta.url));
const to = toArg ?? fileURLToPath(new URL("../catalog/", import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, {
  recursive: true,
  filter: (path) => {
    const entry = lstatSync(path);
    return entry.isDirectory() || (entry.isFile() && path.endsWith(".yaml"));
  },
});
