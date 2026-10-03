---
id: 8f775ebd-a06f-4e50-9214-e35fdcb846ce
date: 2026-10-03
kind: mistake
status: reported
harness_area: performance
---
**Observed**: Sharing the pending `secret_status` promise initially returned the same mutable status DTO to two callers. The targeted `status-sharing-object-red.log` probe failed once; copying the DTO per caller made it pass while preserving one overlapping native invocation.
**Cost**: One targeted RED/GREEN cycle; elapsed time unknown. No failed CI round.
**Suspected cause**: Promise coalescing also coalesced object identity, which was previously independent across native calls.
**Proposed change**: none. Keep the caller-isolation regression with the pending-read implementation; when coalescing mutable results, preserve each consumer's ownership contract.
