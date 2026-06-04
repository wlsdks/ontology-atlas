---
slug: elements/ontology-deeplink-node-resolver
kind: element
title: Ontology Deeplink Node Resolver
domain: views
canvasPosition: { x: 880, y: 1792 }
---

`src/views/ontology-view/lib/resolve-deeplink-node.ts` resolves `/ontology?node=...` into the selected ontology node.

It accepts both canonical ontology IDs such as `capability:mcp-server` and vault document slugs such as `capabilities/mcp-server`. This keeps links from topology, docs, and builder compatible even though the tree view selects graph IDs while the builder focuses vault `.md` slugs.

`src/views/ontology-insights/lib/resolve-insights-query-node.ts` applies the same compatibility rule for `/ontology/insights?node=...`. It also accepts project frontmatter slug aliases such as `oh-my-ontology` for `project:oh-my-ontology`, so builder proof links from the auto-focused root project open the focused proof panel instead of falling back to the generic query cockpit.

`src/views/ontology-edit/ui/OntologyEditPage.tsx` keeps `BuilderWriteSummary` on the same contract: if a saved concept has a vault slug, proof links use it; if only a graph node id is available, the summary still emits a focused `/ontology/insights/?node=...` link because the insights resolver can resolve canonical graph IDs directly.