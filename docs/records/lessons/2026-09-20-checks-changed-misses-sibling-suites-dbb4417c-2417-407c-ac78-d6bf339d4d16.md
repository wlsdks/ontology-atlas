---
id: dbb4417c-2417-407c-ac78-d6bf339d4d16
date: 2026-09-20
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: A branch that changed only `AcpPermissionCard.tsx` passed all six `pnpm checks:changed -- --run` lanes while `AcpChatPanel.test.tsx`, the suite that renders the card, had 25 failing cases. Only the pre-push unit lane (`vitest run --changed=<merge-base>`) caught it. The same planner skipped `pnpm desktop:check` for a README-only diff (a regression merged; restored in #1545) and `pnpm dogfood:release-gate` for a new validator warning code (#1797).
**Cost**: 25 broken cases nearly pushed, one merged regression, one lost landing (#1797).
**Suspected cause**: The path-to-check table is maintained by hand and does not follow imports, so a suite whose name differs from the changed file is never selected.
**Proposed change**: script: derive recommendations from the module graph (`vitest --changed`) or from the files each contract test reads. Until then, a pass means the recommended checks passed, not the relevant ones.
