---
slug: capabilities/builder-canvas-polish
kind: capability
title: Builder Canvas Polish (n8n routing + 도메인 tint + 정렬 toolbar)
domain: views
elements: [src/shared/lib/domain-color.ts, src/views/ontology-edit/lib/align-nodes.ts, src/views/ontology-edit/lib/use-vault-graph-flow.ts, src/views/ontology-edit/ui/AlignToolbar.tsx, src/views/ontology-edit/ui/AtlasNode.tsx, src/views/ontology-edit/ui/OntologyEditCanvas.tsx]
relates: [capabilities/builder-vault-write]
---

빌더 (`/ontology/edit`) 캔버스의 시각 정리 + 손 정렬 도구. PR #261 (2026-05-14) 로 7 commit 단위 도입.

- **n8n-style edge routing** — containment edge 는 `smoothstep` + rounded corner + marker, dependency edge 는 directional marker, loose relation 은 낮은 alpha 로 표현
- **MCP dependency alias 호환** — `depends_on` 으로 작성된 agent/CLI edge 도 builder graph 에서는 canonical `dependencies` edge 로 렌더해, MCP 로 만든 의존 관계가 캔버스와 삭제 전 backlink 검사에서 빠지지 않게 함
- **도메인 tint** — node/card/minimap 에 같은 domain hue 를 적용해 큰 vault 에서 cluster 를 빠르게 읽게 함
- **수동 정렬 도구** — 16px snap-to-grid + 다중 선택 (Cmd+click, 2+) 시 캔버스 상단 toolbar 로 L/R/T/B/center-X/center-Y/distribute-H/V 정렬. drag-stop 과 동일 패턴으로 `frontmatter.canvasPosition` 영구화
- **Local vault restore fit** — macOS desktop app 에서 vault graph 가 React Flow mount 이후 복원되거나 static dogfood graph 에서 local vault graph 로 전환돼도 source key 별로 viewport 를 다시 fit 해, 사용자가 수동 정렬/fit 을 누르기 전 캔버스가 빈 화면처럼 보이지 않게 함
- **Graph-first onboarding** — persisted graph 가 이미 있으면 첫 진입 안내 모달을 띄우지 않아, builder 의 첫 화면이 설명문이 아니라 실제 ontology 지도와 쓰기 상태로 시작하게 함
- **Graph-first palette default** — 사용자 선호가 아직 없고 persisted graph 가 있으면 palette 를 접은 상태로 시작해, 큰 local vault 에서 캔버스와 MiniMap 을 먼저 읽게 함. 사용자가 다시 펼치면 localStorage 선호를 보존
- **MiniMap stability** — MiniMap 은 desktop 폭에서만, 노드가 생긴 뒤 첫 animation frame 이후에 렌더해 모바일 bottom nav 충돌과 xyflow 초기 측정 전 SVG 좌표가 `NaN` 으로 찍히는 콘솔 오류를 피함
