---
slug: capabilities/topology-sigma-render
kind: capability
title: Topology — Sigma WebGL Render
domain: views
elements:
  - src/widgets/sigma-topology
  - src/views/home
relates:
  - elements/sigma-graphology
  - domains/views
---

# Topology — Sigma WebGL Render

Sigma.js + Graphology + ForceAtlas2 spatial network. 노드 클릭 → ProjectDrawer,
hover → 1-hop 이웃 강조, 좌측 Legend, 우측 SigmaHubRail (degree 상위), 하단
RegionNavigator (minimap). `⌘K` 검색.

Mission v2 후 `/topology` 라우트로 이동 — `/` 는 ontology hub 가 됨.
