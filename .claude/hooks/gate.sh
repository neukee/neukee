#!/usr/bin/env bash
# Stop hook: Claude cannot finish a turn while the quality gate fails.
# Runs only when source files have uncommitted changes. If the gate has already
# blocked once in this stop sequence, it reports instead of blocking again, so a
# problem Claude cannot fix is handed to the person instead of looping.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat)"
ALREADY_BLOCKED="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch{process.stdout.write("false")}})')"

# Only gate when code, tests, fixtures, catalog or config changed (docs-only edits skip it).
CHANGED="$(git status --porcelain -- packages fixtures catalog package.json pnpm-lock.yaml tsconfig.base.json biome.json vitest.config.ts vitest.setup.ts 2>/dev/null)"
[ -z "$CHANGED" ] && exit 0

LOG="$(mktemp)"
if pnpm -s verify >"$LOG" 2>&1; then
  rm -f "$LOG"
  exit 0
fi

if [ "$ALREADY_BLOCKED" = "true" ]; then
  echo "Quality gate still failing after a fix attempt. Stopping so the person can decide. Last output:" >&2
  tail -n 30 "$LOG" >&2
  rm -f "$LOG"
  exit 1   # non-blocking: the person sees the failure
fi

echo "The quality gate (pnpm verify) is failing. Fix the cause before finishing; do not weaken tests:" >&2
tail -n 40 "$LOG" >&2
rm -f "$LOG"
exit 2     # blocks the stop and sends this output back to Claude
