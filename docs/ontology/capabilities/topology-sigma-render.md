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

hover 시 `SigmaNodeTooltip` 이 name · degree · description 을 띄운다. ontology
노드는 kind(capability / domain / element)를 chip 으로 노출한다 — 색 인코딩(범례)
을 텍스트로도 확인. 이전엔 project 용 `extractDomainLabel` 이 ontology slug
('capabilities/foo')를 'capabilities/foo' 조각으로 잘못 보여줬는데, ontology
노드는 그 자리를 kind chip 으로 대체해 회귀를 정정했다.
