---
slug: elements/sigma-graphology
kind: element
title: Graphology + ForceAtlas2
domain: views
path: package.json
relates: [capabilities/topology-canvas-render]
---

# Graphology + ForceAtlas2

Graphology(그래프 자료구조) + ForceAtlas2(layout 알고리즘)는 `/`, `/topology`
의 canvas-2D 엔진(`topology-map-v2`)이 선택적 relaxation pass에 사용하는
현재 layout 기반이다. `/ontology/edit` ERD Builder는 은퇴했고 Workshop으로
redirect되므로 공유 renderer나 layout consumer가 아니다.
Sigma.js(WebGL 렌더러)는 코드베이스에서 완전히 제거됐고
(`@sigma/*` 의존 0), 실제 픽셀은 canvas-2D 엔진이 단일 `<canvas>` 위에 직접
그린다. 노드 포커스·팝오버 같은 사용자 경험은
[[capabilities/topology-canvas-render]] 가 다룬다.
