---
slug: elements/ontology-sub-nav
kind: element
title: Ontology Sub Nav
domain: views
---

`src/widgets/ontology-sub-nav/ui/OntologySubNav.tsx` renders the shared `/ontology` surface switcher for Concept map, Edit relations, and Verify graph.

The sub-nav no longer repeats source-concept or relation counts. Those graph-size
facts already appear in the page header and footer, so repeating them in the
always-visible navigation made the first viewport feel like a metrics dashboard.
The row now acts only as a work-surface switcher: Concept map, Edit relations,
and Verify graph.

The shared surface links keep a 32px mobile hit target even though the row stays visually compact. The labels are phrased as actions, not internal mode names: select one concept first, repair relations only when needed, then verify the graph. This keeps phone-sized Ontology Atlas windows from presenting three abstract tabs before the user knows what to do.
