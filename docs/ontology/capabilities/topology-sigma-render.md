---
slug: capabilities/topology-sigma-render
kind: capability
title: Topology — Sigma WebGL Render
domain: views
elements:
  - elements/ontology-description-helper
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

hover 시 `SigmaNodeTooltip` 이 name · degree · 짧은 description 을 띄운다. ontology
노드는 kind(capability / domain / element) chip + 소유 domain(비즈니스 영역)을
노출해 클릭 없이 분류·영역을 한눈에 본다. 소유 domain 은 `resolveOwnerDomainLabel`
이 in-neighbor 중 kind:domain 노드에서 derive(domain 노드 자신은 inter-domain
coupling 을 owner 로 오인하지 않게 null). 이전엔 project 용 `extractDomainLabel` 이
ontology slug('capabilities/foo')를 'capabilities/foo' 조각으로 잘못 보여줬는데,
ontology 노드는 그 자리를 kind chip + 소유 domain 으로 대체해 회귀를 정정했다.
`src/shared/lib/ontology-description.ts` 가 긴 body excerpt 를 그대로 보여주지 않고
첫 문장 중심의 160자 안팎 description 으로 줄여, topology hover 가 문서 읽기
화면처럼 길어지지 않게 한다.

노드 드래그는 `downNode` 시점부터 Sigma 기본 pan 을 막고, release 는 Sigma captor
뿐 아니라 window `mouseup` / `pointerup` / `blur` 에서도 정리한다. 5초 recent
change pulse cleanup 이 드래그 중 graph rebuild 를 만들지 않도록, cleanup 은
드래그가 끝날 때까지 보류한다.

선택한 노드가 `Views` 처럼 관계가 많은 dense focus 일 때는 직접 edge 도 낮은
alpha / 얇은 stroke 로 낮추고, 이웃끼리 edge 는 거의 숨긴다. focus mode 는
전체 관계를 하얗게 태우는 화면이 아니라 선택 노드 주변의 근거를 읽는 화면이어야
한다.

선택 / hover 라벨은 `SigmaFocusLabel` DOM overlay 로 그리되, 노드가 화면
오른쪽이나 아래쪽 가장자리에 가까우면 라벨을 viewport 안쪽으로 clamp 하고 반대편에
붙인다. 라벨 capsule 은 불투명 배경과 제한 폭 / truncation 을 가져, relation line
위에 떠 있어도 텍스트가 선에 파묻히지 않는다.

`/topology`의 첫 viewport도 이제 Sigma graph가 실제로 그리는 ontology node /
edge 수를 concept / relation metric으로 말한다. 왼쪽 collapsed hero, 분석 바,
screen-reader `application` label이 모두 project-board 언어 대신 ontology relation
map 언어를 사용해, dogfood처럼 project 파일이 하나뿐인 vault도 240개 이상의 개념
그래프로 읽힌다.
