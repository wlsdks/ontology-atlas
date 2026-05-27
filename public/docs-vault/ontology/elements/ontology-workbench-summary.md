---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the compact Browse / Write / Query summary at the top of /ontology. It frames the tree as one browse mode inside the graph workbench, then hands users to Builder for writes and Insights for graph DB-style query packs.

When a user selects a tree node, the collaborator brief exposes the same handoff triangle: topology focus for visual inspection, builder focus for frontmatter-backed edits, and the query cockpit for graph DB-style validation. The copied review and vocabulary packets include the same `/ontology/insights/` handoff so a tree review does not stop at hierarchy browsing.

Builder relation writes now preserve the same graph proof path. The write confirm and post-save handoff expose topology path/focus links plus `/ontology/insights/`, and copied packets include query cockpit context next to relation_check, path, bounded all_paths, and sync-gate commands.
