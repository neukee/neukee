# Validation on real repositories

Used from task T-050. Every finding the scanner reports on a real public repo is checked by hand. Precision = confirmed ÷ (confirmed + false positives).

## Choosing the 10 repos

- Public Next.js and/or Node.js applications (not libraries), actively maintained.
- A mix of sizes (small, medium, at least one over 100,000 lines).
- A mix of package managers (npm, pnpm, yarn v1, yarn Berry).
- A mix of versions (some on Next 14/15, some on Node 18/20/22).
- At least two with Dockerfiles and two with deployment config.

| #   | Repo | Size (lines) | Package manager | Next / Node | Scanned on | Commit |
| --- | ---- | ------------ | --------------- | ----------- | ---------- | ------ |

## Findings

| Repo | Rule | Location | Verdict (confirmed / false-positive / unsure) | Note |
| ---- | ---- | -------- | --------------------------------------------- | ---- |

## Results

| Measured on | Findings | Confirmed | False positives | Unsure | Precision |
| ----------- | -------- | --------- | --------------- | ------ | --------- |
