---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
---

# Ontology Node Detail Modal

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The modal keeps the selected ontology concept readable first: kind, title, summary, object lens, relation counts, and agent proof actions are visible in the same centered surface. It no longer depends on a cramped desktop right-side inspector for core comprehension.

The modal now uses a desktop LNB layout. The left rail holds the internal sections (`Overview`, `Relations`, `Agent`, `Review`) while the right pane is the larger reading and action surface. This matches the app settings modal pattern: navigation is stable, content scrolls inside the dialog, and the page behind the modal does not become the main scroll context.

The reading pane uses larger body text and wider horizontal padding so selected concept summaries and relationship evidence can be inspected without tiny compressed cards. The graph proof strips and copy actions remain available, but they sit under a clearer workbench shell instead of competing with the concept description.

This element is a dogfood proof point for Atlas itself: when an agent or developer clicks a node in the project ontology, the modal should explain what the concept means, what it connects to, and what Claude/Codex should copy next before changing code.
