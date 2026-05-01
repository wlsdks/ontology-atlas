---
slug: domains/ontology-core
kind: domain
title: Ontology Core (TBox · ABox · Evidence)
capabilities:
  - frontmatter-to-ontology
  - tbox-class-relation
  - tbox-versioning
  - evidence-grounding
  - stub-resolution
elements:
  - src/entities/ontology-class
  - src/entities/ontology-relation
  - src/entities/ontology-tbox
  - src/entities/knowledge-graph
  - src/shared/lib/derive-ontology-from-vault
relates:
  - domains/vault-local-first
  - domains/views
---

# Ontology Core

4-layer class hierarchy (Project · Domain · Capability · Element + Document) + 7 relations
+ immutable schema versioning + evidence-grounded statements. 자세한 모델: `docs/DATA-MODEL.md`,
`docs/ONTOLOGY-MODEL-V2-DRAFT.md` (V2 spec).
