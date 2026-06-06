---
slug: documents/business-to-code-dogfood-audit
kind: document
title: Business-to-Code Dogfood Audit
relates:
  - capabilities/collaborator-reader-brief
  - capabilities/project-ontology-indexing
  - elements/ontology-reader-intent-contract
  - elements/ontology-workbench-summary
---

# Business-to-Code Dogfood Audit

This note records the answer to the product-direction question: what should
Atlas express through ontology?

Atlas should not optimize for a raw source-code graph first. The primary layer is
the business-to-code meaning layer:

1. `domain` names a stable vocabulary, ownership, or decision boundary.
2. `capability` names a product or system behavior that people can discuss.
3. `element` names the concrete code artifact, command, route, component, hook,
   or module that proves the capability exists.
4. `project` names the scope that contains the model.

The source-code structure is still important, but it is evidence and
traceability. A file path starts as an `element`; it becomes a `capability` only
when behavior or workflow evidence exists, and it becomes a `domain` only when
multiple capabilities share vocabulary, ownership, or decision relevance.

## Dogfood Evidence

During this audit, Atlas was used on the Atlas repository itself.

- `index_project({ rootPath: "/Users/jinan/side-project/oh-my-ontology",
  maxDepth: 2, maxFiles: 5000, threshold: 2 })` detected the repo as FSD and
  proposed 54 concept candidates, 20 suggested semantic relations, and 102
  thresholded import relations.
- The same indexing pass reported 473 code import edges whose endpoint slug is
  not yet a vault node, plus 15 vault `depends_on` edges with no matching code
  import. That is useful maintenance evidence, but it also proves why raw import
  structure should not become the product's main ontology by itself.
- `ontology-atlas project-map ontology-atlas docs/ontology --json` showed the
  curated project scope as 97 nodes: 6 domains, 33 capabilities, 57 elements,
  366 internal edges, 196 external evidence edges, 0 unassigned nodes, and 0
  unresolved edges.
- `ontology-atlas domain-matrix docs/ontology --json` showed 6 domains, 99 total
  nodes, 96 assigned nodes, 76 cross-domain edges, 284 self-domain edges, 196
  external evidence edges, and 0 unresolved edges.

The result is a practical split:

- CodeGraph / import indexing is the deterministic structural substrate. It
  helps an agent avoid re-reading the repo and finds missing evidence edges.
- Atlas ontology is the shared decision model. It tells planners, marketers,
  leaders, developers, and agents which domains and capabilities matter, then
  points down to code as proof.

## Current Shape

The project map currently concentrates much of the model in
`domains/views` (64 project-scope nodes, 17 capabilities, 46 elements). That is
not automatically wrong because Browse, Builder, Topology, and Insights are the
main product surfaces. But it is the next place to inspect if the map stops
helping non-developer readers. A useful follow-up would be to split view
capabilities only when the split names a reader-relevant decision boundary, not
just a React folder boundary.

`domains/ai-agent-partner` is the wedge and maintenance engine: MCP server,
agent setup, sync skills, live activity, and project indexing. It should remain
visibly connected to `views`, `vault-local-first`, and `ontology-core`, because
the product promise is not a plugin alone. The agent keeps the graph current so
the whole decision loop can trust it.

## Working Rule

When developing Atlas, ask the ontology before opening raw code when the task is
about product meaning, ownership, workflow, or impact. Ask CodeGraph first when
the task is about symbols, call flow, imports, or structural blast radius. The
two tools are complementary:

- Atlas answers "what does this product/system mean, who can decide with it,
  and what evidence should be verified?"
- CodeGraph answers "where is this implemented, what calls it, and what might
  break structurally?"

This dogfood split is the reason Atlas should continue to show business/product
domain and capability first, then cite source code as implementation evidence.
