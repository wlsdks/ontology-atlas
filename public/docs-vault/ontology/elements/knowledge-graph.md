---
uid: 81a0e0cc-c8ea-4f15-90bd-ee100ed1322b
slug: elements/knowledge-graph
kind: element
title: Knowledge Graph
display_ko: 지식 그래프
domain: domains/graph-modeling
path: src/entities/knowledge-graph
created_by: "agent:unknown"
---

Graph node/edge data structure entity. Evidence of implementation for capabilities/vault-ontology.

## Evidence

- Primary implementation: `src/entities/knowledge-graph/model/build-edge-type-rows.ts#buildEdgeTypeRows`
- Supporting implementation: `src/entities/knowledge-graph/model/use-edge-type-label.ts#useEdgeTypeLabel`
- Focused test: `src/entities/knowledge-graph/lib/code-locations.test.ts#includes the node's OWN title when the node itself is a path-titled element`
- Focused test: `src/entities/knowledge-graph/lib/code-locations.test.ts#dedupes when the same path is reachable via more than one contains edge`
