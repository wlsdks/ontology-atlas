---
id: 2e3ec483-47f5-4af9-abc8-c870b1fb3160
date: 2026-09-26
lesson: cb5fbfaf-2154-4049-973f-57c57f208844
status: fixed
parents: d3132b8d-3a2d-4e3d-b2c6-3270566f7705
---
**Evidence**: #1926 wakes the map's idle gate when the tour names an anchor node, so the probe is projected on every step. MC-14 now asserts that Next keeps its inset in the card and that the step 2 card clears the projected project node. With the wake removed it fails (probe null); with it restored it passes 5/5 on the static export, and the tour specs pass 23/23 on dev.
