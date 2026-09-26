---
id: 3b68fac4-8f72-43c7-9286-9fb479c52f16
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: companion
---
**Observed**: Train #1903 passed all six `companion-sector.spec.ts` cases, but shard 3 failed two existing `companion-growth.spec.ts` cases: the map overflowed by 29px with doubled text, and the auto-retry control was covered at a coarse landscape viewport. Moving the new sector entry from the plan actions into the map heading restored both local checks without relaxing their thresholds.
**Cost**: One red CI round; the failed browser shard took 12.2 minutes.
**Suspected cause**: The direct-sector proof covered the destination but did not run the existing selector's full viewport and hit-area journey after adding a third action. The focused plan selected the edited new spec, not the adjacent legacy entry-surface spec.
**Proposed change**: gate. Consider mapping CompanionMap edits to the existing companion-growth E2E journey so the selector's overflow and hit-area contracts run before CI. This lesson does not change the gate; the current patch runs the whole existing journey on the production export alongside the sector cases.
