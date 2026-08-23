---
uid: c42d7066-a77e-45f5-89bb-e78a4adeb660
slug: domains/graph-modeling
kind: domain
title: "Graph Modeling & Ontology Schema"
display_ko: 그래프 모델과 스키마
display_en: "Graph Modeling & Ontology Schema"
capabilities: [capabilities/reviewed-ontology-writing, capabilities/taxonomy, capabilities/vault-ontology]
elements: [elements/acp-ontology-write-review, elements/category, elements/knowledge-graph, elements/ontology-change-review, elements/ontology-class, elements/ontology-edit-redirect, elements/ontology-insights, elements/ontology-meaning-editor, elements/ontology-redirect, elements/status]
created_by: human
---

## Definition
Defines the five authorable kinds, reserved reader kind, actual storage/query/write relation vocabulary, and non-inference boundaries encoded in markdown frontmatter, compiling them into a deterministic graph for compilation and querying.


## Evidence
- docs/ONTOLOGY-ATLAS-SPEC.md §2·§5: Public authoritative definition of kind and relation meanings
- docs/ARCHITECTURE.md: "compile_ontology turns markdown frontmatter into a deterministic graph artifact; query_ontology runs graph operations over that artifact" (Note: This document is subject to risky-citation warnings: includes negated/deprecated-state descriptions; cite alongside the public spec for mutual verification)

## Inclusion / Exclusion
- Included: kind-specific frontmatter normalization, relationship support scope and direction, direct `is_a` determination,
  compile_ontology/query_ontology, explicit absence of automatic inference and standard conformance
- Excluded: The business meaning of individual domains themselves (each domain explains its own)

## Confidence
high (0.9): Direct README citation + cross-reference with independent source (ARCHITECTURE.md)
