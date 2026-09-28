---
id: 6699fcd6-2b5b-4155-81b3-f3a45bc3f821
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: landing
---
**Observed**: #2105's first train (run 36381673930, with #2056, #2093 and #2094) failed `map-canvas-interaction-placement.spec.ts:471` (the wiki-pages name "at 59,155 under the canvas edge") on every retry. Its second train, #2105 alone (run 36382360013), printed `[ci-impact] ... playwright=skip ... comparable change — affected evidence only` and passed, so #2105 landed as 5005bec8d. The same failure then ejected #2056, #2093 and #2094 (runs 36382374208, 36382534969, 36383088184, 36383809886, 36383825859, 36384550402), none of which touches the Territories view. Round 2 passed on Linux in trains before #2105 (runs 36373876074, 36375351218) and fails on 5005bec8d plus a library-only change (6a6ebb373). Locally it passed 5 of 5 on macOS, because the canvas font stack (`-apple-system, 'SF Pro Text', sans-serif`) measures Korean names differently on Linux, and it failed on Linux inside `mcr.microsoft.com/playwright:v1.62.0-noble`.
**Cost**: six ejected train runs and main red for every change that runs the map e2e, measured 2026-09-28.
**Suspected cause**: the impact plan let a train for one pull request skip Playwright after that pull request's own earlier train failed a Playwright spec, so bisection could not implicate it; and the only local e2e proof ran on macOS, whose text widths give a different layout from CI's Linux.
**Proposed change**: gate: a train re-run keeps every Playwright spec that failed in the pull request's previous train; and a map layout change runs its territories specs in Linux Chromium locally (the Playwright image) before landing.
