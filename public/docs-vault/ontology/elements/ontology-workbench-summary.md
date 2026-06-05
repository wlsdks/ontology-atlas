---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-tree-projection-summary]
---

# Ontology Workbench Summary

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the Browse / Write / Query summary for `/ontology`.

The command bar is the first workbench handoff: it opens the work overview, concept search, global search, graph DB insights, MCP setup, and Save/edit from the same ontology context. On mobile it now wraps those actions into readable labeled pills instead of collapsing them into icon-only controls or hiding later actions behind horizontal scroll. That keeps Browse, Write, Query, and agent setup discoverable before the user starts traversing the tree.

The work overview dialog still explains the three route roles: Browse scans the hierarchy and selected-node proof, Write opens the Save/edit canvas, and Query opens the graph DB proof cockpit. The mobile command bar mirrors that model directly in the visible action labels.
