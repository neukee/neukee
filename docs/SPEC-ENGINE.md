# Engine (v0b) specification — outline

**Status:** not started. Work begins after the scanner launches. This outline exists so scanner decisions do not block the engine. Turn each section into detailed tasks in `docs/TASKS.md` (phase E) only when the scanner is shipped.

## 1. The April slice (first paying version)

The smallest engine customers will pay a pilot for:

- **Inputs:** the customer's existing tests only. No generated requests, no staging replay.
- **Recording:** inbound HTTP and outbound HTTP (`http` and undici) via Node `diagnostics_channel`, loaded with `node --import`. No database capture yet.
- **Baseline:** built after each merge to main, run twice to learn the noise mask, cached as a CI artifact keyed on commit SHA + lockfile hash + runner image.
- **Comparison:** status, headers, normalized bodies, outbound calls (method, host, path, body shape), query count and memory when available.
- **Output:** PR check with a verdict and coverage; markdown report; JSON.

Because it runs only the tests the customer's CI already runs, it adds no new execution risk. That is why it can ship before the sandbox.

## 2. Components

| Package    | Responsibility                                                                                               | Key risk                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `recorder` | Subscribes to `diagnostics_channel` events; writes a compact event log per test                              | Works across test runners (Vitest, Jest, Playwright), ESM and CommonJS |
| `runner`   | Checks out baseline/candidate, installs, runs the test command under the recorder, caches baseline artifacts | Install time and CI cost; cache keys                                   |
| `differ`   | Normalizes events, applies the noise mask, classifies differences with the catalog                           | Precision: false alarms make teams turn it off                         |

## 3. First experiments (spikes) before committing to the design

0. **Competitive spike (E-001, first, due Dec 31):** in a demo app, upgrade `pg` or `ioredis` by one major version with a behavior change the tests don't assert. Run Tusk Drift's demo replay, Keploy and our approach (real database containers, never mocking the upgraded library). Record who catches it. If record/replay tools catch it too, the pitch leans on catalog verdicts and evidence (see `docs/BRIEF.md` §6).
1. **Recorder spike:** can `diagnostics_channel` capture inbound requests in a Next.js 15/16 App Router app under `next start` and in route-handler tests? Measure overhead.
2. **Noise spike:** run one open-source app's tests twice; list every field that differs; check whether the two-run mask removes all of it.
3. **Replay spike:** take 5 real past Renovate PRs from an open-source app; run baseline vs candidate; count real vs false differences by hand.

Each spike ends with a short write-up in `docs/DECISIONS.md` and a go / change / stop decision. **Human review required** on all three (instrumentation is the highest technical risk).

## 4. Later (not in the April slice)

Postgres row comparison (logical decoding), generated requests (advisory), staging replay with credential re-signing, the no-egress sandbox, Playwright flows, GitLab, the dashboard. See the product spec for the full design.
