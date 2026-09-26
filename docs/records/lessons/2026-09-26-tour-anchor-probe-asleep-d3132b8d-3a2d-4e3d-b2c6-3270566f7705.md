---
id: d3132b8d-3a2d-4e3d-b2c6-3270566f7705
date: 2026-09-26
lesson: cb5fbfaf-2154-4049-973f-57c57f208844
status: verified
parents: 5b677261-df2d-47d7-b5eb-31ea0c9e39da
---
**Evidence**: the tour's canvas anchor probe (`topology-tour-anchor`) is written only on a drawn map frame, and setting the tour's anchor node did not wake the map's idle gate. On a map at rest the probe stayed 0x0 for the whole tour (measured locally: `[64,0,0,0]` on every step), so step 2 had no target: its card centred at x 576-936 on top of the project node (x 920), exactly where step 1's card stood, and the spec's "Next did not move" passed. When the loop was still drawing at the step change (the CI runners of #1907 and #1914) the probe was projected (874,442 93x93), the card stood left of the node (x 502), and Next's right edge read 845. With the map woken on anchor change, 845 reproduces locally every time: CI showed the correct product and the spec encoded the defect.
