---
id: cd0c8aad-7caa-4b38-98e2-4e122a1b6052
date: 2026-09-20
---
## 2026-09-20 — The expand bar names its own scope, and "expand all" stays the toolbar's

**Why**: two controls on the map said the same words for different scopes. The toolbar button (`searchWidgets.hint.expandAllLabel`) opens every folded node and refits the view; the bar over a selected parent opens that parent's children. In English both read the literal string "Expand all"; in Korean, two synonyms of it. Measured 2026-09-20 on the sample map: selecting the payments domain put the bar's expand-all phrase above the node while the toolbar's expand-all phrase sat above the canvas, with nothing on screen saying which one stays inside the node.
**Prior**: keeps the 2026-08-02 decision "What makes a bar a bar is the text button" — the bar is still a verb, and a count is still spoken only when it differs from the node's engraved total. Only the numberless verb changes, from the toolbar's phrase to the bare one.
**Decision**: the bar's numberless label is the bare verb (`topology.cluster.barExpand`, "Expand" and its Korean equivalent), the mirror of its own Collapse; the counted form `topology.cluster.barExpandCount` is unchanged; the phrase "Expand all" and its Korean equivalent belong to the toolbar alone (`searchWidgets.hint.expandAllLabel`). A contract reads both locales and fails if any `topology.cluster` string equals the toolbar's label.
**Dissent**: the bare verb drops the promise that one press opens everything, which "all" carried; a reader may now expect a batch. Kept as the falsifier rather than the design because the node engraves the total beside the bar, so the completeness is already on screen, and repeating the number was refused by the 2026-08-02 decision.
**Falsifier**: a walkthrough where someone presses the bar expecting a batch and is surprised that everything opened, or asks which of the two controls is the wider one: then the bar needs its own scope word ("Expand children") rather than the bare verb.
**Owner**: jinan
