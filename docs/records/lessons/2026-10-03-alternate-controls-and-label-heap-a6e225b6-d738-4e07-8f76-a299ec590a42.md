---
id: a6e225b6-d738-4e07-8f76-a299ec590a42
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: Ordered healthy-vault control runs suggested a 9.08ms-to-12.74ms slowdown, while alternating the same baseline and indexed functions after warmup measured 14.30ms versus 14.02ms. A later isolated lazy-index control measured 5.76ms versus 6.02ms. The initial order-sensitive result was not enough to attribute a regression. GC-enabled measurements showed about 0.34MB extra temporary after-return heap in the 12,000-conflict case, similar retained output, and roughly 1KB difference after release; these snapshots do not measure peak allocation.
**Cost**: Additional narrow control and memory probes; time unknown, no wasted CI round.
**Suspected cause**: JIT/GC and ordering affect short microbenchmarks; different phases can look like product changes.
**Proposed change**: none. Alternate warmed baseline/change samples for an unresolved ordinary-path cost concern, include a healthy control next to the adverse-input win, and label retained-heap snapshots separately from peak memory. Keep sparse work indexes lazy and call-local.
