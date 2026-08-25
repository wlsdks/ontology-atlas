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
relation_notes: { capabilities/summary-freshness: "Graph modeling owns whether the compiled graph still tells the truth, so it also owns the advisory that a summary node's description has fallen behind the membership it declares." }
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
