---
slug: domains/graph-modeling
kind: domain
title: Graph Modeling & Ontology Schema
display_ko: 그래프 모델링 및 온톨로지 스키마
display_en: Graph Modeling & Ontology Schema
capabilities: [capabilities/ontology-blocks, capabilities/taxonomy, capabilities/vault-ontology]
elements: [elements/src/entities/category, elements/src/entities/knowledge-graph, elements/src/entities/ontology-class, elements/src/entities/status, elements/src/views/ontology-edit-redirect, elements/src/views/ontology-insights, elements/src/views/ontology-redirect, elements/src/views/ontology-studio]
---

## 정의
markdown frontmatter가 인코딩하는 타입 kind/relation 모델(project/domain/capability/element, is_a/contains/depends/relates)을 정의하고, 이를 결정론적 그래프로 컴파일·쿼리한다.

## 근거
- README.md — "Because the kinds and relation types are a small fixed set, the folder is not just readable — it is computable."
- docs/ARCHITECTURE.md — "compile_ontology turns markdown frontmatter into a deterministic graph artifact; query_ontology runs graph operations over that artifact" (주의: 이 문서는 risky-citation 경고 대상 — negated/deprecated-state 서술 포함, README.md와 함께 인용하여 상호 검증)

## 포함 / 제외
- 포함: kind별 frontmatter 정규화, 관계 타입, compile_ontology/query_ontology
- 제외: 개별 도메인의 업무 의미 자체 (그건 각 도메인이 스스로 설명)

## 확신도
high (0.9) — README 직접 인용 + 독립 소스(ARCHITECTURE.md) 대조