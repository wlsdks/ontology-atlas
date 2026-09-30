---
id: f61cae66-0a74-44c0-89e0-adefe579c276
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: `pnpm exec prettier --write src/entities/knowledge-graph/lib/ontology-tree/domain-census.ts` returned `Command "prettier" not found`; the repository does not expose that executable.
**Cost**: One failed command; elapsed time was not measured separately.
**Suspected cause**: Assuming a common formatter was installed before checking this repository's tools.
**Proposed change**: none; inspect available scripts before invoking a formatter, and use the mandated focused lint checks for this slice.
