---
slug: capabilities/tbox-versioning
kind: capability
title: TBox Versioning (Schema as Git)
domain: ontology-core
elements:
  - src/entities/ontology-tbox
  - src/entities/ontology-class
  - src/entities/ontology-relation
relates:
  - domains/ontology-core
---

# TBox Versioning

`OntologyTBoxVersion` — 4 layer classes + 7 relations 의 immutable snapshot.
모든 `knowledgeApprovedNodes/Edges` 가 `tboxVersionId` 를 frozen reference 로 가짐.
schema 가 진화해도 과거 fact 는 *그 시점 schema* 로 해석 가능.

대부분의 ontology 도구가 못 하는 차별점. v2 spec (`docs/ONTOLOGY-MODEL-V2-DRAFT.md`)
의 dual-write / dual-read 마이그레이션도 이 기반 위.
