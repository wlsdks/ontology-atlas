---
id: 1f102d48-6c82-486b-b1c9-594d886dad0c
date: 2026-11-13
---
## 2026-11-13 — The INDEX tree opens only when the person opens it

**Why**: selecting a capability opened every ancestor and scrolled the tree, so the panel grew 281 px at 1920x1080 and its footer row moved from y=715 to y=996 while the person was looking at the map. The owner asked (2026-11-13) for panels that stay short and do not move.
**Prior**: overturns the 2026-10 "INDEX tree follows the selection" behaviour described in `docs/features/map/canvas.md`; `decisions/2026-10-24-narrow-map-selection-index-18ea6278-c9d1-48ea-8661-cec45e28076a.md` stands.
**Decision**: a selection never opens or scrolls the tree. The nearest visible ancestor row carries a dot before its count, strong ink and a hidden sentence, and is the tree's Tab stop. The folder line shows only while files are read, and the unbound-project footer row leaves.
**Dissent**: a keyboard user loses the automatic reveal of the selected row and must open the marked row to reach it (product-planner's spec, risk section).
**Falsifier**: a person asks where the selected concept sits in the list, or a selection changes the panel's height or footer position by more than 1 px.
**Owner**: stark
