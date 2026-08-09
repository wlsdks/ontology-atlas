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
사람과 agent가 같은 판별로 5개 authorable kind와 typed relation을 작성하도록 하고,
기계가 강제하는 frontmatter shape·사람이 승인하는 의미·현재 query/write 지원 범위·
추론하지 않는 경계를 서로 다른 권위와 검증 경로로 유지하는 능력.

`project`·`domain`·`capability`·`element`·`document`만 저작할 수 있고,
`vault-readme`는 도구가 만든 reader 전용 kind다. `broader`는 narrower에서 direct
broader를 가리키며 UI에서 `is_a`로 보이지만 현재 공개 relation API enum에는 없다.
Atlas는 자동 inverse/transitive inference나 RDF/OWL/SKOS/SHACL conformance를
제공하지 않는다.

## 근거
- docs/ONTOLOGY-ATLAS-SPEC.md §2·§5: kind 판별, 반례, relation storage/display/write,
  direct `is_a`, absence와 추론 경계의 공개 정본
- mcp/src/schema.mjs: authorable kind와 kind별 frontmatter shape
- src/shared/lib/validate-vault-document.ts: 예약 reader kind 포함 검증
- docs/ONTOLOGY-QUALITY.md: 품질 규칙 권위 지도
- mcp/src/construction-rules.mjs: MCP와 앱 agent가 읽는 compact meta-model·구축 지침
- tests/contract/ontology-meta-model.contract.test.ts: 정본 consumer와 prompt parity 계약

## 확신도
high (0.95): 공개 정본·schema·validator·실제 consumer·negative fixture를 교차 검증.
