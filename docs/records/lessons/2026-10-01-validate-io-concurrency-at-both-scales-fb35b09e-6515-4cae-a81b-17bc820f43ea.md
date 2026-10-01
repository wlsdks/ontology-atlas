---
id: fb35b09e-6515-4cae-a81b-17bc820f43ea
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: A stable-snapshot async prototype on 10,000 physical files was faster under Bun at concurrency 32 (271.2 ms synchronous versus 106.8 ms async). At 100,000 files, three fresh Bun processes per mode instead measured medians of 2,741.2 ms synchronous, 2,989.9 ms at 16 and 3,536.4 ms at 32. The async prototype was not applied. A separate exact-sized synchronous buffer prototype also failed to improve Node's 100,000-file workload.
**Cost**: Two discarded I/O prototypes and additional physical-fixture runs; separate engineering time unmeasured.
**Suspected cause**: Runtime overhead, allocation and scale affect filesystem scheduling; a win at 10,000 files did not predict 100,000-file behavior.
**Proposed change**: none; test both target scales and fresh runtime processes before changing vault snapshot scheduling. Prefer avoiding content reads where only disk slugs are needed, without weakening the content snapshot contract.
