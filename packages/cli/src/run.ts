import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const HELP = `valore — find what blocks your Node.js and Next.js upgrades

Usage:
  valore scan [path] [--target tool@version]... [--format terminal|markdown|json|sarif]
  valore --version
  valore --help

The scan command is under construction (see docs/TASKS.md, T-033).`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

/** Pure entry point: takes arguments, returns output. The bin file only prints it. */
export function run(argv: string[]): RunResult {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: { version: { type: "boolean", short: "v" }, help: { type: "boolean", short: "h" } },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: "", stderr: `${reason}\n\n${HELP}\n` };
  }

  if (parsed.values.version) return { code: 0, stdout: `${version()}\n`, stderr: "" };
  if (parsed.values.help || parsed.positionals.length === 0) {
    return { code: 0, stdout: `${HELP}\n`, stderr: "" };
  }
  return {
    code: 2,
    stdout: "",
    stderr: `Unknown or unfinished command: ${parsed.positionals[0]}\n\n${HELP}\n`,
  };
}
