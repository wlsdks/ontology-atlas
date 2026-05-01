---
slug: capabilities/v1-5-cardinality
kind: capability
title: V1.5 — Relation Cardinality (Palantir 영감)
domain: ontology-core
elements: [src/entities/ontology-relation/model/types.ts, src/entities/ontology-relation/model/mapper.ts]
---

# V1.5 — Relation Cardinality

Palantir-style cardinality constraints on OntologyRelation. additive (breakage 0), legacy = undefined → many/many.

## 추가 필드 (옵셔널)

- sourceCardinality?: "one" | "many" — source 가 같은 relation 으로 향할 수 있는 target 개수
- targetCardinality?: "one" | "many" — target 이 받을 수 있는 source 개수

## 예시

- belongs_to.sourceCardinality = one — 한 노드는 한 부모만
- implements.targetCardinality = one — 한 spec 만 구현
- describes — 둘 다 many (default)

## 검증

edge 생성/approve 단계에서 검증 가능 (별도 PR).

자세히: docs/ONTOLOGY-MODEL-V2-DRAFT.md §6.
