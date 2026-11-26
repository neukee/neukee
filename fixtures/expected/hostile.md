# Neukee scan report

- **Targets:** `node@26`
- **Scanned:** `2026-11-26T12:00:00.000Z`; 3 files scanned, 1 skipped
- **Detected Node.js:** `22`, `` `x` || >=20 ``

> **Coverage.** Neukee v0.1.0 checks which Node.js version runs where, not your code for APIs removed in Node 23 to 26. Rules for those APIs come after launch.

## Summary

| Severity | Findings |
| --- | ---: |
| Action required | 0 |
| Warning | 1 |
| Info | 0 |

## Warning (1)

| Rule | Where | What was found | Fix | Source |
| --- | --- | --- | --- | --- |
| `runtime/below-target` | `packages/@scope/a#b/.nvmrc:1:1`<br>```odd`name``x.js:2```<br>`` `lead.js `` | @<span></span>Venu2328 @<span></span>next/swc-linux-x64-gnu #<span></span>1 neukee/neukee#<span></span>1 :<span></span>+1: x@<span></span>y.z https\://example.com www\.example.com | Ask @<span></span>maintainer about #<span></span>2, then rerun. | [Source](https://nodejs.org/en/about/previous-releases) |

## Diagnostics (1)

| Level | File | Message |
| --- | --- | --- |
| warning | `packages/@scope/a#b/package.json` | Could not read @<span></span>scope/pkg#<span></span>3 :<span></span>tada: |
