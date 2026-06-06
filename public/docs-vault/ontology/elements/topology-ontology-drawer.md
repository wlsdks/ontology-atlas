---
slug: elements/topology-ontology-drawer
kind: element
title: Topology Ontology Drawer
domain: views
relates: [elements/ontology-description-helper]
---

`src/views/home/ui/TopologyOntologyDrawer.tsx` is the ontology-aware selected concept workbench inside `/topology`.

It opens a centered modal from the graph canvas and separates the selected node into LNB sections for overview, direct relations, agent/collaborator handoff, and editing actions. The drawer keeps the first screen readable by summarizing the node as title + short description + key facts, then exposes relation evidence and MCP/CLI checks in dedicated sections.

Current layout contract: the modal is wide enough for macOS app inspection, uses a persistent LNB from medium breakpoints upward, and keeps key facts and descriptions at readable sizes so `/topology` does not become only a dense graph canvas. Regression coverage lives in `src/views/home/ui/TopologyOntologyDrawer.test.tsx`.
