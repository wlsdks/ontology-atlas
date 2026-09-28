---
id: 929344ea-a7a1-45cc-9c17-1bc54bddba10
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: tests
---
**Observed**: on #2155 round one, a scratch sweep compared `nextDueAt` with a brute-force wall-clock scan in ten pinned zones and reported 0 differences. The scan used the implementation's own definition, a run at each existing local minute on the cadence grid, so both skipped a grid time the clock jumps over. The review's sweep asserted a property stated without that definition, no gap longer than the cadence plus 60 minutes, and found a 24-hour round in America/Santiago with no run on 2026-09-06, the day its midnight does not exist. This extends 1dded6d0, whose proposed rule asks for such a reference.
**Cost**: one review round on #2155 (fix first, item 4), then a second fix and a re-run sweep; time unknown.
**Suspected cause**: a reference re-implemented from the same definition finds coding slips, not a gap in the definition; the definition never said what happens when a grid time does not exist.
**Proposed change**: rule — extend the line 1dded6d0 proposes for `.claude/rules/testing.md`: a brute-force reference for time or schedule math also asserts one property stated without the implementation's definition, such as the longest gap between runs or the runs per local day.
