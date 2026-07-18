# Sigma.js v3 — "내장 기능 우선" 플레이북 (topology-map-v2 / Slice 2)

> 모든 API 이름은 `jacomyal/sigma.js` main 브랜치 소스(`packages/sigma/src/*.ts`)와
> 공식 스토리북 예제(`packages/storybook/stories/*`), `packages/website/docs/advanced/*.md`,
> `sim51/react-sigma` 문서에서 직접 확인했다. 버전 드리프트가 의심되는 곳(예: edge 이벤트
> 플래그)은 소스 코드를 최종 근거로 명시했다.

---

## 1. 내장 기능 카탈로그 — 커스텀 코드 대신 이걸 쓴다

### 1.1 nodeReducer / edgeReducer — ego-focus dim 메커니즘의 정답

```ts
sigma.setSetting("nodeReducer", (node, data) => {
  const res = { ...data };
  // ...
  return res;
});
sigma.setSetting("edgeReducer", (edge, data) => { ... });
```

- **그래프를 mutate 하지 않고** 렌더 직전에 노드/엣지 표시 속성을 통째로 다시 계산한다.
  `data.ts` 문서: "developers want to highlight a specific part of the graph, they
  can use reducers... without altering the original graph data."
- reducer 는 **매 프레임 재실행되지 않는다.** 소스(`sigma.ts`)를 보면 reducer는
  `addNode()` 내부에서만 호출되고, `addNode()`는 `updateNode()`에서만 호출된다 —
  즉 reducer가 다시 돌려면 `refresh()` (또는 그래프 mutation에 의한 자동 refresh)가
  필요하다. **reducer 안의 값이 바뀌었는데 refresh를 호출하지 않으면 화면은 갱신되지
  않는다.** state를 참조하는 클로저를 쓰고, state가 바뀔 때마다 명시적으로
  `renderer.refresh({ skipIndexation: true })`를 호출하는 패턴(공식 `use-reducers`
  예제와 동일)이 정답.
- reducer가 리턴할 수 있는 값: `hidden` (boolean), `color` (string, opaque),
  `size`, `label` (`""`로 지우면 라벨 숨김), `forceLabel` (강제 표시), `highlighted`
  (boolean, hover-style 강조), `zIndex` (그리기 순서 — `zIndex` 세팅이 `true`일 때만
  동작. 기본값 `false`).
- **저알파 불변식과 직결**: reducer는 `color`에 opaque 문자열만 넣거나
  `hidden: true`를 리턴하면 된다 — WebGL alpha 합성 버그를 원천적으로 피한다 (§5).

### 1.2 Camera API — 애니메이션 pan/zoom/fit을 직접 구현하지 않는다

소스: `packages/sigma/src/core/camera.ts`, wiki `Camera-API`.

- `camera.animate(targetCoords, { duration })` — 특정 좌표로 애니메이션 이동.
  공식 `use-reducers` 예제가 노드로 카메라를 이동시키는 정확한 패턴:
  ```ts
  const nodePosition = renderer.getNodeDisplayData(nodeId) as Coordinates;
  renderer.getCamera().animate(nodePosition, { duration: 500 });
  ```
  (ratio는 그대로 유지되므로 pan만 일어나고 확대/축소는 없음 — zoom도 원하면
  `{ ...nodePosition, ratio: targetRatio }`를 넘긴다.)
- `camera.animatedZoom(factor | options)` — ratio를 나누는 방식으로 줌인
  (`ratio / factor`, factor 기본은 `DEFAULT_ZOOMING_RATIO`).
- `camera.animatedReset({ duration })` — 초기 카메라 상태로 애니메이션 복귀
  (`7-camera-control` 예제에서 리셋 버튼에 사용).
- `camera.goTo({ x, y, ratio, angle })` — **즉시** 이동(애니메이션 없음).
- `camera.graphPosition(x, y)` / `camera.cameraPosition(x, y)` — 좌표 변환
  (camera space ↔ graph space).
- 카메라 동작 제한 세팅(모두 `Settings`에 존재, 기본값 포함):
  `enableCameraZooming`(기본 `true`), `enableCameraPanning`(기본 `true`),
  `enableCameraRotation`(기본 `true`), `minCameraRatio`/`maxCameraRatio`(기본
  `null`), `cameraPanBoundaries`(기본 `null`).

### 1.3 이벤트 시스템 — 커스텀 hit-testing 금지

소스: `packages/sigma/src/types.ts` — `MouseInteraction = "click" | "doubleClick" |
"rightClick" | "wheel" | "down" | "up" | "leave" | "enter"`. 이 8개가 각각
`${x}Node` / `${x}Edge` / `${x}Stage` 로 동적 생성된다 (`sigma.ts:521` 부근,
`this.emit(\`${eventType}Node\`, ...)`). 따라서 실제로 존재하는 이벤트:

- Node: `clickNode`, `doubleClickNode`, `rightClickNode`, `wheelNode`,
  `downNode`, `upNode`, `enterNode`, `leaveNode`
- Edge: 위와 동일 접미사 `Edge` (단, edge 이벤트는 `enableEdgeEvents: true`
  세팅이 필요 — 기본값 `false`. **주의**: 공식 `advanced/events.md` 문서에는
  `enableEdgeClickEvents` / `enableEdgeWheelEvents` / `enableEdgeHoverEvents`
  세 개로 나뉘어 있다고 적혀 있지만, 현재 main 소스의 `settings.ts`에는 이 세
  플래그가 없고 **`enableEdgeEvents: boolean` 단일 플래그만 존재한다** — 소스가
  최종 근거이며 공식 문서 페이지가 구버전 기준일 가능성이 있다. 구현 시
  `enableEdgeEvents`를 써라.)
- Stage: `clickStage`, `doubleClickStage`, `rightClickStage`, `wheelStage`,
  `downStage`, `upStage`
- 드래그 구현에 필요한 추가 이벤트(문서 목록에는 없지만 소스에 존재, 공식
  `mouse-manipulations` 예제가 사용): **`downNode`**(드래그 시작) →
  **`moveBody`**(포인터 이동, payload에 `event`) → **`upNode`/`upStage`**(드래그
  종료).
- Lifecycle 이벤트: `beforeRender`, `afterRender`, `resize`, `kill` (payload 없음).
- 모든 interaction 이벤트 payload는 `{ event: { x, y, originalEvent }, node? |
  edge? }` 형태.

### 1.4 hideEdgesOnMove / hideLabelsOnMove / label 임계값 — 자체 LOD 로직 금지

소스: `settings.ts` DEFAULT_SETTINGS, `render()` 메서드.

- `hideEdgesOnMove` (기본 `false`) — 카메라가 움직이는 동안(`camera.isAnimated()`
  거나 마우스가 움직이는 중) edge 프로그램 렌더를 건너뛴다. `render()` 소스:
  `if (!this.settings.hideEdgesOnMove || !moving) { ...program.render... }`.
- `hideLabelsOnMove` (기본 `false`) — 움직이는 동안 라벨/엣지라벨/hover 렌더까지
  전부 건너뛴다 (`if (this.settings.hideLabelsOnMove && moving) return exitRender();`).
- `labelRenderedSizeThreshold` (기본 `6`px) — 렌더된 노드 크기가 이 값보다 작으면
  `forceLabel`이 아닌 한 라벨을 그리지 않는다.
- `labelDensity` (기본 `1`) / `labelGridCellSize` (기본 `100`px) — 공간 그리드
  셀당 표시할 라벨 개수를 밀도 기반으로 제한 (`LabelGrid.getLabelsToDisplay`).
- 이 4개 세팅만으로 "확대할수록 라벨이 늘어난다" 는 semantic-zoom-lite 효과를
  거의 공짜로 얻는다 — 커스텀 라벨 컬링 코드를 짜지 않는다.

### 1.5 노드/엣지 프로그램 — state를 색이 아니라 프로그램으로 표현

내장(`sigma/rendering`에서 export):
- Node: `NodeCircleProgram`(기본, 삼각형 두 개로 원), `NodePointProgram`
  (`gl.POINTS` 기반, 가볍지만 반지름 100px 상한).
- Edge: `EdgeRectangleProgram`(기본, 두께 있는 사각형), `EdgeLineProgram`(가장
  빠름, 항상 1px), `EdgeArrowProgram`(합성 프로그램, `EdgeClampedProgram` +
  `EdgeArrowHeadProgram`으로 구성. 각각 `createEdgeArrowProgram` 등 factory로
  화살촉 크기 커스터마이즈 가능).

공식 추가 패키지(별도 npm 패키지, `nodeProgramClasses`/`edgeProgramClasses`에
등록해서 씀):
- `@sigma/node-border` — `NodeBorderProgram`. **테두리로 상태 표현**(색 하나 더
  추가하지 않고 outline으로 "freshness/state" 구분) — 우리 요구 3.2에 정확히
  맞는 내장 도구.
- `@sigma/node-image` — `createNodeImageProgram()` — 원 안에 이미지.
- `@sigma/node-piechart` — `createNodePiechartProgram({ slices, defaultColor })`
  — 노드를 파이차트로 (카테고리 비율 표시에 쓸 수 있으나 우리 요구엔 낮은
  우선순위).
- `@sigma/node-square` — 사각형 노드.
- `@sigma/edge-curve` — `EdgeCurveProgram` — 곡선 엣지(양방향/병렬 엣지 구분에
  유용).
- 레이어 패키지(배경 지도/커스텀 WebGL 오버레이용, 우리 범위 밖):
  `@sigma/layer-leaflet`, `@sigma/layer-maplibre`, `@sigma/layer-webgl`.

각 노드/엣지에는 `type` 속성으로 프로그램을 선택 (`nodeProgramClasses`의 key와
매치). 커스텀 GLSL 프로그램(예: `custom-rendering` 스토리의 `NodeGradientProgram`
— 커스텀 vertex/fragment shader)은 **최후의 수단** — border/image/piechart로 안
되는 경우만.

### 1.6 레이어 시스템 — DOM 오버레이의 올바른 위치

소스: `packages/website/docs/advanced/layers.md`.

- Sigma는 컨테이너 안에 여러 레이어를 절대 위치로 쌓는다 (`sigma-edges`,
  `sigma-nodes`, `sigma-edgeLabels`, `sigma-labels`, `sigma-hovers`,
  `sigma-hoverNodes`, `sigma-mouse` 등 — `mouse` 레이어가 캡처를 담당하므로 항상
  최상단).
- 커스텀 DOM 레이어를 끼워 넣을 때: `container.insertBefore(myLayer,
  container.querySelector(".sigma-hovers"))` — mouse 캡처 레이어 아래, hover
  레이어 바로 앞에 넣어서 상호작용을 막지 않으면서 hover보다는 아래에 그린다
  (공식 `cluster-label` 스토리가 정확히 이 패턴).
- `sigma.createCanvasContext(id, { beforeLayer })` — 커스텀 Canvas 레이어를
  만들 때 쓰는 API. `kill()` 호출 시 자동으로 정리된다.

### 1.7 getNodeDisplayData / 좌표 변환 API — 팝오버 앵커링의 정답

소스: `sigma.ts` (2222~2330 부근), `advanced/coordinate-systems.md`.

- 좌표계 4개: `graph`(원본 좌표) → `framedGraph`(정사각형 정규화) → `viewport`
  (픽셀, Y축 반전) → `clipspace`(WebGL, -1~1).
- `sigma.graphToViewport({ x, y })` — 그래프 좌표 → 화면 픽셀 좌표. **DOM
  팝오버를 노드 옆에 앵커링할 때 이 함수 하나로 충분** (공식 `cluster-label`
  스토리가 정확히 이 방식으로 country label을 그래프 좌표에서 뷰포트 좌표로
  변환해 `style.top/left`에 대입).
- `sigma.viewportToGraph({ x, y })` — 반대 방향. 드래그 구현(§1.3, `moveBody`
  핸들러)에서 마우스 픽셀 좌표를 그래프 좌표로 바꿀 때 사용
  (`mouse-manipulations` 스토리).
- `sigma.getNodeDisplayData(nodeId)` — 현재 프레임에 실제로 렌더링된 노드의
  `{x, y, size, color, ...}` (reducer 적용 후 값)를 반환. 카메라 이동(§1.2)과
  팝오버 위치 계산 모두 이걸 기준으로 한다.
- **팝오버 리포지셔닝 시점**: `sigma.on("afterRender", () => { ... })` — 매
  렌더 후(카메라 이동/줌 포함) 위치를 다시 계산해서 DOM에 반영. `cluster-label`
  예제가 정확히 이 패턴을 쓴다.

### 1.8 refresh / scheduleRefresh / scheduleRender — 수동 재렌더 시맨틱

소스: `advanced/lifecycle.md`, `sigma.ts` `refresh()` 구현.

- `sigma.refresh({ partialGraph?, skipIndexation?, schedule? })`:
  - `partialGraph: { nodes: [...], edges: [...] }` 를 주면 **해당 노드/엣지만**
    reducer 재실행 + 재인덱싱 — 전체 그래프를 다시 훑지 않는다. 생략하면 풀
    리프레시(모든 노드/엣지 재인덱싱).
  - `skipIndexation: true` — 위치/크기가 안 바뀐 경우 label-grid/program
    재인덱싱을 건너뛴다 (reducer로 색/hidden만 바꿀 때 필수 최적화. 공식
    `use-reducers` 예제 주석: "we don't touch the graph data so we can skip
    its reindexation").
  - `schedule: true` — 즉시 동기 렌더 대신 `requestAnimationFrame`으로 미룬다.
- `sigma.scheduleRefresh()` — 다음 프레임에 refresh 예약, 이미 예약되어 있으면
  중복 예약 안 함(디바운스 효과) — reducer가 참조하는 state가 짧은 시간에
  여러 번 바뀔 때 이걸 쓴다.
- `sigma.scheduleRender()` — refresh 없이 렌더만 예약(가장 싸다).
- graphology 그래프 mutation(`addNode`/`dropNode`/`addEdge`/`setNodeAttribute`
  등)은 **Sigma가 자동으로 감지해서 부분 refresh** 한다 (`bindGraphHandlers`,
  `LAYOUT_IMPACTING_FIELDS = {x, y, zIndex, type}`인 속성만 바뀌면 재인덱싱,
  나머지 속성은 `skipIndexation: true`로 처리) — **수동으로 refresh를 호출할
  필요가 있는 유일한 경우는 reducer가 참조하는 외부 state(React state 등)가
  바뀌었을 때뿐**이다.

---

## 2. 공식 예제 매핑

레포: `packages/storybook/stories/` (`1-core-features/*`, `2-advanced-usecases/*`,
`3-additional-packages/*`). Storybook URL: `sigmajs.org/storybook`.

| 우리 요구 | 공식 예제 (경로) | 보여주는 기법 | 그대로 채택할 것 |
|---|---|---|---|
| hover 하이라이트 | `1-core-features/4-use-reducers` | `enterNode`/`leaveNode` → state 갱신 → `nodeReducer`에서 이웃이 아니면 회색 처리 → `renderer.refresh({ skipIndexation: true })` | state 객체 패턴 + refresh 옵션 그대로 |
| 클릭 ego-focus + dim | `1-core-features/4-use-reducers` (동일 파일, `selectedNode`/`suggestions` 분기) | 선택 노드는 `highlighted: true`, 비매치는 `label=""` + 회색, 카메라를 `camera.animate(nodePosition)`으로 이동 | dim 색은 알파 대신 opaque 회색(`#f6f6f6` 예시처럼 토큰화된 값)으로 |
| 노드 드래그 | `2-advanced-usecases/mouse-manipulations` | `downNode`→`highlighted` 플래그 세팅 → `moveBody`에서 `viewportToGraph`로 좌표 변환 후 `setNodeAttribute("x"/"y")` → `upNode`/`upStage`에서 정리. `event.preventSigmaDefault()` + `original.preventDefault()/stopPropagation()`로 카메라 팬 방지 | 이벤트 배선 + `preventSigmaDefault` 호출까지 그대로 |
| 애니메이션 카메라 전환 | `1-core-features/4-use-reducers` (검색→포커스 이동), `1-core-features/7-camera-control` (`animatedReset`) | `camera.animate(coords, { duration })`, `camera.animatedReset({ duration })` | duration 값과 "ratio 유지 = pan만" 동작 |
| 커스텀 노드 렌더링(테두리로 상태) | `1-core-features/5-custom-rendering`, `3-additional-packages/node-border` | `nodeProgramClasses`에 `NodeBorderProgram`(또는 image/gradient) 등록, 노드 `type` 속성으로 선택 | `node-border` 패키지를 상태 배지 용도로 직접 채택 |
| 클러스터 라벨 / DOM 오버레이 앵커링 | `2-advanced-usecases/cluster-label` | `graphToViewport`로 좌표 변환 → `container.insertBefore(layer, container.querySelector(".sigma-hovers"))` → `afterRender`마다 위치 갱신 | **이 패턴이 우리 "타입별 카운트 팝오버 1개" 구현의 정답**, 그대로 이식 |
| 대규모 그래프 성능 | `2-advanced-usecases/large-graphs` | `graphology-generators` + `circlepack` 사전 배치 → `FA2Layout`(worker) 토글 → `EdgeLineProgram`("edges-fast") vs `EdgeRectangleProgram`("edges-default") 선택 가능하게 노출 → 카메라 `angle: 0.2` 틸트로 라벨 가독성 확보 | 5000 노드/1000 edge 규모에서 edge program 선택을 옵션으로 노출하는 아이디어 |
| 레이아웃 계산 | `1-core-features/3-layouts` | `forceAtlas2.inferSettings(graph)` + `FA2Layout` worker로 start/stop 토글, 또는 `animateNodes(graph, positions, { duration })`로 랜덤/circular 레이아웃 간 부드러운 전환 | `animateNodes` 유틸을 레이아웃 전환 애니메이션에 채택 |
| 이벤트 전수 배선 | `1-core-features/2-events` | 8종 MouseInteraction × node/edge/stage 전부 로깅, `enableEdgeEvents: true`로 edge 이벤트 활성화 | 이벤트 이름 목록의 근거 소스로 사용 |
| 사이즈/포지션 커스터마이징 | `2-advanced-usecases/fit-sizes-to-positions` | `zoomToSizeRatioFunction`, `itemSizesReference`, `autoRescale` 세팅 실습 | 참고만, 기본값(zoom과 함께 스케일)이 우리 요구에 맞음 |

---

## 3. 성능 계약

### 무엇이 느려지는가 (소스 근거)

1. **풀 그래프 mutation** — `refresh()`를 `partialGraph` 없이 호출하면 모든
   노드/엣지를 다시 인덱싱(`clearEdgeIndices/clearNodeIndices` +
   `forEachNode(addNode)` 전체) — O(전체 그래프). 부분 변경은 항상
   `partialGraph: { nodes, edges }`로 좁힌다.
2. **reducer 자체의 계산 비용** — reducer는 표시되는 모든 노드/엣지에 대해 매
   refresh마다 실행된다. reducer 안에서 무거운 계산(예: 매번 이웃 집합
   재계산)을 하지 말고, state 변경 시점(hover/click 핸들러)에서 미리
   `Set`/`Map`을 만들어 reducer는 O(1) lookup만 하게 한다 (공식 예제 패턴 —
   `hoveredNeighbors`를 `setHoveredNode()`에서 미리 계산).
3. **인덱싱(`skipIndexation`) 불필요 재실행** — 위치/크기/타입이 안 바뀐
   변경(색·hidden만 변경)에 `skipIndexation: true`를 안 주면 label-grid를
   불필요하게 다시 만든다.
4. **라벨 렌더링** — `renderLabels()`는 grid 기반이라 상대적으로 싸지만,
   `hideLabelsOnMove`를 안 켜면 드래그/줌 중에도 계속 라벨을 다시 그린다 —
   이동 중 프레임 드랍의 흔한 원인.
5. **재인스턴스화** — `new Sigma(...)`를 매 렌더(React re-render)마다 새로
   만들면 WebGL 컨텍스트를 계속 새로 만들고 버리는 셈 — 브라우저가 동시
   WebGL 컨텍스트 수를 제한하므로(보통 8~16개) 반복하면 컨텍스트 고갈로 렌더
   실패. **Sigma 인스턴스는 마운트 시 1회 생성, `kill()`은 언마운트 시 1회만.**

### 올바른 React 통합 패턴

- 생태계 권장 패턴은 `@react-sigma/core`(`sim51/react-sigma`, Sigma v3 대상,
  storybook 문서화됨)의 `SigmaContainer` + hooks 조합:
  - `<SigmaContainer settings={...}>` 가 내부에서 `new Sigma()`를 1회 생성해
    React context로 공급.
  - `useLoadGraph()` — graphology 인스턴스를 로드(child effect에서 1회).
  - `useRegisterEvents({ clickNode, enterNode, ... })` — 이벤트 등록/해제를
    React lifecycle에 맞춰 관리(직접 `sigma.on/off`를 매 렌더 재바인딩하는
    실수를 막아줌).
  - `useSetSettings()` — `nodeReducer`/`edgeReducer`/`hideEdgesOnMove` 등을
    React state 변화에 따라 갱신. 공식 예제 패턴: state(`selectedNode`)가
    바뀔 때 `useEffect`에서 `setSettings({ nodeReducer, edgeReducer })`를
    다시 세팅 — reducer 클로저 안에 최신 state가 캡처되도록.
  - `useCamera({ duration })` → `{ zoomIn, zoomOut, reset, goto, gotoNode }`.
- **직접 `useRef` + 수동 `new Sigma()` 관리**도 유효한 대안(라이브러리
  래퍼 없이)이지만, 이벤트 재등록/해제, StrictMode 이중 마운트(§6) 케어를
  직접 해야 한다. `@react-sigma/core`를 쓰면 이 배선을 안 만들어도 된다 —
  **11,102줄 커스텀 DOM 카드 레이어 대신 이 라이브러리가 이미 해결한 문제**.
- **Next.js/SSR**: Sigma는 `window`에 의존하므로 서버 렌더 불가.
  `sim51/react-sigma` 공식 FAQ 해법: `dynamic(() => import(...), { ssr: false
  })`로 `SigmaContainer`와 그래프 로딩 컴포넌트를 감싼다. 본 레포는 이미
  `output: 'export'` 정적 export이므로 이 패턴을 클라이언트 전용 컴포넌트
  경계에 그대로 적용하면 된다.

### 레이아웃 사전 계산/캐시

- `graphology-layout-forceatlas2`:
  - 동기: `forceAtlas2(graph, { iterations, settings })` → 위치 맵 반환, 또는
    `forceAtlas2.assign(graph, { iterations, settings })`로 그래프에 바로 기록.
  - 설정 자동 추론: `forceAtlas2.inferSettings(graph)`.
  - **사전조건**: 모든 노드에 `x`/`y`가 있어야 하고, 전부 원점(0,0)이면 계산이
    안 된다 — 먼저 `graphology-layout`의 `random.assign(graph)`(또는
    `circular`)로 초기 좌표를 준다.
  - 비동기(Web Worker): `new FA2Layout(graph, { settings })` →
    `.start()`/`.stop()`/`.isRunning()`/`.kill()`. 메인 스레드를 안 막고 UI가
    계속 반응하게 하려면 이 worker 버전을 쓴다 (`large-graphs`,
    `3-layouts` 예제 모두 이 방식).
  - **seed 고정**: `large-graphs` 예제처럼 `seedrandom("sigma")`로 rng를
    고정하면 매 로드마다 같은 레이아웃 재현 가능(우리 vault 그래프처럼
    "이전 세션과 같은 배치"를 원하면 seed + 캐시된 좌표를 vault 메타데이터나
    IndexedDB에 저장하는 방식 고려).
- **연속 애니메이션은 카메라 구동, per-frame JS 금지**: 카메라
  이동/줌(§1.2)은 Sigma 내부적으로 `requestAnimationFrame` 기반 easing으로
  처리된다 — 우리가 `setInterval`/수동 rAF로 카메라 좌표를 흔들 필요가 없다.
  노드 위치를 부드럽게 바꾸고 싶을 때(레이아웃 전환)는 `animateNodes(graph,
  targetPositions, { duration, easing })`(from `"sigma/utils"`) 유틸을 쓴다 —
  내부에서 시작 위치를 캡처하고 easing 함수로 각 프레임의 좌표를 그래프에
  기록해준다. 리턴값은 취소 함수(`cancelCurrentAnimation`).

---

## 4. 우리 커스텀 최소 목록

PRODUCT-PLAN §9 / TOPOLOGY-FOCUS-AND-SCALE 요구를 내장 기능(§1)에 최대한
위임한 뒤 남는, 실제로 직접 짜야 하는 것:

1. **freshness/state 배지 — `@sigma/node-border`로 구현, 색 추가 아님.**
   `NodeBorderProgram`을 `nodeProgramClasses: { border: NodeBorderProgram }`로
   등록하고 노드 `type: "border"` + `borderColor` 속성만 우리가 계산해서
   채운다. GLSL을 직접 짤 필요 없음 — "무엇을 커스텀했는가"는 borderColor
   매핑 로직(비즈니스 규칙)뿐이다.
2. **타입별 카운트 팝오버 1개 — DOM 오버레이, `cluster-label` 패턴 그대로
   이식.** React 쪽에서 `useSigma()`로 인스턴스를 얻고, 팝오버 위치는
   `sigma.graphToViewport(nodePosition)` + `afterRender` 이벤트 구독으로
   계속 갱신. **레이어는 하나, 노드는 하나(ego 포커스 대상)** — 여러 개
   동시에 띄우지 않는다(design.md의 "stacked floating panels 금지"와 일치).
   Sigma 자체 hover/label 렌더러를 흉내내지 않고 순수 React 컴포넌트로 얹는다.
3. **semantic-zoom expand/collapse — graphology `addNode`/`dropNode` +
   reducer state, Sigma 인스턴스 재생성 금지.** level 0(project + domain +
   hub)만 그래프에 넣어두고, 클릭 시 자식 노드/엣지를 `graph.addNode`/
   `graph.addEdge`로 추가(Sigma가 자동으로 부분 refresh — §1.8). collapse는
   `graph.dropNode`. **Sigma는 그대로 살려두고 graphology 그래프만 mutate** —
   `new Sigma()` 재호출은 WebGL 컨텍스트 낭비이자 카메라/줌 상태 손실.
4. **ego-focus dim 판정 로직(누가 이웃인가) — 순수 JS, reducer 밖에서 미리
   계산.** `graph.neighbors(selectedNode)`로 이웃 집합을 만들고, reducer는
   그 Set을 참조만 한다(§3의 성능 규칙). 이 "이웃 판정 + state 객체" 자체는
   Sigma가 제공하지 않으므로 우리가 짜야 하지만, 스토리북 `use-reducers`
   예제의 `state.hoveredNeighbors` 패턴을 그대로 따르면 된다.
5. **레이아웃 좌표 캐시/재현성 — vault 메타데이터에 저장.** graphology-layout
   자체는 캐시하지 않으므로, seed 고정 + 계산된 좌표를 로컬(vault나
   IndexedDB)에 저장해 재방문 시 동일 배치를 복원하는 얇은 레이어는 직접
   구현해야 한다. (로컬-퍼스트 원칙과도 일치 — 서버 캐시 아님.)

**하지 않는 것 (내장으로 충분)**: DOM 카드 레이어 38-useEffect 오케스트레이션,
수동 hit-testing/hover 판정, 수동 좌표 변환 수식, 수동 라벨 컬링, 수동 카메라
easing, `setInterval` 기반 애니메이션 루프.

---

## 5. 저알파 불변식 적용 — reducer 레벨 계약

owner 머신에서 저알파 색이 WebGL에서 불투명하게 합성되는 결함이 확인되어 있다
(`webgl-alpha-defect` 메모). reducer가 이 불변식을 지키는 방법, 소스로 확인된
지원 범위:

- **`hidden: true`** — `NodeDisplayData`/`EdgeDisplayData`의 공식 필드
  (`data.md`: "A boolean attribute. If set to `true`, the node/edge will not
  be displayed."). dim = 숨김이면 이걸 쓴다. 알파 걱정 자체가 없어진다.
- **`color`에 opaque 문자열만** — reducer가 리턴하는 `color`는 hex/CSS
  named color 문자열이며 alpha 채널을 갖는 `rgba()`를 강제하지 않는다.
  "dim" 톤은 디자인 토큰에서 **불투명 회색 hex** (예: 다크/라이트 각각의
  `--color-*-dim` 같은 opaque 토큰)로 만들고 `rgba(..., 0.15)` 같은 알파
  값을 reducer에 절대 넣지 않는다.
- **`zIndex`** — `zIndex: true` 세팅이 켜져 있을 때만 노드/엣지 그리기
  순서에 반영(edge는 node 위로 절대 못 감). dim된 노드를 뒤로 보내고
  싶으면 `zIndex` 세팅을 켜고 reducer에서 낮은 값을 리턴한다 — 알파와
  무관하게 "덜 두드러지게" 보이는 두 번째 수단.
  - `zIndex` 기본값은 `false` — 명시적으로 켜야 동작.
- **`size` 축소**도 알파 없이 "덜 중요해 보이게" 만드는 보조 수단(0으로
  주면 사실상 안 보임, 다만 `hidden: true`가 더 명확).

정리: **dim = `hidden: true` 또는 opaque color 토큰 + 선택적 `zIndex`/`size`
축소**. `rgba()`/알파 채널 기반 dim은 reducer 어디에도 넣지 않는다 — 이건
Sigma API 제약이 아니라 owner 머신의 WebGL 합성 결함을 피하기 위한 우리
쪽 규칙이므로, 코드 리뷰에서 opaque 여부를 체크리스트로 명시해야 한다.

---

## 6. 함정 목록

1. **reducer 안에서 state를 참조하는데 refresh를 안 부름** — 가장 흔한
   "클릭했는데 화면이 안 바뀜" 버그. reducer는 `refresh()`/그래프 mutation
   트리거가 있어야 재실행된다(§1.1, §1.8). React에서는 `useSetSettings()`로
   의존성 배열에 관련 state를 넣어 effect마다 `setSettings({ nodeReducer })`
   를 다시 호출하는 방식으로 우회(공식 `useSetSettings` 예제 패턴).
2. **풀 refresh 남발로 인한 전체 재인덱싱 비용** — `partialGraph` 없이
   `refresh()`를 호출하면 전체 노드/엣지 재인덱싱(§3-1). hover/click 처럼
   자주 도는 경로는 반드시 `skipIndexation: true` + 필요시 `partialGraph`.
3. **이벤트 핸들러 재등록 누수** — `sigma.on(...)`을 매 렌더마다(예: 함수형
   컴포넌트 바디에서 조건 없이) 호출하면 리스너가 계속 누적된다. React
   래퍼(`useRegisterEvents`)를 쓰거나, 수동 관리 시 `useEffect` cleanup에서
   반드시 `sigma.off(...)` 대칭 호출(또는 `kill()`).
4. **`kill()` 누락으로 인한 메모리 누수** — `kill()`은 WebGL 컨텍스트,
   캔버스 DOM, 리스너, 캐시를 전부 해제한다(§1 소스 확인). 언마운트 시
   반드시 호출 — React StrictMode의 이중 마운트(개발 모드에서 mount →
   unmount → mount)를 고려하면 **"인스턴스 생성은 멱등, kill은 항상 대칭
   호출"** 원칙이 중요 — effect cleanup에서 kill을 안 하면 개발 모드에서
   2개의 WebGL 컨텍스트가 살아남는다.
5. **React StrictMode 이중 마운트로 인한 중복 Sigma 인스턴스** — 개발
   모드에서 effect가 mount→cleanup→mount 순으로 두 번 돈다. `useRef`로
   인스턴스를 감싸고 "이미 인스턴스가 있으면 kill 후 재생성" 가드를
   넣거나, `@react-sigma/core`의 `SigmaContainer`(이미 이 문제를 해결해
   배포됨)를 쓴다.
6. **좌표계 혼동** — `graph` / `framedGraph` / `viewport` / `clipspace` 4개가
   따로 있다(§1.7). `getNodeDisplayData()`가 반환하는 좌표는 이미
   `framedGraph` 좌표(카메라 적용 전, reducer 반영 후)이지 raw graph 좌표가
   아니다 — 카메라 이동엔 그대로 쓸 수 있지만(`camera.animate`), DOM
   오버레이 위치엔 반드시 `graphToViewport()`를 한 번 더 거쳐야 한다.
   `viewportToGraph`(드래그)와 `graphToViewport`(팝오버) 방향을 헷갈리지
   않는다.
7. **WebGL 컨텍스트 고갈** — 브라우저는 동시 WebGL 컨텍스트 수에 제한이
   있다(보통 8~16, 브라우저별 상이). Sigma 인스턴스 하나당 내부적으로
   여러 WebGL 컨텍스트(edges/nodes/hoverNodes)를 만든다(§1 constructor
   소스) — 여러 그래프 뷰를 화면에 동시에 띄우거나 인스턴스를 계속
   재생성하면 어느 시점부터 렌더가 실패한다. **인스턴스는 뷰당 1개,
   재사용.**
8. **`enableEdgeEvents` 끄져 있으면 edge 이벤트가 전혀 안 옴** — 기본값
   `false`. 엣지 hover/click이 필요하면 명시적으로 켜야 하고, 이 자체가
   picking(엣지 hit-test용 두 번째 렌더 패스)을 추가하므로 필요한 화면에서만
   켠다(불필요하게 전역으로 켜면 픽킹 렌더 비용이 상시로 붙는다).
9. **`autoRescale`/`itemSizesReference` 기본값을 모르고 크기가 "이상하게"
   보임** — 기본은 zoom과 함께 `Math.sqrt(ratio)`로 스케일되고, 그래프는
   항상 리스케일되어 뷰포트에 맞춰진다(§1, `sizes.md`). 절대 좌표계로 그리고
   싶다면(예: 지리 좌표) `autoRescale: false` + `itemSizesReference:
   "positions"`를 함께 세팅해야 의도한 대로 동작 — 하나만 바꾸면 어긋난다.
10. **`zIndex` 세팅을 안 켜고 노드 zIndex 속성만 줌** — `zIndex: true`
    세팅이 꺼져 있으면(기본값) 노드/엣지의 `zIndex` 속성은 조용히 무시된다.
    §5의 dim 계약에서 `zIndex`를 보조 수단으로 쓰려면 이 세팅부터 켠다.

---

## 참고 소스 (전부 이번 조사에서 직접 확인)

- `github.com/jacomyal/sigma.js` main 브랜치: `packages/sigma/src/sigma.ts`,
  `settings.ts`, `types.ts`, `core/camera.ts`, `utils/animate.ts`
- `packages/website/docs/advanced/{data,events,layers,lifecycle,customization,
  renderers,sizes,coordinate-systems}.md`
- `packages/storybook/stories/1-core-features/{2-events,3-layouts,
  4-use-reducers,5-custom-rendering,7-camera-control}`,
  `2-advanced-usecases/{mouse-manipulations,large-graphs,cluster-label}`
- `github.com/sim51/react-sigma` (`@react-sigma/core` — Sigma v3 대상) docs:
  `SigmaContainer`, `useLoadGraph`, `useRegisterEvents`, `useSetSettings`,
  `useCamera`, Next.js FAQ (dynamic import, ssr:false)
- `graphology/graphology`: `layout-forceatlas2` (`inferSettings`, `assign`,
  worker 버전), `layout`(`random.assign`)
