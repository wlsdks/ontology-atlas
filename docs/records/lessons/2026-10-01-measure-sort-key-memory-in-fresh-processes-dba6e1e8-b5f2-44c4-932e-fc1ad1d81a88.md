---
id: dba6e1e8-b5f2-44c4-932e-fc1ad1d81a88
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The first alternating in-process compiler benchmark measured shuffled 100,000-document medians of 1,385.6 ms before and 1,224.7 ms after precomputing relation sort keys, but did not measure peak memory. Three fresh processes per implementation measured 1,628.0 versus 1,487.0 ms and median peak RSS of 579.7 versus 590.4 MiB for that fixture.
**Cost**: An additional 12 child-process benchmark runs to cover natural and shuffled inputs; separate elapsed time unmeasured. The shuffled fixture gained 141 ms with 10.7 MiB more peak RSS.
**Suspected cause**: Warm in-process measurements do not capture startup/JIT conditions or the peak memory tradeoff of temporary decorated sort keys.
**Proposed change**: none; for allocation-changing compiler optimizations, report fresh-process peak memory alongside alternating runtime measurements and preserve the workload boundary.
