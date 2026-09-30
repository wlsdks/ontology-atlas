---
id: 847a287a-ca7a-42ec-8b1b-6540aa91b2d5
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance-test-routing
---
**Observed**: `pnpm test:perf -- --run src/entities/docs-vault/lib/build-local-manifest.perf.test.ts` executed all ten performance files (18 tests, 12.84 s), rather than only the intended manifest file.
**Cost**: ten performance files ran where one was intended; elapsed 12.84 s.
**Suspected cause**: the extra argument separator did not reach Vitest as the expected file filter.
**Proposed change**: none; use `pnpm exec vitest run --project=perf <file>` for a single performance fixture.
