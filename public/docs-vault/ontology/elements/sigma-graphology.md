---
slug: elements/sigma-graphology
kind: element
title: Sigma + Graphology + ForceAtlas2
domain: views
path: package.json
relates:
  - capabilities/topology-sigma-render
---

# Sigma + Graphology + ForceAtlas2

WebGL spatial network 라이브러리 스택. Sigma 가 render, Graphology 가 그래프 자료구조,
ForceAtlas2 가 layout 알고리즘. `/` (홈 hub) 와 `/topology` (alias) 의 토폴로지
view 가 의존.

Path analysis mode now changes Sigma node clicks into source / target path picks while the mode is active, with Shift+click kept as the fallback gesture outside Path mode.

Dense ontology overview keeps relationship edges collapsed until the user zooms in close enough to inspect them. Ontology node kind is visible in the default map through stronger domain / capability / element fill colors and a clearer size hierarchy, so the first screen reads as grouped concepts before it reads as a mesh of links.
