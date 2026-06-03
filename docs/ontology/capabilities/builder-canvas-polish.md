---
slug: capabilities/builder-canvas-polish
kind: capability
title: Builder Canvas Polish (n8n routing + 도메인 tint + 정렬 toolbar)
domain: views
elements: [elements/builder-detail-sheet, elements/builder-graph-anchor-rail, elements/builder-write-summary, elements/ontology-design-surface-guard, elements/ontology-edit-canvas, src/shared/lib/domain-color.ts, src/views/ontology-edit/lib/align-nodes.ts, src/views/ontology-edit/lib/use-vault-graph-flow.ts, src/views/ontology-edit/ui/AlignToolbar.tsx, src/views/ontology-edit/ui/AtlasNode.tsx, src/views/ontology-edit/ui/OntologyEditCanvas.tsx]
relates: [capabilities/builder-vault-write]
---

빌더 (`/ontology/edit`) 캔버스의 시각 정리 + 손 정렬 도구. PR #261 (2026-05-14) 로 7 commit 단위 도입.

- **n8n-style edge routing** — containment edge 는 `smoothstep` + rounded corner + marker, dependency edge 는 directional marker, loose relation 은 낮은 alpha 로 표현
- **Box-safe edge endpoints** — LR 레이아웃의 edge 는 노드 오른쪽 handle 에서 나와 왼쪽 handle 로 들어가게 고정하고, 노드 카드는 opaque base 로 뒤쪽 relation overlay 를 가려 vertical spine 이나 점선이 카드 내부를 관통해 보이지 않게 함
- **MCP dependency alias 호환** — `depends_on` 으로 작성된 agent/CLI edge 도 builder graph 에서는 canonical `dependencies` edge 로 렌더해, MCP 로 만든 의존 관계가 캔버스와 삭제 전 backlink 검사에서 빠지지 않게 함
- **도메인 tint** — node/card/minimap 에 같은 domain hue 를 적용해 큰 vault 에서 cluster 를 빠르게 읽게 함
- **수동 정렬 도구** — 16px snap-to-grid + 다중 선택 (Cmd+click, 2+) 시 캔버스 상단 toolbar 로 L/R/T/B/center-X/center-Y/distribute-H/V 정렬. drag-stop 과 동일 패턴으로 `frontmatter.canvasPosition` 영구화
- **Local vault restore fit** — macOS desktop app 에서 vault graph 가 React Flow mount 이후 복원되거나 static dogfood graph 에서 local vault graph 로 전환돼도 source key 별로 viewport 를 다시 fit 해, 사용자가 수동 정렬/fit 을 누르기 전 캔버스가 빈 화면처럼 보이지 않게 함
- **Graph-first onboarding** — persisted graph 가 이미 있으면 첫 진입 안내 모달을 띄우지 않아, builder 의 첫 화면이 설명문이 아니라 실제 ontology 지도와 쓰기 상태로 시작하게 함
- **Relation guard onboarding copy** — 첫 진입 안내도 vault↔vault edge 를 자동 저장한다고 말하지 않고, write preview / preflight / relation key 선택 후 저장 흐름을 설명해 `Guard` 카드와 실제 relation confirmation 계약이 같은 언어를 쓰게 함
- **Graph-first palette default** — 사용자 선호가 아직 없고 persisted graph 가 있으면 palette 를 접은 상태로 시작해, 큰 local vault 에서 캔버스와 MiniMap 을 먼저 읽게 함. 사용자가 다시 펼치면 localStorage 선호를 보존
- **Graph anchor first focus** — 저장된 graph 가 준비되면 첫 entry anchor 를 한 번 자동 focus 해, 큰 vault 의 builder 첫 화면이 축소된 전체 썸네일이 아니라 선택된 프로젝트/도메인과 인스펙터로 시작하게 함. 사용자가 이미 다른 노드를 선택한 경우에는 focus 를 빼앗지 않음
- **Compact graph anchor rail** — 캔버스 상단 saved-anchor strip 은 기본적으로 작은 `그래프 앵커` pill 로 접어, 첫 화면에서 01/02/03 계약 설명과 고 degree 노드 목록이 그래프 위를 계속 덮지 않게 함. 필요할 때만 펼쳐 현재 slug, primary anchor, `+N more` picker 를 확인
- **Quiet layout mode** — `계층 / Force` 같은 구현 알고리즘 label 을 상시 노출하지 않고 `정렬 방식` disclosure 안으로 접어, 기본 toolbar 는 자동 정렬과 상세/쓰기 상태 같은 사용자가 바로 이해할 작업만 보여줌. 내부 `dagre` / `force` layout mode 는 유지해 고급 사용자는 단계별 정렬과 관계 중심 정렬을 필요할 때만 전환
- **Read-only source recovery** — Builder write summary 의 `Source` 카드가 샘플 read-only 상태에서 바로 `로컬 vault 열기` / `Get macOS app` CTA 를 보여줘, 캔버스가 쓰기 불가인 이유와 writable vault 로 전환하는 다음 행동을 같은 persistence contract 안에서 노출
- **MiniMap stability** — MiniMap 은 desktop 폭에서만, 노드가 생긴 뒤 첫 animation frame 이후에 렌더해 모바일 bottom nav 충돌과 xyflow 초기 측정 전 SVG 좌표가 `NaN` 으로 찍히는 콘솔 오류를 피함
- **Design drift guard** — `/ontology`, `/ontology/edit`, `/ontology/insights`, ontology subnav, operation nav 의 금지 패턴을 `pnpm design:ontology` 로 검사해 glow hover, scale hover, glass blur, purple/pink, decorative gradient 가 다시 들어오지 않게 함. 같은 gate 가 Browse / Write / Query, Builder Source / Draft / Guard / Proof, Insights query cockpit / runtime gate 구조도 확인해 workbench 핵심 루프가 UI 에서 빠지지 않게 함
