---
slug: elements/ontology-sub-nav
kind: element
title: Ontology Sub Nav
domain: views
---

`src/widgets/ontology-sub-nav/ui/OntologySubNav.tsx` renders the shared `/ontology` surface switcher for Browse, Builder, and Insights.

It keeps the visible Browse counts in user language (`Concept map`, concepts, relations) while detailed tooltips still explain projection nodes and frontmatter references, so the hierarchy browse surface is not confused with canonical graph DB proof compile counts.

The shared surface links keep a 32px mobile hit target even though the row stays visually compact. That makes Browse / Save-edit / Validate feel like one workbench mode switcher on phone-sized Ontology Atlas windows instead of a set of small text tabs.
