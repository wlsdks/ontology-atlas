---
id: 96c3ca79-6da9-4a7e-8015-032e3f0408be
date: 2026-10-03
kind: mistake
status: reported
harness_area: motion-proof
---
**Observed**: the interrupted-assembly regression compared moving Float32 matrices with exact array equality across a 60,000 ms suspended clock. The first green attempt had 14 passed cases and one 120 Hz case failing on `0` versus `-5.283270732058662e-17`; the geometry was otherwise the same. Before the fix all seven new lifecycle cases failed on actual frame ownership or assembly-phase differences.
**Cost**: one extra focused run; about 9 seconds for the failing run, other work time unknown.
**Suspected cause**: subtracting large elapsed times and composing a Three matrix gives representational rounding for a moving phase. Exact equality is appropriate for the authored settled matrices, but not for an equivalent moving phase reached by a differently partitioned floating clock.
**Proposed change**: none. This regression now compares every matrix component at six decimal places in normalized object units and keeps exact length comparison; the old hidden-time jump changes components by whole visible units and is still rejected. Camera comparison remains at ten decimals.
