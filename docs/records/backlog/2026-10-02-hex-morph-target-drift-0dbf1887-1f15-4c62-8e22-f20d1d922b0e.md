---
id: "0dbf1887-1f15-4c62-8e22-f20d1d922b0e"
date: "2026-10-02"
task: "hex-morph-target-drift"
status: "ready"
parents: []
worktree: "feat/hex-relief"
---
The hex board's layout-morph target is predicted from the outgoing view's chrome, so a glide from Flat into the Hex board lands 4–15 px (dogfood at 1512) and about 19 px (synth 10,000) away from where the board then draws each tile, and the board steps there on handoff. The relief adds nothing beyond that (median 19.5 px in relief against 19.3 px top-down at 10k). The likely cause is the predicted room not counting the hex board's own footer and legend (`morph/hex-marks.ts` `predictHexMarks` against `ui/OntologyHexBoardMap.tsx`'s room read). Measured by `tests/e2e/map-hex-relief.spec.ts` (the two glide cases) on `feat/hex-relief`, 2026-10-03.
