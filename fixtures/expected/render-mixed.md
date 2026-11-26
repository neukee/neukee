# Neukee scan report

- **Targets:** `node@26` (default)
- **Scanned:** `2026-11-26T12:00:00.000Z`; 2 files scanned, 0 skipped
- **Detected Node.js:** `24`

> **Coverage.** Neukee v0.0.0-test checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26. Rules for those APIs come after launch.

## Summary

| Severity | Findings |
| --- | ---: |
| Action required | 0 |
| Warning | 0 |
| Info | 1 |

## Info (1)

| Rule | Where | What was found | Fix | Source |
| --- | --- | --- | --- | --- |
| `runtime/below-target` | `.nvmrc:1:1` | .nvmrc pins Node.js 24, below the target Node.js 26. This declaration is below the upgrade target. A version pin (such as \`.nvmrc\`) makes the tools that read it keep running the old Node.js after the upgrade. An \`engines.node\` range doesn't select a runtime: it only excludes the target version, and npm treats it as advisory unless \`engine-strict\` is set. | Update this declaration to the target's major version. | [Source](https://nodejs.org/en/about/previous-releases) |

## Diagnostics (1)

| Level | File | Message |
| --- | --- | --- |
| warning | `package.json` | This package.json isn't valid JSON, so its Node.js version wasn't read. |
