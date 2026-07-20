---
slug: capabilities/relation-rationale
kind: capability
title: Relation Rationale (관계 근거 why)
domain: domains/ontology-core
elements: []
---

관계에 "왜"를 붙이는 스키마 역량 (2026-07-21, P6). `relation_notes: {ref: 근거 한 줄}` frontmatter carrier — 파서 3계(런타임/MCP/스크립트)가 동일 해석함을 contract fixture 로 증명했고, `rename_concept` 는 노트 키를 함께 재작성한다(키 충돌 시 기존 new-키 값 승리 — 조용한 덮어쓰기 금지).

MCP `add_relation` 의 `why` 파라미터는 관계와 근거를 한 번의 frontmatter 쓰기로 기록한다(원자성). derive 는 노트를 해당 엣지의 label 로 승격하고, 지도의 엣지 팝오버가 문장 아래 근거를 보여준다.

원칙: 근거 없는 엣지는 마인드맵 선이지 온톨로지 주장이 아니다 — 도구 설명에 명시해 에이전트가 자발적으로 채우게 한다.