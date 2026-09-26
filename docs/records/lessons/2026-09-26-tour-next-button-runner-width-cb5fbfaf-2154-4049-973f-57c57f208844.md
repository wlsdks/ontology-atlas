---
id: cb5fbfaf-2154-4049-973f-57c57f208844
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: train #1907 failed Playwright (chromium 2/3) on `map-canvas-interaction-placement.spec.ts:286` (MC-14 tour): the Next button's right edge moved 919 -> 845 between steps, 3 of 3 attempts on one runner. The same head passed locally on dev and on a static export, and the next train (#1908) passed it in CI.
**Cost**: one ejected train and a second full CI run (about 20 minutes).
**Suspected cause**: unknown; a runner-specific text width (fonts) in the tour card is the leading guess.
**Proposed change**: gate: measure the Next button against the card's own right edge instead of an absolute position, after reproducing the runner difference.
