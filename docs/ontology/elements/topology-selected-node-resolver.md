---
slug: elements/topology-selected-node-resolver
kind: element
title: Topology Selected Node Resolver
domain: views
---

`src/views/home/lib/resolve-topology-selected-node.ts` resolves the selected `/topology?p=...` value into an ontology graph node.

It accepts Sigma graph IDs such as `capability:topology-analysis-modes`, vault slugs such as `capabilities/topology-analysis-modes`, and docs-vault `ontology/...` evidence IDs. This makes topology node selection shareable and lets the same URL open the ontology-aware drawer, keep the graph selection highlighted, and preserve handoff context for `/ontology` and `/ontology/edit` links.