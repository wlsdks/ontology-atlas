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
노드는 kind(capability / domain / element) chip + 소유 domain(비즈니스 영역)을
노출해 클릭 없이 분류·영역을 한눈에 본다. 소유 domain 은 `resolveOwnerDomainLabel`
이 in-neighbor 중 kind:domain 노드에서 derive(domain 노드 자신은 inter-domain
coupling 을 owner 로 오인하지 않게 null). 이전엔 project 용 `extractDomainLabel` 이
ontology slug('capabilities/foo')를 'capabilities/foo' 조각으로 잘못 보여줬는데,
ontology 노드는 그 자리를 kind chip + 소유 domain 으로 대체해 회귀를 정정했다.
