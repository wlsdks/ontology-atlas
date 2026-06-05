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

기본 전체 지도에서도 ontology edge 는 전경 선이 아니라 배경 증거선으로 다룬다.
dark/light palette 의 기본 edge alpha 를 낮게 유지하고, degree 기반 두께 보정은
ontology edge 에 별도 상한을 둔다. 240개 이상 관계를 가진 dense vault 에서는
fit-to-view 수준의 기본 overview 부터 project / domain / landmark 골격만 남기고,
element 가 낀 spoke 와 domain→leaf fan-out 은 zoom / hover / focus / path reducer
전까지 숨긴다. 그래서 `docs/ontology` 처럼 500개 안팎의 관계를 가진 vault 도 첫
화면에서 하얀 실뭉치가 아니라 노드 구조가 먼저 읽히고, 사용자가 의도적으로
가까이 들어갈 때 필요한 관계만 전경으로 올라온다.
저장된 카메라 상태가 중간 줌으로 복원돼도 기본 지도는 여전히 overview 로 취급해
전체 relation web 을 되살리지 않는다. 관계선을 모두 보는 것은 사용자가 충분히
확대했거나 hover / focus / path 로 명확한 조사 의도를 보인 뒤의 상태다.
Sigma 는 이 dense overview edge reducer 와 같은 기준으로 현재 대표 관계 수를
계산해 HomePage 에 올린다. 분석 바는 이 값을 `visible/total` 로 표시하므로,
사용자는 관계가 사라진 것이 아니라 기본 지도에서 일부러 축약된 상태라는 점을
즉시 알 수 있다.

선택 / hover 라벨은 `SigmaFocusLabel` DOM overlay 로 그리되, 노드가 화면
오른쪽이나 아래쪽 가장자리에 가까우면 라벨을 viewport 안쪽으로 clamp 하고 반대편에
붙인다. 라벨 capsule 은 불투명 배경과 제한 폭 / truncation 을 가져, relation line
위에 떠 있어도 텍스트가 선에 파묻히지 않는다.

`/topology`의 첫 viewport도 이제 Sigma graph가 실제로 그리는 ontology node /
edge 수를 concept / relation metric으로 말한다. 왼쪽 collapsed hero, 분석 바,
screen-reader `application` label이 모두 project-board 언어 대신 ontology relation
map 언어를 사용해, dogfood처럼 project 파일이 하나뿐인 vault도 240개 이상의 개념
그래프로 읽힌다.
