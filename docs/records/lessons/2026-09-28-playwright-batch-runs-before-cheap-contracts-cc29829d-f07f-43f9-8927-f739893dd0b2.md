---
id: cc29829d-f07f-43f9-8927-f739893dd0b2
date: 2026-09-28
kind: tool-efficiency
status: reported
harness_area: checks-changed
---
**Observed**: on `design/screens-round`, `pnpm checks:changed -- --run` ran step 3 (19 Playwright specs, PASS in 515.8s) before step 23 (`pnpm test:contracts`, FAIL in 27.0s). The runner stops at the first failure, so fixing one contract line meant running the Playwright batch again.
**Cost**: about 9 minutes of repeated Playwright time for a 27-second contract failure.
**Suspected cause**: `scripts/suggest-focused-checks.mjs` orders its list by rule order, not by cost, so cheap deterministic checks can land after the slowest one.
**Proposed change**: script — run lint, typecheck, Vitest and contract steps before any Playwright step in `--run` mode.
