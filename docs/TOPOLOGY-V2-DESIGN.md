# TOPOLOGY-V2 DESIGN — 표현 아키텍처 설계 (Phase 1)

> 입력: `docs/prototypes/topology-b2plus.html`(승인된 B2+ "Circuit × Constellation"
> 프로토타입) · `docs/TOPOLOGY-V2-PHASE0.md`(실측 병목 + 어댑터 계약 초안) ·
> `docs/SIGMA-PLAYBOOK.md`(Sigma v3 내장 기능 계약) · `docs/INTERACTION-DESIGN.md`
> (유체 인터페이스 원칙) · `.claude/rules/design.md` · `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`
> (Design Gate · Graph Engine Fit Gate · Attention Layer Model · State Contract ·
> 14인치 규칙) · design-guardian 지형도 verdict(layer (b) 항목).
>
> 비주얼 언어는 **확정**(owner 승인, B2+). 이 문서는 그 언어를 실제 코드로
> 옮기는 **표현 아키텍처**만 결정한다 — 새 비주얼 안을 제안하지 않는다.

## 0. Design Gate — compact pass

```md
PO: 관찰된 현상은 [Phase 0 실측] — 지도(TopologyMapCanvas, DOM/CSS)와 그래프
(SigmaTopology, WebGL) 두 엔진이 같은 vault 를 서로 다른 코드로 그리고, 그 중
하나(Sigma)는 38-effect·11k줄 죽은 코드(SigmaSkeletonCards)를 낀 채 클릭 시
194ms + 강제 리플로우 73ms 를 낸다. B2+ 승인으로 "무엇을 그릴지"는 끝났지만
"어떻게 그릴지"가 없으면 구현이 시작될 수 없다. Verdict: Shape a design slice
(Slice 2 P2~P6 아래).
Interaction Designer: 클릭 이후 상태가 지도/그래프 엔진마다 다르게 반응한다
(포커스 방식, 팝오버 앵커링, dim 규칙이 두 코드베이스에 따로 존재) — 하나의
캔버스에 하나의 상태 기계가 필요하다.
Information Designer: kind 위계(project⊃domain⊃capability⊃element)와
freshness(fresh/stale/hub)는 B2+ 프로토타입에서 이미 형태+보더+각인 숫자로
인코딩되어 있다 — 이걸 실제 vault 데이터에 연결하는 어댑터가 없을 뿐이다.
macOS Workbench Designer: 14인치 뷰포트에서 팝오버 1개·유틸리티 칩 2개(고도계
+ 힌트) 외 아무 것도 겹치면 안 된다 — B2+ 는 이미 "패널 없음"을 전제로
설계됐다(§5).
Design Systems Engineer: 프로토타입의 모든 색/치수/지속시간은 하드코딩 JS
상수다 — `--topology-v2-*` 토큰화 없이는 재현 불가능한 "감"으로 남는다(§2).
Agent Handoff Designer: 현재 팝오버(tip)엔 MCP/CLI 다음 행동이 없다 — 타입드
팩트(허브/신선도/카운트)는 있지만 "그래서 에이전트가 뭘 하나"가 빠졌다. P4 에서
반드시 추가.
Design verdict: Shape a design slice → 본 문서가 그 slice 의 아키텍처.
```

## 1. 엔진 선택 (핵심 결정)

### 1.1 Graph Engine Fit Pass (PRODUCT-DESIGN-OPERATING-SYSTEM.md 양식)

```md
Graph engine fit pass
- User moment: overview scan(성도) → click focus(회로 다이브) → relation
  inspect(팝오버) — B2+ 는 이 세 모먼트를 하나의 continuous zoom 으로 합친다.
- Current stack: TopologyMapCanvas(단일 컨테이너 CSS transform, 538줄+79줄
  camera.ts) 지도 탭 / SigmaTopology(WebGL, 3833줄 38-effect) 그래프 탭 +
  topology-map-sigma/lib 아래 30여 개 보조 모듈.
- Observed failure: Phase 0 실측 — Sigma 클릭 시 강제 리플로우 73ms(라이브러리
  자신의 resize() 내부, 우리 코드 아님) + 초기 로드 1412ms(지도 대비 2배).
  이건 "우리가 고칠 수 있는 병목"이 아니라 WebGL 엔진 자체의 구조 비용이다.
- Missing capability: B2+ 는 헥스 플레이트/사각 칩/via 패드 같은 **kind별
  고유 다각형**, corner-radius 를 zoom 에 따라 원으로 수렴시키는 **형태
  모핑**, **각인(음각) 숫자 텍스트**, **4-point diffraction spike**, 별먼지
  텍스처를 요구한다. Sigma 내장 노드 프로그램(`NodeCircleProgram`/
  `NodePointProgram`) 과 공식 확장 패키지(`@sigma/node-border`/`node-image`/
  `node-piechart`/`node-square`)로는 이 형태 집합을 만들 수 없다 —
  SIGMA-PLAYBOOK §1.5 가 명시한 "커스텀 GLSL 프로그램은 최후의 수단" 범위로
  넘어간다.
- Can current stack solve it? 아니오 — nodeReducer/edgeReducer/camera API/
  라벨 LOD 세팅(§1.1~1.4)은 색·크기·hidden·라벨 밀도만 조정한다. 다각형
  기하·각인 텍스트·회절 스파이크는 셰이더 레벨 커스텀 프로그램을 새로
  작성해야 하며(vertex/fragment GLSL, VAO/VBO 관리, clipspace 좌표 변환),
  이는 설정 튜닝이 아니라 서브시스템 교체다.
- Candidate alternative: (1) Sigma 위에 커스텀 GLSL 프로그램 5종 신설
  (hex/square/via/spike/engraved-text) (2) TopologyMapCanvas(DOM/CSS)를
  확장해 SVG/CSS 로 도형 근사 (3) 프로토타입과 동일한 **전용 canvas-2D
  렌더러** 신설.
- Tradeoff:
  - (1) Sigma+GLSL: WebGL 의 대규모(5k+) 처리량 이점은 있으나, semantic
    zoom 이 이미 노출 노드를 ~40~120개로 캡(overview-first 계약, §4)하므로
    이 이점이 무의미하다. GLSL 셰이더 5종 + StrictMode 이중 마운트 +
    WebGL 컨텍스트 고갈(브라우저당 8~16개, §6 함정7) + 38-effect 캐스케이드
    유산까지 솔로 개발자가 계속 떠안는다. 프로토타입의 `roundedPolygonPath`/
    `drawEngraved`/`drawSpike` 를 셰이더로 재작성하는 비용이 원본 대비
    수 배.
  - (2) DOM/CSS 확장: TopologyMapCanvas 의 "per-frame DOM 쓰기 0" 계약(카메라는
    컨테이너 transform 1건)은 살릴 수 있으나, 각인 텍스트 그림자·회절
    스파이크·별먼지 같은 서브픽셀 도형은 CSS/SVG 조합으로 만들면 DOM 노드
    수가 kind 별 형태마다 증가해 정확히 Phase 0 가 지적한 "DOM churn"
    문제를 재도입한다.
  - (3) 전용 canvas-2D: 프로토타입이 **이미 이 경로로 완성돼 있다** —
    `roundedPolygonPath`/`hexPoints`/`squarePoints`/`drawEngraved`/
    `drawSpike` 전부 순수 Canvas 2D API(`ctx.arc`/`quadraticCurveTo`/
    `createLinearGradient`)로 40 노드 규모에서 이미 60fps 급으로 동작 확인.
    즉시-모드 렌더링이라 React reconciliation·WebGL 컨텍스트·셰이더 컴파일
    비용이 전부 없다. 유지보수 표면 = 순수 함수 모듈(shapes/edges/camera) +
    단일 `<canvas>` 컴포넌트 — Sigma 경로의 셰이더+38-effect 유산보다
    훨씬 작다.
- Decision: **(3) 전용 canvas-2D 렌더러로 서브시스템 교체.** 이미 프로토타입
  스파이크로 "필요한 능력을 증명"하는 조건(Fit Gate "Spike an alternative
  only when the current stack cannot prove a needed capability after one
  narrow experiment")을 충족했다 — B2+ 프로토타입 자체가 그 narrow
  experiment였다. 이건 "더 매끈해 보여서" 하는 렌더러 쇼핑이 아니라, owner
  가 이미 승인한 비주얼 언어가 요구하는 형태 집합을 구조적으로 검증한
  결과다.
- Proof: P5 에서 1920/2560/14인치/compact 스크린샷 + Phase 0 시나리오
  a/a′/b/b′/c 프로덕션 빌드 재측정 + Design Guardian verdict + 설치된 앱
  증거(§5).
```

### 1.2 두 개의 살아있는 뷰를 하나로 — 명시적 unify 권고

Phase 0 §1 이 확인한 3개 렌더 경로(지도 탭 `TopologyMapCanvas`, 그래프 탭
`SigmaTopology`, 프로젝트 상세 이웃 지도 `SigmaTopology minimal`)는 오너의
"모드 증식 혐오"([[owner-topology-taste]]) 관점에서 이미 문제다 — 같은 vault
를 세 가지 코드가 그린다. B2+ 의 continuous smoothstep 전환(circuit ↔
constellation, 모드 플립 없음)은 애초에 "지도 대 그래프"라는 이분법을
렌더링 레벨에서 무의미하게 만드는 설계다: 확대하면 회로(그래프에 가까운
디테일), 축소하면 성도(지도에 가까운 개요) — **하나의 카메라 축이 두 옛
모드를 흡수한다.**

**결정: v2 는 하나의 렌더 엔진(`TopologyMapV2`)으로 통합한다.** 지도 탭·
그래프 탭·프로젝트 상세 이웃 지도 세 호출부 전부 같은 컴포넌트를
`TopologyMapV2Props`(Phase 0 §4.2, 아래 §4 에서 갱신)로 호출한다. `minimal`
prop 은 그대로 유지(임베드 축소 모드).

**Phase 1 범위 밖으로 명시적으로 남기는 것**: "지도/그래프 **탭 UI** 자체를
없앨지"는 렌더링 엔진 통합과 별개의 IA(정보구조) 결정이며, B2+ 가 두 모드의
시각 차이를 이미 흡수하는 이상 탭 자체가 군더더기가 될 가능성이 높다 — 그러나
이건 이 표현 아키텍처 문서가 답할 질문이 아니라 별도 PO 패스가 필요한 제품
결정이다(§6 열린 질문 참조). Phase 1 은 **엔진만** 통합하고, 탭 UI 존치
여부는 P6 완료 후 재검토한다.

### 1.3 결정 요약

| 후보 | 판정 | 근거 |
|---|---|---|
| Sigma WebGL + 커스텀 노드/엣지 프로그램 | **기각** | GLSL 셰이더 5종 신설 필요(서브시스템 교체 수준), semantic-zoom 캡(~40-120)에서 WebGL 처리량 이점 무의미, 38-effect·컨텍스트 고갈 유산 계승 |
| TopologyMapCanvas(DOM/CSS) 확장 | **기각** | 각인 텍스트·회절 스파이크·별먼지 같은 서브픽셀 도형에서 DOM 노드 수 증가 → Phase 0 가 지적한 DOM churn 재도입 |
| **전용 canvas-2D 렌더러** (프로토타입 그대로 포팅) | **채택** | 프로토타입이 이미 스파이크 증거, 즉시-모드라 React/WebGL 오버헤드 0, 유지보수 표면이 순수 함수 모듈로 국한, semantic-zoom 캡 규모에 적합 |

TopologyMapCanvas 의 **개념**(단일 카메라 상태 `{tx,ty,k}`, 순수 함수
`fitBounds`/`zoomAt`/`panBy`, per-frame DOM 쓰기 0)은 승계한다 — 실제로
`src/widgets/topology-map-canvas/lib/camera.ts` 의 네 함수를 **그대로 import**
해서 쓴다(중복 구현 금지). 여기에 프로토타입의 스프링/모멘텀 적분기를
얹는다(§4 P2). Sigma/Graphology 는 topology-map-v2 범위에서 제거되지만, 이
결정은 "Sigma 를 영원히 안 쓴다"가 아니라 "B2+ 표현엔 맞지 않는다"는 국소
판단이다 — Graph Engine Fit Gate 문서 갱신은 v2 출하 후(P6) 별도 커밋으로.

## 2. B2+ 언어의 토큰화

새 토큰 패밀리 `--topology-v2-*` 를 신설한다(기존 657개 토큰과 분리 —
Design Guardian verdict 가 지적한 토큰 과잉 통폐합 대상에 새 부채를 얹지
않기 위해, P6 삭제 시 `--topology-v2-` 접두어만 grep 하면 신구 교체
범위가 명확해진다). 값은 프로토타입 JS 상수에서 1:1 추출.

### 2.1 노드 표면 (kind별 fill/stroke tier)

| 토큰 | 값 | 프로토타입 출처 |
|---|---|---|
| `--topology-v2-node-fill-project` | `#1c1c22` | `COL.fillTier.project` |
| `--topology-v2-node-fill-domain` | `#191920` | `COL.fillTier.domain` |
| `--topology-v2-node-fill-capability` | `#17171d` | `COL.fillTier.capability` |
| `--topology-v2-node-fill-element` | `#15151a` | `COL.fillTier.element` |
| `--topology-v2-node-stroke-project` | `#57575f` | `COL.strokeTier.project` |
| `--topology-v2-node-stroke-domain` | `#48484f` | `COL.strokeTier.domain` |
| `--topology-v2-node-stroke-capability` | `#3c3c44` | `COL.strokeTier.capability` |
| `--topology-v2-node-stroke-element` | `#34343b` | `COL.strokeTier.element` |
| `--topology-v2-node-fill-dim` | `#1a1a1e` | `COL.dimFill` |
| `--topology-v2-node-stroke-dim` | `#2b2b2f` | `COL.dimStroke` |
| `--topology-v2-node-fill-stale` | `#141418` | `COL.staleFill` |
| `--topology-v2-node-stroke-stale` | `#454549` | `COL.staleStroke` |
| `--topology-v2-node-hole-fill` | `#0c0c10` | `COL.holeFill`(via 드릴 홀) |
| `--topology-v2-indigo` | `#5e6ad2` | 기존 `--color-indigo`/헌장 인디고 재사용(신규 아님) |
| `--topology-v2-indigo-bright` | `#8890e0` | `COL.indigoBright`(포커스 중심/신선 강조) |
| `--topology-v2-amber-hub` | `#d4b478` | `COL.amber`(허브 전용, 헌장 예외 허용 톤 재사용) |
| `--topology-v2-numeral-shadow` | `#08080a` | `COL.numeralShadow`(음각 그림자) |
| `--topology-v2-numeral-face` | `#8c8c94` | `COL.numeralFace` |

### 2.2 엣지 · 라벨 · 배경

| 토큰 | 값 | 출처 |
|---|---|---|
| `--topology-v2-edge-contains` | `#28282e` | `COL.edgeContains` |
| `--topology-v2-edge-depends` | `#39394a` | `COL.edgeDepends` |
| `--topology-v2-edge-dim` | `#1e1e22` | `COL.dimEdge` |
| `--topology-v2-hull-stroke` | `#3a3a42` | `COL.hull`(도메인 성단 경계) |
| `--topology-v2-label-domain` | `#b8b8c1` | `COL.labelDomain` |
| `--topology-v2-label-capability` | `#84848c` | `COL.labelCap` |
| `--topology-v2-label-element` | `#57575f` | `COL.labelEl` |
| `--topology-v2-canvas-bg-near` | `#0a0a0d` | circuit 쪽 배경(§working) |
| `--topology-v2-canvas-bg-far` | `#050507` | constellation 쪽 배경(§far-field), `lerpColor` 종점 |
| `--topology-v2-grid-minor` | `#0e0e13` | `buildGrid()` 세선 |
| `--topology-v2-grid-major` | `#121218` | `buildGrid()` 굵은선 |
| `--topology-v2-vignette-base-alpha` | `0.32` | `render()` vignette 계산식 상수항 |
| `--topology-v2-vignette-far-alpha` | `0.18` | 같은 식의 `farT` 계수 |

라이트 모드 변주는 P3 구현 시 Design Guardian 리뷰로 확정(프로토타입은 다크
전용) — 토큰 이름만 여기서 고정하고 라이트 값은 `:root[data-theme="light"]`
오버라이드로 별도 채운다. 신뢰선(§2.1 verdict a5, cyan 제2채색 결함)과 같은
실수를 반복하지 않도록 라이트 대비는 P3 게이트에서 스크린샷 필수.

### 2.3 지오메트리 (반지름·레이아웃·모서리)

| 토큰 | 값 | 출처 |
|---|---|---|
| `--topology-v2-radius-project` | `25` (world unit) | `RADIUS.project` |
| `--topology-v2-radius-domain` | `17` | `RADIUS.domain` |
| `--topology-v2-radius-capability` | `11` | `RADIUS.capability` |
| `--topology-v2-radius-element` | `7` | `RADIUS.element` |
| `--topology-v2-layout-ring-domain` | `250` | domain 링 반지름(`domainR`) |
| `--topology-v2-layout-ring-capability` | `145` | capability 링 반지름(`capR`) |
| `--topology-v2-layout-ring-element` | `90` | element 링 반지름(`elR`) |
| `--topology-v2-edge-bow-contains` | `70` | `buildEdges` maxBow(contains) |
| `--topology-v2-edge-bow-depends` | `92` | `buildEdges` maxBow(depends) |
| `--topology-v2-edge-blend-contains` | `0.46` | bow blend 계수 |
| `--topology-v2-edge-blend-depends` | `0.62` | bow blend 계수 |
| `--topology-v2-star-count` | `4` | 회절 스파이크 상위 N |
| `--topology-v2-dust-area-per-point` | `5200` (px²) | `buildStarDust` 밀도 |

이 값들은 CSS 로 직접 소비되지 않고(canvas 2D 는 JS 상수 필요) `lib/tokens.ts`
가 `getComputedStyle(document.documentElement)` 로 1회 해석해 숫자로 캐싱한다
(Design Guardian verdict a4 가 언급한 `skeletonInkRef` 해석-캐시 패턴 재사용).
"토큰이되 canvas 소비"라는 점에서 design.md 의 "JSX 안에 하드코딩 금지" 원칙을
canvas 컨텍스트로 확장 적용 — 값의 진실원은 여전히 `app/globals.css` 하나다.

### 2.4 모션 · 카메라

| 토큰 | 값 | 출처 |
|---|---|---|
| `--topology-v2-camera-spring-angfreq` | `2.941` (rad/s, `1/0.34`) | `updateCamera` `angFreq` |
| `--topology-v2-camera-damping-default` | `1.0` | critically damped 기본값 |
| `--topology-v2-camera-damping-flick` | `0.82` | 플릭 릴리스 시 살짝 오버슈트 |
| `--topology-v2-camera-momentum-decay` | `0.998` | `releaseDrag` 관성 투영 `d` |
| `--topology-v2-camera-scale-min` | `0.24` | `MIN_SCALE` |
| `--topology-v2-camera-scale-max` | `2.6` | `MAX_SCALE` |
| `--topology-v2-altitude-far-high-ratio` | `0.92` | `FAR_HIGH = OVERVIEW_SCALE * 0.92` |
| `--topology-v2-altitude-far-low-ratio` | `0.62` | `FAR_LOW = OVERVIEW_SCALE * 0.62` |
| `--topology-v2-focus-fit-max-scale` | `1.9` | `setFocus` 포커스 다이브 상한 |
| `--topology-v2-focus-bbox-margin` | `70` | `setFocus` bbox margin |
| `--topology-v2-hysteresis-px` | `7` | 클릭=안전 계약(드래그 판정 임계) — INTERACTION-DESIGN §1 은 "~10px" 권고, 프로토타입 실측치 7px 채택(둘 다 안전 범위, 정확값은 프로토타입 우선) |
| `--topology-v2-emphasis-rise-tau` | `0.09` (s) | hover ripple 상승 시상수 |
| `--topology-v2-emphasis-decay-tau` | `0.15` (s) | hover ripple 하강 시상수 |
| `--topology-v2-ripple-stagger-ms` | `55` (+`12`/neighbor) | `startRipple` 이웃 지연 |
| `--topology-v2-breathe-amplitude` | `0.04` | fresh 노드 숨쉬기 진폭 |
| `--topology-v2-breathe-freq-rad` | `1.15` | 숨쉬기 각주파수 |
| `--topology-v2-pulse-duration-ms` | `420` | depends 신호 펄스 수명 |
| `--topology-v2-tip-fade-ms` | `120` | 팝오버 opacity 트랜지션(DOM, `transition-opacity` 헌장 준수) |

`prefers-reduced-motion` 분기는 프로토타입에 이미 있다(스프링 스킵 → 즉시
target 대입, 펄스/브리딩 억제, emphasis 이진화) — 그대로 포팅, 신규 로직
불필요.

## 3. 상태 계약

### 3.1 고도 티어(altitude tier) — overview / transition / working

| 티어 | 조건(camera.scale) | 시각 | 라벨(고도계 칩) |
|---|---|---|---|
| **working (circuit)** | `scale ≥ FAR_HIGH` (`OVERVIEW_SCALE × 0.92`) | 청사진 그리드 100%, 기계 부품 형태(hex/칩/via), 각인 숫자, 칩-다리 핀 틱, 신호 펄스+코멧 테일 | `circuit` |
| **transition** | `FAR_LOW < scale < FAR_HIGH` | `farT = 1 − smoothstep(FAR_LOW, FAR_HIGH, scale)` 로 그리드→성도 크로스페이드, 모서리 반경이 원으로 수렴 중, 회절 스파이크가 `farT` 에 비례해 나타남 | `transitioning` |
| **far-field (constellation)** | `scale ≤ FAR_LOW` (`OVERVIEW_SCALE × 0.62`) | 그리드 0%, 노드=원(별), 4점 상위 노드에 회절 스파이크, 별먼지, 도메인 라벨(트래킹된 소문자→대문자 성도 표기) | `constellation` |

전환은 **이산 분기 없이** 단일 `farT` 값(0~1)이 모든 시각 요소(색·모서리
반경·라벨 알파·엣지 두께)를 동시에 구동한다 — "모드 플립 없음"이 코드
레벨에서 "if(mode==='far') { ... } else { ... }" 분기가 아니라 연속 보간
함수 하나로 강제된다는 뜻. 구현 시 이 불변식을 `altitude.test.ts` 가 검사
(임의의 두 인접 scale 샘플 사이 모든 파생값의 변화율이 유한하다 — 계단
함수 없음).

### 3.2 포커스 상태 (State Contract 매핑)

PRODUCT-DESIGN-OPERATING-SYSTEM.md State Contract 표를 B2+ 구체값으로:

| 상태 | 필수 동작(운영체제 계약) | B2+ 구현 |
|---|---|---|
| **Click** | 선택 노드/관계 주변 durable focus 생성, 드래그 프리뷰가 암시하는 관계 컨텍스트를 노출 | `setFocus(node)` — 카메라가 노드+1-hop 이웃 bbox 로 스프링 다이브(`fitTarget(bb, 1.9)`), 이웃 외 전부 `egoState=dim`(불투명 dim 토큰, 알파 아님), 포커스 유지된 채 팝오버 상시 표시 |
| **Hover** | 가벼운 프리뷰만, durable 선택/카메라/경로/handoff 패킷 불변 | `hoveredNode` — ripple emphasis 만 상승(카메라·포커스 불변), `focusedNode` 있으면 hover 억제(포커스가 emphasis 소유권 독점) |
| **Drag** | 배치/편집 의도, 정렬/관계 컨텍스트 보여줄 수 있으나 관계 발견의 유일한 수단이면 안 됨 | 캔버스 팬(카메라 이동)만 드래그로 노출 — **노드 자체 드래그(재배치)는 B2+ 프로토타입 범위 밖**(P3 스코프 아님, 지도 뷰 카드 드래그와 별개 결정). 관계 발견은 hover/click 으로 완결되므로 "drag-only discovery" 위반 없음 |
| **Focus** | 활성 온톨로지 핸들·kind·관계/증거 요약·다음 그래프 행동 이름 | 팝오버(§3.3) — slug·kind·hub/fresh/stale 배지·의존 in/out 카운트·MCP/CLI 다음 행동(P4 신설) |
| **Path** | source/target 진행 상황을 support/focus 레이어에, 좌측 패널·인스펙터·HUD·미니맵을 가로지르면 안 됨 | v2 범위 밖(현재 path 워크플로는 TopologyMapCanvas 전담, Phase 0 §4.2 "의도적으로 뺀 것"에 명시) — 필요성 재확인은 P6 이후 |
| **Composer** | 그래프 인터랙션 블록, dim/scrim, pending mutation 라벨, cancel/commit 명확 | v2 범위 밖(Add Concept 등 composer 는 기존 크롬 레이어 유지) — 캔버스는 composer 열림 시 `blocking-map-opacity`/`blocking-map-filter`(기존 `--topology-blocking-*` 토큰) 로 dim, 신규 토큰 불필요 |

### 3.3 팝오버 타입드 팩트 (plan §5 — MCP/CLI 핸드오프 포함)

프로토타입 `renderTip()` 은 배지(허브/신선/정체) + 카운트(의존 in/out·노드
수)까지만 그린다. Agent Handoff Design Contract(운영체제 문서 §"Agent Handoff
Design Contract")를 만족하려면 P4 에서 아래 행을 추가한다:

| 필드 | 내용 | 소스 |
|---|---|---|
| 온톨로지 팩트 | kind 한글 라벨 + slug | 기존(`KIND_LABEL`) |
| 배지 | 허브 / 최근 갱신(fresh) / 정체됨(stale) | 기존 |
| 카운트 | "이 노드가 기대는 곳 N" / "이 노드를 쓰는 곳 N" / "N개 노드" | 기존(평문 원칙 이미 준수) |
| **다음 행동(신규)** | "전체 상세 →"(opt-in, 풀스크린 모달 금지 계약 준수) | 기존 팝오버 확장 패턴 |
| **MCP 액션(신규)** | `get_concept("<slug>")` / 이웃 hop 이 있으면 `find_backlinks("<slug>")` | Phase 0 §4.2 어댑터의 `onSelect`/`onOpen` 과 별개로 텍스트 표기 |
| **CLI 대체(신규)** | `ontology-atlas node <slug>` / `ontology-atlas backlinks <slug>` | MCP 미보유 에이전트(Codex 등)를 위한 동등 경로 |

### 3.4 신선도(freshness) — 전원(powered) / 비전원(unpowered) 은유

메모리([[owner-topology-taste]])가 확정한 은유: **운영 상태가 시각에
내장된다 — 전원 = 신선도.**

| 상태 | 시각(B2+) | 은유 |
|---|---|---|
| **fresh (전원 켜짐)** | `breathe = 1 + 0.04·sin(t·1.15+phase)` 미세 크기 진동, stroke 가 인디고 쪽으로 85% lerp | 살아있음 — 최근 데이터가 흐른다 |
| **일반(중립)** | tier 색(§2.1), 진동 없음 | 정지, 정상 |
| **stale (비전원)** | dash `[3,3]` 테두리, dim fill/stroke(`staleFill`/`staleStroke`), 진동 없음 | 회로에서 전원이 빠짐 — 정체됨 |
| **hub** | kind 형태 + 4px 확장 앰버 링(`COL.amber`, 헌장 예외 허용 톤) | 구조적 중요도, freshness 와 직교(동시 표시 가능) |

이 네 상태는 서로 배타적이지 않다(hub+fresh, hub+stale 모두 가능) — 각각
독립 오버레이로 합성(§SIGMA-PLAYBOOK §4-1 "새 채색 대신 보더로 상태" 원칙과
동일하게, canvas 2D 에서도 색 추가가 아니라 dash/링/진동을 상태별로 분리
적용).

### 3.5 드리프트 경고 상태 (신규 — 프로토타입에 없음)

프로토타입은 단일 vault 픽스처라 vault-레벨 drift(`validate_vault`/
`vaultWarnings`)를 다루지 않는다. v2 는 실제 vault 를 그리므로 P4 에서
추가한다:

- **위치**: 고도계 칩·힌트 칩과 같은 유틸리티 크롬 레이어(좌상단 칩 그룹
  아래 스택, 새 레이어 신설 아님).
- **트리거**: `list_concepts`/`validate_vault` 의 `vaultWarnings > 0`.
- **시각**: 기존 칩과 동일 anatomy(panel surface + soft border), 텍스트만
  "N개 항목에 검증 경고" + dashed border(정체됨과 같은 "주의" 문법 재사용 —
  새 색 도입 없음).
- **상호작용**: 클릭 시 CLI 대체 문구(`ontology-atlas validate`) 노출 —
  별도 패널 열지 않음(팝업 수프 금지).
- **14인치 충돌**: 고도계 칩(우상단)·힌트(하단 중앙)·경고 칩(좌상단, altitude
  칩과 세로로 쌓임)이 서로 겹치지 않는지 P4 게이트에서 스크린샷 확인.

### 3.6 hover/press 상태 (클릭=안전 계약)

INTERACTION-DESIGN §1 그대로: press(pointerdown)는 즉시 피드백(선택 링/
emphasis 상승 예약)만, 커밋(포커스 전환)은 pointerup 에서, 드래그 이탈
(`HYSTERESIS=7px`) 시 취소. 프로토타입 `pressedNode`/`pointer.dragging`
상태 기계를 그대로 포팅 — 신규 설계 불필요, P2 에서 그대로 이식.

## 4. 구현 페이즈 분해 (strangler, feature flag `topology-map-v2`)

**피처 플래그**: `src/shared/config/feature-flags.ts` 신설 —
`isTopologyMapV2Enabled()`: `localStorage["atlas:feature:topology-map-v2"]`
또는 URL 쿼리 `?mapEngine=v2` 를 읽는 순수 함수, 기본값 `false`. 서버/빌드
플래그 서비스 도입 없음(local-first 원칙 — 로컬 토글만). P6 에서 기본값을
`true` 로 뒤집는 커밋 하나로 전환.

새 위젯 루트: `src/widgets/topology-map-v2/`.

### P2 — 스캐폴드 (엔진 + 카메라 + 레이아웃)

| 항목 | 내용 |
|---|---|
| 파일(신규) | `lib/camera.ts`(스프링+모멘텀+히스테리시스, `topology-map-canvas/lib/camera.ts` 의 `fitBounds`/`zoomAt`/`panBy`/`clampScale` import 재사용) · `lib/layout.ts`(동심 링 배치, vault 그래프 → 좌표, aspectX 왜곡 없음) · `lib/altitude.ts`(`farT` smoothstep) · `ui/TopologyMapV2.tsx`(canvas mount, resize/DPR, rAF 루프, pointer 배선 — 도형 드로우는 P3) · `src/shared/config/feature-flags.ts` |
| 테스트(TDD) | `camera.test.ts`(스프링 임계감쇠 수렴, 플릭 모멘텀 착지점 계산식, 히스테리시스 임계 통과 시점) · `layout.test.ts`(고정 vault 픽스처 → 결정론적 좌표, **겹침 없음**, aspectX 계열 왜곡 상수 부재 — Design Guardian a1 회귀를 v2 에서 구조적으로 재발 불가하게 고정) · `altitude.test.ts`(smoothstep 단조성, `FAR_HIGH`/`FAR_LOW` 가 실제 fit scale 비율로 계산됨) |
| 게이트 | 플래그 켠 상태에서 `/topology?mapEngine=v2` 진입 시 빈 캔버스가 팬/줌 가능(스프링 체감), 헤드리스 카메라 수학 전부 그린, `pnpm test src/widgets/topology-map-v2` 통과 |

### P3 — 노드/트레이스/티어

| 항목 | 내용 |
|---|---|
| 파일(신규) | `lib/shapes.ts`(hex/square/via `roundedPolygonPath`, 모서리 반경 `farT` 보간) · `lib/edges.ts`(bow 라우팅, contains/depends dash, 신호 펄스+코멧 테일) · `lib/tokens.ts`(§2 토큰 해석-캐시) · `ui/TopologyMapV2.tsx` 도형 드로우 연결 |
| 테스트 | `shapes.test.ts`(헥스/사각 꼭짓점 생성, 모서리 반경이 `[min,r]` 범위 내 보간) · `edges.test.ts`(bow 가 `maxBow` 를 넘지 않음, `blend` 계수 반영) · `tokens.test.ts`(§2 토큰 전부 해석 성공, 누락 시 명시적 실패 — 토큰 drift 가드) |
| 게이트 | overview/전환/working 세 scale 스크린샷에서 형태가 원↔다각형으로 연속 수렴(이산 점프 없음), 다크+라이트 대비 확인(verdict a5 재발 방지 — 신뢰선 같은 제2채색 도입 여부 스크린샷 리뷰) |

### P4 — 포커스/팝오버 + 신선도 오버레이

| 항목 | 내용 |
|---|---|
| 파일(신규) | `lib/emphasis.ts`(hover ripple + ego dim 상태 기계) · `lib/freshness.ts`(fresh/stale/hub → 시각 매핑) · `ui/NodePopover.tsx`(§3.3 타입드 팩트 + MCP/CLI 행 신설) · drift 경고 칩(§3.5, `ui/TopologyMapV2.tsx` 내 유틸리티 칩 그룹) |
| 테스트 | `emphasis.test.ts`(ripple stagger 타이밍, 포커스 우선순위로 hover 억제, reduced-motion 이진화) · `freshness.test.ts`(상태 조합 → 토큰 매핑 테이블 검증) · 팝오버 콘텐츠 테스트(어댑터 데이터 → 카운트/배지/MCP·CLI 행 렌더) |
| 게이트 | 클릭 focus 가 durable(Esc/바깥 클릭까지 유지), 팝오버가 State Contract 전 필드 노출, drift 칩이 utility chrome 레이어에서 altitude/hint 칩과 안 겹침(14인치 스크린샷) |

### P5 — 성능 검증 + 가디언 + 설치 앱 게이트

| 항목 | 내용 |
|---|---|
| 작업 | Phase 0 시나리오 a/a′/b/b′/c 를 **프로덕션 빌드**(`pnpm build`)로 v2 엔진에서 재측정, TopologyMapCanvas/SigmaTopology 베이스라인과 비교 표 작성 · Design Guardian 스크린샷 리뷰(다크/라이트 × compact 1100×800/14인치 1512×917/1920×1080/2560×1440) · 설치된 macOS 앱 증거 |
| 게이트 | main-thread busy·INP 가 SigmaTopology 베이스라인(1412ms/194ms+73ms reflow) 대비 명확히 개선, TopologyMapCanvas 베이스라인(700ms/201ms) 대비 회귀 없음(canvas-2D 는 유사하거나 더 가벼워야 함 — 즉시-모드라 React commit 비용 자체가 없음) · Guardian verdict = Build and verify · 14인치 No-Gos 전항목 통과 |

### P6 — 전환 + 구엔진 삭제

| 항목 | 내용 |
|---|---|
| 작업 | 플래그 기본값 `true` 전환 커밋 · `HomePage.tsx`/`ProjectDetailPage.tsx` 두 호출부를 `TopologyMapV2` 단일 호출로 교체(§1.2 unify) · `codegraph_callers` 로 잔여 참조 0 확인 후 `src/widgets/topology-map-sigma/`(약 40 파일) + `src/widgets/topology-map-canvas/` 삭제 · `SigmaSkeletonCards.tsx` 삭제는 Phase 0 §7 체크리스트의 별도 PR과 조율(같은 스프린트, 별도 커밋) · `docs/FEATURES.md`/`docs/ARCHITECTURE.md`/dogfood vault(`docs/ontology/capabilities/`) 갱신 |
| 게이트 | 전체 회귀 스위트(`pnpm test:run`, `pnpm exec playwright test`) 그린, 구 엔진 참조 0(codegraph 확인), 문서 3종 갱신 완료 |

## 5. 14인치 풀스크린 충돌 규칙 + 어텐션 레이어 모델 + MCP/CLI 핸드오프

### 5.1 어텐션 레이어 배정 (운영체제 문서 "Relief/Topology Attention Layer Model")

| 레이어 | B2+ 요소 |
|---|---|
| **Map layer** | 캔버스 전체(노드·엣지·펄스·별먼지·도메인 헐) — 포커스/blocking 이 없을 때 기본 승자 |
| **Support panel layer** | v2 Phase 1 범위엔 상시 개방 패널 없음(TopologyAnalysisBar 는 v2 대상 아님, verdict a6 다이어트 별도 트랙) |
| **Focus/path state layer** | 클릭 포커스 시 팝오버(§3.3) — 유일한 focus 표면, 1개 상한 |
| **Blocking composer/modal layer** | v2 범위 밖(기존 Add Concept 등 크롬 유지, dim 은 기존 `--topology-blocking-*` 토큰) |
| **Utility chrome layer** | 고도계 칩 · 힌트 칩 · drift 경고 칩(§3.5) — 그래프 팩트/팝오버를 절대 가리면 안 됨 |

### 5.2 14인치(1512×917) 충돌 규칙

- 유틸리티 칩 3개(고도계 우상단·힌트 하단중앙·drift 경고 좌상단)는 서로
  세로로 쌓이되 팝오버 앵커 영역과 겹치지 않는다 — 팝오버는
  `graphToViewport` 상당 좌표 계산(`worldToScreen`)으로 노드 옆에 앵커,
  뷰포트 밖으로 나가면 반대편으로 flip(프로토타입 `renderTip` 의
  `left+240>viewW` 분기 그대로 포팅).
- 팝오버는 **동시 1개** — 새 노드 클릭 시 이전 팝오버는 교체(스택 아님,
  Design Guardian "popup soup" 반려 규칙 준수).
- 회절 스파이크·별먼지·도메인 헐 같은 장식 오버레이는 utility chrome 이
  아니라 **map layer 의 데이터 마크**(중요도/성단 경계 인코딩)이므로 칩과
  겹쳐도 무방 — 칩은 그 위에 그려지는 게 아니라 DOM(팝오버/칩)과 canvas
  가 별도 레이어이므로 z-order 는 DOM 이 항상 위(HTML 오버레이 관례).
- 도메인 헐(convex hull)은 hover/focus 된 도메인 1개만 그려진다(프로토타입
  `activeDomain` 게이트) — 동시에 여러 헐이 뜨는 "popup soup" 변형을 원천
  차단.

### 5.3 MCP/CLI 핸드오프 노트

- 팝오버(§3.3)가 유일한 handoff 표면 — Path/Composer 레이어는 v2 범위
  밖이므로 별도 핸드오프 표면 불필요.
- CLI-only 에이전트(Codex 등, MCP 미장착)를 위해 팝오버의 MCP 행과 CLI 행은
  **항상 동시에** 렌더(하나만 보이는 상태 없음) — "MCP-only happy path
  금지" 규칙 준수.
- `onSelect`/`onOpen` 콜백(Phase 0 §4.2 어댑터 계약)은 그대로 유지 —
  v2 는 이 계약을 변경하지 않고 렌더링만 교체한다. 즉 HomePage/
  ProjectDetailPage 의 상위 상태 관리(선택된 slug, path 쿼리 등)는 무변경.

## 6. 열린 질문

1. **지도/그래프 탭 UI 존치 여부**(§1.2) — 엔진 통합 후 탭 자체가 필요한지는
   별도 PO 패스 필요. Phase 1 은 답하지 않는다.
2. **라이트 모드 B2+ 값** — 프로토타입은 다크 전용. P3 구현 시 Design
   Guardian 과 함께 라이트 대비를 확정(§2.2 토큰 이름은 이미 고정, 값만
   미정).
3. **노드 드래그(재배치)** — B2+ 프로토타입 범위 밖(팬만 드래그). 기존
   TopologyMapCanvas 의 카드 드래그 재배치 기능을 v2 에 승계할지는 P6 이후
   별도 슬라이스로 남긴다(Phase 0 §5 S6 잔여 항목과 연결).
4. **path 워크플로 오버레이** — Phase 0 §4.2 가 이미 "별도 얇은 adapter 로
   분리 검토"로 유보. v2 P6 완료 후 필요성 재확인.
