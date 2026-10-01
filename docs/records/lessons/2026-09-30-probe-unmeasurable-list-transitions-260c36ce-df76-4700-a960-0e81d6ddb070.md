---
id: 260c36ce-df76-4700-a960-0e81d6ddb070
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The previous viewport probe mocked `clientHeight` to 360 and bounded the first committed row set. A new zero-height test in `use-windowed-rows.test.ts` failed with 1000 rows instead of 64: the later compute pass expanded the initial bounded seed to the entire list. Evidence: `/Users/jinan/scratch/atlas-scale-100k/hidden-rows-red.log`.
**Cost**: The zero-height path remained unqualified through the preceding visible-viewport optimization; wider runtime impact was not measured before this regression probe.
**Suspected cause**: Treating an unmeasurable scroller as a reason to disable virtualization, and testing the first viewport only at a nonzero height.
**Proposed change**: none; include hidden-to-visible and count-change transitions when verifying bounded mounting. This slice adds the regression and keeps zero-height lists bounded.
