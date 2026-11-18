# Fixtures

Small, hand-made sample repositories and files used by tests. Never copy real customer code here.

- `repos/<name>/` — whole sample repos for pipeline and snapshot tests (task T-004 onward).
- `rules/<rule-id>/positive/` — code that must produce the rule's finding.
- `rules/<rule-id>/negative/` — similar code that must not.

Fixtures are excluded from linting on purpose: some contain deliberately broken or outdated code.
