---
id: 1b7c5b15-d344-4e31-9dd0-ff3a00e7b233
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: checks-changed
---
**Observed**: a recurrence of cc29829d and d1c993bf. On `fix/progressive-vault-load` (#2313), `pnpm checks:changed -- --run` failed five times in a row on cheap steps, each reached only after the Playwright batch (PASS in 74–76 s) and `vitest related` (PASS in 62–88 s): `source-comment-bytes` (1.8 s), `knip` (14.9 s), `desktop:check` (0.5 s), `test:contracts` (24.0 s, file-size and cross-slice ratchets) and `knip` again after the merge (16.0 s). The sixth run passed 34 of 34.
**Cost**: about 12 minutes of repeated Playwright and Vitest time to report five failures that took under a minute together; no CI rounds.
**Suspected cause**: as in cc29829d, `scripts/suggest-focused-checks.mjs` runs steps in rule order and stops at the first failure, so ratchets that read source text run after the slowest browser lane.
**Proposed change**: script: in `--run` mode, run lint, typecheck, knip, `desktop:check` and the contract ratchets before any Playwright or `vitest related` step, as cc29829d proposes.
