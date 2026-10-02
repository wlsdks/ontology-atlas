---
id: 5be0e7af-31a5-4718-801f-da3af1356451
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: harness
---
**Observed**: The host guessed `node scripts/po-route.mjs --help` and received MODULE_NOT_FOUND; documented `pnpm po:route -- --help` resolved `scripts/po-risk-router.mjs`. A guessed check-rules filename also failed. The planner independently used unsupported `doc:new --area=agent` before correcting to `agents`.
**Cost**: Three failed local lookups/invocations; elapsed cost unknown. No source or user data was lost.
**Suspected cause**: Guessing repository paths and accepted options instead of using the documented package command and its help output.
**Proposed change**: none — existing package entrypoints and help are sufficient. Use them and rg --files for unknown source paths; do not add a wrapper or resident rule for this incident.
