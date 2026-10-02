---
id: 5ef0291b-6efe-4cfd-99bd-539f6d5d16c2
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The first comparison command `node /tmp/ontology-atlas-body-queue-probe.mjs compare` was launched alongside `pnpm exec vitest run src/widgets/docs-vault/lib/use-docs-body-index.test.ts` on the shared runner. Exact-output parity remains usable, but CPU timing for the overlapping samples cannot establish an isolated comparison. The final performance run is scheduled after all verification processes complete.
**Cost**: one preliminary comparison run to repeat; elapsed time and token cost unknown; no CI rounds.
**Suspected cause**: treating independent verification commands as independent CPU workloads; they share the same execution host.
**Proposed change**: none to the harness yet. Reserve a quiet measurement window after functional checks finish, and record which CPU, DOM, storage and delay costs the benchmark includes before quoting performance.
