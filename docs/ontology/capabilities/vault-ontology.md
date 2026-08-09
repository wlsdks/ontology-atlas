---
uid: 1ee91a34-14c2-4bdd-bda8-84910555939b
slug: capabilities/vault-ontology
kind: capability
title: Vault Ontology Schema Authoring
domain: domains/graph-modeling
elements: [elements/knowledge-graph, elements/ontology-class]
path: mcp/src/schema.mjs
created_by: human
---

## 정의
kind별 frontmatter 형태와 관계 타입을 정규화하고, hard schema·advisory graph signal·
사람의 의미 판단·evidence protocol이 서로 다른 권위와 검증 경로를 갖도록 유지하는 능력.

## 근거
- src/features/vault-ontology (구현 증거)
- AGENTS.md: Frontmatter shape per kind (R14)
- docs/ONTOLOGY-QUALITY.md: 품질 규칙 권위 지도
- mcp/src/construction-rules.mjs: fan-out·hub·bridge·element 자격의 실행 지침

## 확신도
medium-high (0.85)
