---
id: d1c993bf-6797-4027-b5a5-2cbcd1580afb
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: checks-changed
---
**Observed**: a recurrence of cc29829d. On `feat/motion-signature-s2-light` (#2222), `pnpm checks:changed -- --run` ran step 3 (four Playwright specs, PASS in 77.2s) before step 23 (`pnpm knip`, FAIL in 15.2s); the next run ran step 3 again (PASS in 77.3s) before step 27 (`pnpm test:contracts`, FAIL in 16.3s), and only the third passed 32 of 32.
**Cost**: about 2.6 minutes of repeated Playwright time, two extra 77-second batches, for two failures that each took about 16 seconds to report.
**Suspected cause**: as in cc29829d, `scripts/suggest-focused-checks.mjs` runs its steps in rule order and stops at the first failure, so knip and the contract suite run after the Playwright batch.
**Proposed change**: script: in `--run` mode, run lint, typecheck, Vitest, knip and contract steps before any Playwright step, as cc29829d proposes.
