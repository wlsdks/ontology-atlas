---
slug: capabilities/builder-canvas-polish
kind: capability
title: Builder Canvas Polish (n8n routing + 도메인 tint + 정렬 toolbar)
domain: views
elements: [src/shared/lib/domain-color.ts, src/views/ontology-edit/lib/align-nodes.ts, src/views/ontology-edit/lib/use-vault-graph-flow.ts, src/views/ontology-edit/ui/AlignToolbar.tsx, src/views/ontology-edit/ui/AtlasNode.tsx, src/views/ontology-edit/ui/OntologyEditCanvas.tsx]
relates: [capabilities/builder-vault-write]
---

빌더 (`/ontology/edit`) 캔버스의 시각 정리 + 손 정렬 도구. PR #261 (2026-05-14) 로 7 commit 단위 도입.

## 다루는 surface

- **선 꼬임 해소** — `useVaultGraphFlow` 가 containment 엣지 (`domains` / `capabilities` / `elements` / `contains`) 만 dagre rank 계산에 투입. relates / dependencies / describes 는 overlay 로만 그려져 rank 에 영향 0
- **n8n 스타일 엣지** — containment 는 smoothstep + 둥근 모서리 (borderRadius 12) + `ArrowClosed` marker, dependencies 는 dashed bezier + marker, relates/describes 는 marker 없이 흐릿한 overlay. 엣지 라벨 일괄 비표시 (`data.semanticType` / `data.frontmatterKey` 만 남김). hover 시 stroke 굵기 + indigo drop-shadow halo
- **라벨 정리** — `stripTrailingParenthetical` 헬퍼가 노드 카드 라벨에서 후행 괄호 메타 strip. 원본 title 은 `data.fullTitle` 로 보존, hover tooltip / inspector 가 풀 텍스트 노출
- **도메인 그룹화** — slug djb2 hash → 8 hue indigo palette (218°~258°, 디자인 헌장 §11 단일 인디고 약속 안). 노드 좌측 4px accent bar + 옅은 가로 gradient 배경. 미니맵 노드 색도 같은 hue 반영
- **수동 정렬 도구** — 16px snap-to-grid + 다중 선택 (Cmd+클릭, 2+) 시 캔버스 상단 8-버튼 toolbar (L/R/T/B/center-X/center-Y/distribute-H/V). drag-stop 과 동일 패턴으로 `frontmatter.canvasPosition` 영구화
- **시각 elevation 3 단계** — rest/hover/selected box-shadow 차별 (scale 금지 약속 유지). selected 는 indigo halo + ring, hover 는 한 단계 강화, dot grid 옅은 인디고 hint
- **부드러운 transition** — Hierarchy ↔ Force 토글 시 노드 transform + 엣지 path `d` 가 550ms ease-out-quint 으로 슬라이드
- **항상 visible port** — 연결 핸들 10px indigo ring 항상 노출, hover 시 단계적 enlarge + crosshair cursor

## 관련

[[capabilities/builder-vault-write]] — 빌더 캔버스의 vault 진실원 갱신 surface (이 polish 가 *시각/도구* 라면 builder-vault-write 는 *데이터 쓰기*). 같은 코드 베이스 안.

## 단위 테스트

- `align-nodes.test.ts` — 6 align + 2 distribute + edge cases (8 case)
- `domain-color.test.ts` — deterministic / hue range / null neutral (4 case)
- `use-vault-graph-flow.test.ts` — layout contract (LR 골격 / relates rank 영향 0 / semanticType metadata) + stripTrailingParenthetical 5 + resolveNodeDomainSlug 5 + domainSlug propagation 1
