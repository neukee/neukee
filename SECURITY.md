# Security policy

Neukee reads code that belongs to someone else. We treat every file in a scanned repository as hostile input, and we take reports about that boundary seriously.

## Reporting a vulnerability

Please report security issues privately through GitHub: [open a private security advisory](https://github.com/neukee/neukee/security/advisories/new). Don't open a public issue, pull request or discussion for a suspected vulnerability.

Include what you can:

- the affected version or commit
- a minimal repository or file that triggers the problem
- what happened and what you expected
- your assessment of the impact

## What to expect

Neukee is maintained by one person, so these are honest targets rather than a contract:

- an acknowledgement within 3 business days
- an initial assessment within 7 business days
- a fix or a mitigation plan agreed with you before anything is disclosed

We credit reporters in the advisory unless you ask us not to.

## Scope

In scope, with highest priority:

- **Code execution.** Anything that makes the scanner run code, scripts or a package manager from a scanned repository.
- **Network access.** Any path that makes the scanner open a socket, resolve DNS or call `fetch`.
- **Escaping the repository.** Reading files outside the scanned directory, for example through symlinks or path traversal.
- **Leaking data into reports.** Absolute paths, environment variables, secrets or file contents beyond the single line needed to locate a finding.
- **Denial of service from crafted files.** Inputs that hang the scanner, exhaust memory or trigger catastrophic regular-expression backtracking.
- **Supply chain.** Problems in this repository's workflows, release pipeline or published packages.

Out of scope:

- false positives and false negatives (please [open an issue](https://github.com/neukee/neukee/issues/new/choose) instead)
- vulnerabilities in a scanned project's own dependencies, which Neukee only reports on
- issues that require an attacker to already control the machine running the scan

## Supported versions

Neukee is pre-release and has not published a package yet. Until 1.0, only the latest release receives security fixes.

The security model is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#7-security-model).
