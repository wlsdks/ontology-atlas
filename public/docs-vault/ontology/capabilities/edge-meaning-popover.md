---
slug: capabilities/edge-meaning-popover
kind: capability
title: Edge Meaning Popover (관계 팝오버)
domain: domains/views
elements: []
dependencies: [capabilities/relation-rationale]
relation_notes: { capabilities/relation-rationale: 팝오버가 문장 아래 보여주는 근거 줄이 relation_notes 에서 온다 }
---

지도의 엣지를 클릭 가능한 1급 객체로 만든 역량 (2026-07-21, P3b). 빈 공간 클릭이 엣지 7px 근접이면 팝오버가 열린다: 평문 문장("A 가 B 에 기대요") → 타입 → 양 끝 노드(클릭=포커스) → 관계 근거(why, `relation_notes`) → 선언한 vault 문서(.md 링크 + 변경 시점) → 관계 편집 딥링크.

구현: `topology-edge-hit.ts`(AABB 프리패스 + 베지어 16-샘플), `TopologyV2EdgePanel.tsx`, `WorldEdge.relationType/declaredBySlug` 배관. 후보는 양 끝점이 현재 tier 에서 히트 가능한 엣지로 제한 — 안 보이는 엣지 클릭 금지 계약.

레퍼런스 근거: Kumu/Bloom/Foundry 공통형 "엣지 = 선택 가능한 객체 + 패널 상세". 온톨로지다움의 분기점은 타입 이름이 아니라 문장화 + 선언 출처다.