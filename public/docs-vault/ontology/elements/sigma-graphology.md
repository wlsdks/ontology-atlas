---
slug: elements/sigma-graphology
kind: element
title: Sigma + Graphology + ForceAtlas2
domain: views
path: package.json
relates: [capabilities/topology-canvas-render]
---

# Sigma + Graphology + ForceAtlas2

WebGL 스택 중 Graphology(그래프 자료구조) + ForceAtlas2(layout 알고리즘)는
`/`, `/topology` 의 canvas-2D 엔진(`topology-map-v2`)과 `/ontology/edit` ERD
빌더가 공유하는 물리 레이아웃이다. Sigma.js 자체(WebGL 렌더러)는 `/`,
`/topology` 에서는 은퇴했고, 현재는 `/docs` 폴더-토폴로지 미니맵
(`src/widgets/docs-vault/ui/DocsVaultFolderTopology.tsx`, `@sigma/node-border`
포함)만 직접 의존한다.

Path analysis mode 등 Sigma 전용 상호작용(노드 클릭 → source/target path pick,
Shift+click fallback)은 `/docs` 미니맵 범위에서만 유효하다. `/`, `/topology`
의 동일한 사용자 경험은 [[capabilities/topology-canvas-render]] 가 다룬다.
