---
uid: c42d7066-a77e-45f5-89bb-e78a4adeb660
slug: domains/graph-modeling
kind: domain
title: "Graph Modeling & Ontology Schema"
display_ko: 그래프 모델과 스키마
display_en: "Graph Modeling & Ontology Schema"
capabilities: [capabilities/reviewed-ontology-writing, capabilities/summary-freshness, capabilities/taxonomy, capabilities/vault-ontology]
elements: [elements/acp-ontology-write-review, elements/category, elements/knowledge-graph, elements/ontology-change-review, elements/ontology-class, elements/ontology-edit-redirect, elements/ontology-insights, elements/ontology-meaning-editor, elements/ontology-redirect, elements/status]
created_by: human
relation_notes: { capabilities/reviewed-ontology-writing: "A typed change proposal is shown and approved before any frontmatter is written, so what the graph means stays a person's decision rather than the caller's.", capabilities/summary-freshness: "Graph modeling owns whether the compiled graph still tells the truth, so it also owns the advisory that a summary node's description has fallen behind the membership it declares.", capabilities/taxonomy: "Which kind a node is, and the category and status values it may carry, is the vocabulary the graph is authored in, and the spec rather than a folder or team name decides it.", capabilities/vault-ontology: "The five authorable kinds, the typed relation vocabulary, and the refusal to infer inverse or transitive edges are the schema this responsibility area defines.", elements/acp-ontology-write-review: "An agent's write tool stops at a typed change card while its read tools continue, so nothing edits vault Markdown before a person sees what it would change.", elements/category: The cluster-box categories are one of the two taxonomy value sets a node carries., elements/knowledge-graph: The node and edge data model built from vault frontmatter is the compiled graph every other surface reads., elements/ontology-change-review: "The pre-write card renders the exact typed change and keeps no second approval record, so confirmed frontmatter stays the only source of truth.", elements/ontology-class: Each authorable kind needs one label and icon so the same five kinds read the same way on every surface., elements/ontology-edit-redirect: "Old workbench addresses still carry links, and translating their parameters into the map's edit state keeps those links pointing at the surface that now does the editing.", elements/ontology-insights: "The Analysis workbench asks whether the loaded graph still holds together, covering what is missing, what connects, where the boundaries are, and what has gone stale.", elements/ontology-meaning-editor: "One relation at a time is chosen, previewed on the real map geometry, and written with an mtime guard after review, which is how a person authors meaning by hand.", elements/ontology-redirect: "The old /ontology address still receives links, and it lands them on the map with the index expanded instead of a broken query.", elements/status: "The eight seeded lifecycle statuses are the other taxonomy value set, with stable ids so records written earlier keep resolving." }
---

## Definition
Defines the five authorable kinds, reserved reader kind, actual storage/query/write relation vocabulary, and non-inference boundaries encoded in markdown frontmatter, compiling them into a deterministic graph for compilation and querying. It also owns whether that graph still tells the truth: alongside writing and compiling, it reports when a summary node's own description has fallen behind the membership it declares.


## Evidence
- docs/ONTOLOGY-ATLAS-SPEC.md §2·§5: Public authoritative definition of kind and relation meanings
- docs/ARCHITECTURE.md: "compile_ontology turns markdown frontmatter into a deterministic graph artifact; query_ontology runs graph operations over that artifact" (Note: This document is subject to risky-citation warnings: includes negated/deprecated-state descriptions; cite alongside the public spec for mutual verification)

## Inclusion / Exclusion
- Included: kind-specific frontmatter normalization, relationship support scope and direction, direct `is_a` determination,
  compile_ontology/query_ontology, the summary-freshness advisory over a node's own history,
  explicit absence of automatic inference and standard conformance
- Excluded: The business meaning of individual domains themselves (each domain explains its own)

## Confidence
high (0.9): Direct README citation + cross-reference with independent source (ARCHITECTURE.md)
