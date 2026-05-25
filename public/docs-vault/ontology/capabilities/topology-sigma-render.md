---
slug: capabilities/topology-sigma-render
kind: capability
title: Topology — Sigma WebGL Render
domain: views
elements:
  - src/views/home
  - src/widgets/topology-map-sigma
relates:
  - domains/views
  - elements/sigma-graphology
---

# Topology — Sigma WebGL Render

Sigma.js + Graphology + ForceAtlas2 spatial network. 노드 클릭 → ProjectDrawer,
hover → 1-hop 이웃 강조, 우측 SigmaHubRail (degree 상위), 우측 SigmaMinimap.
`⌘K` 검색. `/` (홈 hub) 와 `/topology` (alias) 양쪽에서 동일 컴포넌트 (HomePage)
가 mount.
