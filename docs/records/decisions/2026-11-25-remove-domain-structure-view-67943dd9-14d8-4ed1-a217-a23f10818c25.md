---
id: 67943dd9-14d8-4ed1-a217-a23f10818c25
date: 2026-11-25
---
## 2026-11-25 — Domain structure leaves the map picker

**Why**: owner, 2026-11-25 (in Korean): "I think the domain structure view isn't needed, so remove it outright; and clean up the source code." INDEX, Hex and the 3D tree also read containment. Domain structure was the only view with no canvas and no morph (`morph/layout-morph.ts`), and it forced 15 structure exceptions in the map chrome.
**Prior**: overturns 2026-10-04 dc9455e4 for the view, keeping Galaxy's retirement. Narrows the picker lists in 2026-11-15 a2d8e1f4 and 2026-10-17 fa1f007c to Flat, Hex, 3D, Neural; follows fa1f007c's rule for a retired view.
**Decision**: the picker offers Flat, Hex, 3D, Neural, in that order. `?view=structure` and `?view=galaxy` count as no view, like any unknown value; the stored `atlas.appearance.structure` and `atlas.appearance.galaxy` keys are never read and go on the next pick. Picker test ids and `view3dChoice.*` keys keep their names. Deleted: the `ontology-map/structure/` browser and its tests, the `mapStructure` messages and structure picker rows in each locale, its end-to-end spec, and every structure-only exception in the map chrome.
**Dissent**: Domain structure alone listed, as named DOM rows, concepts outside recorded containment, extra parents, containment cycles and references with no document, paged at 10,000 concepts; it was the map's most complete keyboard and screen-reader containment browser. Hiding it behind a flag lost.
**Falsifier**: a person cannot find a concept with no recorded parent, or see that a concept has two parents, from Flat plus INDEX. Then INDEX gains those rows; the view does not return.
**Owner**: Stark
