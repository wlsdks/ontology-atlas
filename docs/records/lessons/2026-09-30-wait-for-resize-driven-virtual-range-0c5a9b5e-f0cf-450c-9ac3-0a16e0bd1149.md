---
id: 0c5a9b5e-f0cf-450c-9ac3-0a16e0bd1149
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The first isolated virtualizer comparison waited for React's hidden flag and `clientHeight === 0`, then read 21 mounted rows for both strategies. Their ResizeObserver-driven range updates had not completed. Waiting for the actual post-observer row set returned 64 for the custom hook and 0 for TanStack Virtual, and both recovered exact End focus. Evidence: `repeated-results.jsonl` (superseded hidden snapshots) and `settled-results.jsonl` under `/Users/jinan/scratch/atlas-scale-100k/virtual-comparison/`.
**Cost**: One repeated comparison run had unusable hidden-state snapshots; elapsed wall time was not measured as a separate batch.
**Suspected cause**: A React commit and a zero DOM height were mistaken for completion of the independent ResizeObserver-driven virtual range update.
**Proposed change**: none; wait for the virtualizer's observable mounted-row state before recording hidden-state results. The final probe waits for 64 or 0 rows respectively.
