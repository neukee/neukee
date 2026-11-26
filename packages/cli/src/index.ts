#!/usr/bin/env node
import { run } from "./run.js";

const result = run(process.argv.slice(2), {
  color: process.stdout.isTTY === true && !process.env.NO_COLOR,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.code;
