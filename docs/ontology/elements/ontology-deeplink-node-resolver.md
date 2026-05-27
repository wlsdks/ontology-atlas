---
slug: elements/ontology-deeplink-node-resolver
kind: element
title: Ontology Deeplink Node Resolver
domain: views
canvasPosition: { x: 880, y: 1792 }
---

`src/views/ontology-view/lib/resolve-deeplink-node.ts` resolves `/ontology?node=...` into the selected ontology node.

It accepts both canonical ontology IDs such as `capability:mcp-server` and vault document slugs such as `capabilities/mcp-server`. This keeps links from topology, docs, and builder compatible even though the tree view selects graph IDs while the builder focuses vault `.md` slugs.