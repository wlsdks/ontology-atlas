---
id: d6a04177-de9e-44b7-bc5e-f8d85059d7bc
date: 2026-09-26
kind: tool-efficiency
status: reported
harness_area: parallel-work
---
**Observed**: two parallel agents (e2e sleep removal b, Insights flake fix, 2026-09-27) were given their own Playwright port, but `pnpm checks:changed -- --run` launched its Playwright lane with a bare `pnpm exec playwright test`, starting a dev server on the default :3100. In one run :3100 belonged to an unrelated local server and two specs failed (a 404 in public-surface-health, a missed press in route-transition-input); rerunning with `PLAYWRIGHT_STATIC=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3663 pnpm checks:changed -- --run` passed.
**Cost**: one wasted full checks:changed round per agent (about 5 minutes each).
**Suspected cause**: the parallel brief assigns a port for "every browser run" but does not say that checks:changed inherits the port only through the environment, so agents export it for direct Playwright runs and forget the final gate.
**Proposed change**: skill: one line in /parallel-brief section 1 saying to prefix `pnpm checks:changed` with the same PLAYWRIGHT_STATIC and PLAYWRIGHT_BASE_URL.
