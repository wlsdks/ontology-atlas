---
uid: c42d7066-a77e-45f5-89bb-e78a4adeb660
slug: domains/graph-modeling
kind: domain
title: Graph Modeling & Ontology Schema
display_ko: 그래프 모델과 스키마
display_en: Graph Modeling & Ontology Schema
capabilities: [capabilities/ontology-blocks, capabilities/taxonomy, capabilities/vault-ontology]
elements: [elements/category, elements/knowledge-graph, elements/ontology-class, elements/ontology-edit-redirect, elements/ontology-insights, elements/ontology-redirect, elements/ontology-studio, elements/status]
created_by: human
---

## 정의
markdown frontmatter가 인코딩하는 5개 authorable kind, 예약 reader kind, 실제
storage/query/write relation vocabulary와 비추론 경계를 정의하고 이를 결정론적
그래프로 컴파일·쿼리하는 책임 영역.

## 근거
- docs/ONTOLOGY-ATLAS-SPEC.md §2·§5: kind와 relation 의미의 공개 정본
- docs/ARCHITECTURE.md: "compile_ontology turns markdown frontmatter into a deterministic graph artifact; query_ontology runs graph operations over that artifact" (주의: 이 문서는 risky-citation 경고 대상: negated/deprecated-state 서술 포함, 공개 spec과 함께 인용하여 상호 검증)

## 포함 / 제외
- 포함: kind별 frontmatter 정규화, 관계 지원 범위와 방향, direct `is_a` 판별,
  compile_ontology/query_ontology, 자동 추론·표준 conformance 부재의 명시
- 제외: 개별 도메인의 업무 의미 자체 (그건 각 도메인이 스스로 설명)

## 확신도
high (0.9): README 직접 인용 + 독립 소스(ARCHITECTURE.md) 대조
