---
slug: elements/ontology-sub-nav
kind: element
title: Ontology Sub Nav
domain: views
---

`src/widgets/ontology-sub-nav/ui/OntologySubNav.tsx` renders the shared `/ontology` surface switcher for Concept map, Edit relations, and Verify graph.

It keeps the visible Browse counts in user language (`Concept map`, source concepts, relations) while detailed tooltips explain that source concepts are ontology-store records with `kind:` document attributes. The Korean count hint intentionally says `온톨로지 저장소` instead of `문서함` so the first viewport reads as a graph workbench rather than a file cabinet.

The shared surface links keep a 32px mobile hit target even though the row stays visually compact. The labels are phrased as actions, not internal mode names: select one concept first, repair relations only when needed, then verify the graph. This keeps phone-sized Ontology Atlas windows from presenting three abstract tabs before the user knows what to do.
