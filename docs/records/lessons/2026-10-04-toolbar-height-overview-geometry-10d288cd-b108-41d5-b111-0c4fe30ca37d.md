---
id: 10d288cd-b108-41d5-b111-0c4fe30ca37d
date: 2026-10-04
kind: mistake
status: reported
harness_area: map-toolbar
---
**Observed**: Train #2529 failed the unchanged storefront 1040 overview three times with 11 line crossings against its existing ceiling of 10. The same test locally failed on the shipping export at source 3a07deb70. Grouping the right utility and status rows had also reduced their gap from the existing 16 pixels to 8. Restoring the existing gap leaves the left lane at the top and restores the initial map room. The diagnostic file was overwritten with a 10-to-10 run and is not causal evidence; the original CI log and local test receipt are the baseline.
**Cost**: One additional full CI round; elapsed repair time not measured.
**Suspected cause**: Toolbar height changes affect the initial camera fit and projected map geometry even when map algorithms are untouched.
**Proposed change**: none; preserve the established row spacing in this fix and validate every existing overview width after a shared toolbar height change, rather than checking only the originally failing synthetic viewport.
