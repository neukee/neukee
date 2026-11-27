import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ISSUES, type RunOptions, type RunResult, scanCommand } from "./scan-command.js";

export type { RunOptions, RunResult };

const HELP = `neukee — find what blocks your Node.js and Next.js upgrades

Usage:
  neukee scan [path] [--target tool@version]... [--format terminal|markdown]
              [--output <file>] [--fail-on action-required|warning|never]
  neukee --version
  neukee --help

Options:
  --target     What to check against, repeatable, one per tool. Supported:
               node@24, node@26, next@15, next@16.
               Default: node@26, unless you name a Node.js target.
  --format     terminal (default) or markdown. json and sarif come later.
  --output     Write the report to a file instead of printing it.
  --fail-on    Exit with code 1 when a finding is at or above this severity:
               action-required (default), warning or never.

Exit codes: 0 no blocking findings, 1 blocking findings, 2 usage error, 3 internal error.

Neukee only reads files. It never runs the project it scans, and it uses no network.`;

/** The version in this package's own package.json, checked rather than assumed. */
function version(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (
    typeof manifest === "object" &&
    manifest !== null &&
    "version" in manifest &&
    typeof manifest.version === "string"
  ) {
    return manifest.version;
  }
  throw new Error("The package.json of @neukee/cli has no version.");
}

/** Bad arguments, exit code 2, with the whole usage text. */
const parseError = (message: string): RunResult => ({
  code: 2,
  stdout: "",
  stderr: `${message}\n\n${HELP}\n`,
});

/**
 * An unexpected failure, exit code 3: only the error's name, never its message, a path or a stack
 * (they can carry repository content). Exit 1 means "blocking findings", so a crash must not use it.
 */
function internalError(error: unknown): RunResult {
  const name = error instanceof Error ? error.name : "unknown";
  return {
    code: 3,
    stdout: "",
    stderr: `Neukee hit an internal error (${name}). This is a bug: please report it at ${ISSUES} and say which command you ran.\n`,
  };
}

/** Pure entry point: takes arguments, returns output. The bin file only prints it. */
export function run(argv: string[], options: RunOptions): RunResult {
  try {
    return runCommand(argv, options);
  } catch (error) {
    return internalError(error);
  }
}

function runCommand(argv: string[], options: RunOptions): RunResult {
  let parsed: ReturnType<typeof parseCommandLine>;
  try {
    parsed = parseCommandLine(argv);
  } catch (error) {
    return parseError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.version) return { code: 0, stdout: `${version()}\n`, stderr: "" };
  const [command, path, ...rest] = positionals;
  if (values.help || command === undefined) return { code: 0, stdout: `${HELP}\n`, stderr: "" };
  if (command !== "scan") return parseError(`Unknown command: ${command}`);
  return scanCommand(
    {
      path,
      extra: rest.length,
      targets: values.target ?? [],
      format: values.format,
      output: values.output,
      failOn: values["fail-on"],
    },
    options,
    version(),
  );
}

function parseCommandLine(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      target: { type: "string", multiple: true },
      format: { type: "string" },
      output: { type: "string" },
      "fail-on": { type: "string" },
    },
  });
}
