# TOPOLOGY-V2 PHASE 0 — 진단 · 계약 고정 (2026-07-18)

> Phase 0 (진단 전용, 구현 금지)의 산출물. `src/` 는 건드리지 않았다. 모든 수치는
> Chrome DevTools MCP (`performance_start_trace`/`performance_stop_trace`/
> `performance_analyze_insight`) 로 로컬 `pnpm dev` (Turbopack, unminified,
> React DEV 모드) 위에서 실측했다 — 추측 없음, 아래 표가 실측 확정이다.

## 0. 가장 중요한 발견 — 감사 대상 파일이 이미 죽은 코드다

audit 프롬프트가 지목한 두 파일 중 하나는 **현재 앱의 어떤 화면에서도 마운트되지
않는다.**

- `codegraph_callers("SigmaSkeletonCards")` → **caller 0개.**
- `grep`으로 JSX 사용까지 확인: `SigmaTopology.tsx`가 여전히
  `import { SigmaSkeletonCards }`하고 `skeletonMode`/`skeletonCardsActive` 게이트
  뒤에서 렌더한다 (`skeletonMode = !minimal && skeletonLayout != null && skeletonLayout.size > 0`).
- 그런데 **실제 두 호출부 모두 이 게이트를 끈다**:
  - `HomePage.tsx:2335` 삼항식 — `analysisMode !== "graph" && localGraphRoot === null && topologySkeleton` 일 때만 `<TopologyMapCanvas>` (신규 단일 컨테이너 엔진, 2026-07 rebuild)가 렌더되고, **그 외 전부** (`analysisMode === "graph"`, 즉 "그래프" 탭) 는 `<SigmaTopology>`로 떨어진다. 단, `analysisMode === "graph"`로 전환되는 순간 `topologySkeleton` 자체가 upstream에서 `null`로 꺼진다 (`HomePage.tsx:678` 부근 주석: "ontology 노드를 라이브 물리로 그린다 — skeleton 을 끄면 SigmaTopology"). 그 결과 `skeletonLayout`/`skeletonCards` prop이 `null`이 되어 `skeletonMode`가 항상 `false`.
  - `ProjectDetailPage.tsx:685` 의 `<SigmaTopology minimal ... />` (이웃 지도) 는 `minimal` prop을 주므로 `skeletonMode`가 정의상 `false` (`!minimal` 조건에서 즉시 탈락). `skeletonLayout`/`skeletonCards` prop 자체를 아예 넘기지도 않는다.
- 실측 크로스체크: 이번 세션에서 캡처한 **5개 CPU 프로파일 전체**에서
  `SigmaSkeletonCards`, `separatePathEndpointCards`, `rectsOverlap`,
  `collectSkeletonCardElementIndex`, `pushCardsAwayFromDraggedCluster` 이름이
  **단 한 번도** 콜프레임으로 등장하지 않았다.

**결론**: `SigmaSkeletonCards.tsx` (11,102줄 · 407 data-attr · O(n²) 카드 충돌
기하 · zero memo) 는 2026-07 "지도 뷰 재구성" (`TopologyMapCanvas`, 커밋
`3ce8d2669`) 이후 **도달 불가능한 코드**다. 이 파일을 "고치는" 리팩터는 이미
발생하지 않는 잭크를 최적화하는 것과 같다 — Phase 1 은 이 파일을
**최적화 대상이 아니라 삭제 대상**으로 재분류해야 한다 (사용처가 정말 0인지
`rg -l "SigmaSkeletonCards"` 로 재확인 후, dead code 제거는 별도 PR로).

남은 진짜 audit 대상은 `SigmaTopology.tsx` (3,833줄 · 38 effect) 뿐이다 — "그래프"
탭(라이브 물리 그래프)과 프로젝트 상세의 이웃 지도(`minimal`)에서 실제로
실행된다. 아래 실측은 전부 이 실제 실행 경로를 대상으로 한다.

## 1. 두 개의 엔진이 공존한다 — 시나리오별로 다른 코드가 실행됐다

| 진입점 | 렌더러 | 상태 |
|---|---|---|
| `/topology` 기본 (지도 탭, `analysisMode !== 'graph'`) | `TopologyMapCanvas` (`data-testid="topology-map-canvas"`, `data-map-engine="canvas"`) — 2026-07 신규 단일 컨테이너 변환 엔진 | **살아있음, audit 대상 아님** |
| `/topology?mode=graph` (그래프 탭) | `SigmaTopology` + Sigma WebGL (`data-testid="sigma-topology-viewport"`, 7-layer canvas) | **살아있음, audit 대상** |
| `/project/[slug]` 이웃 지도 | `SigmaTopology minimal` (스켈레톤 off) | 살아있음, 소규모 |
| (구) `SigmaSkeletonCards` 카드 오버레이 | — | **도달 불가능** (§0) |

Phase 0 실측은 두 엔진 모두에서 진행해 대조했다 (같은 vault, 295 개념 · 505
관계, dogfood 데이터).

## 2. 실측 표

CPU throttling 1x · network throttling 없음 · 로컬 M-series 맥 · Turbopack dev
서버 (`next dev`, React DEV 빌드 — §5 캐비잇 참조).

| 시나리오 | 엔진 | 핵심 수치 | Dropped frames | 지배적 원인 (실측) |
|---|---|---|---|---|
| a. 초기 로드 (첫 2초) | TopologyMapCanvas (지도) | main-thread busy **700ms**, 최장 task **164.8ms**, LCP 233ms | — | 첫 커밋 + 카드 레이아웃 계산 (React DEV 계측 포함) |
| a′. 초기 로드 (첫 2초) | SigmaTopology (그래프) | main-thread busy **1412ms** (지도 대비 2배), 최장 task **374.0ms**, LCP 251ms | — | 아래 §3 breakdown |
| b. 노드 클릭 → ego-focus | TopologyMapCanvas (지도) | **INP 201ms** = input delay 1ms + processing **172ms** + presentation 28ms | — | React commit/effect ~15% · DOM removeChild/setAttribute/appendChild ~15% · React DEV scheduler 계측 ~18% · idle/gc ~17% |
| b′. 노드 클릭 → ego-focus | SigmaTopology (그래프, 실 WebGL 노드 클릭) | main-thread RunTask **194ms** + **Forced Reflow 73ms 확정** (Sigma 라이브러리 자체 `resize()` 내부, `node_modules` 청크) | — | idle 36.5% · `get offsetWidth`(강제 reflow 트리거) 9.5% · FA2 물리 워커(`onmessage`/`startLoop`/`force`) ~12.8% · Sigma 엔진(resize/addNode) ~11.8% · DOM removeChild ~5.8% · React DEV 계측 ~10% |
| c. 팬/줌 ~3초 | SigmaTopology (그래프) | main-thread busy **682ms / 12.4s 윈도우 (5.5%)**, per-frame task 8~18ms, 최장 94ms(정착 잔여) | **6 / ~245** draw 이벤트 | 프레임당 비용은 예산(16.6ms) 이내 대부분 — hideEdgesOnMove류 LOD가 실제로 작동 중으로 보임 |
| d. expand/collapse | — | **미측정** | — | §6 참조 — 공유 브라우저 세션 경합으로 생략, Phase 1 재측정 필요 |

### 2.1 초기 로드 244ms/374ms task 내부 (그래프 엔진, 440~1110ms 구간, 5,866 샘플)

| 버킷 | 비중 | 근거 |
|---|---|---|
| React DEV 계측 전용 오버헤드 (`logComponentRender`/`logComponentEffect`/`logComponentTrigger`/`createTask`/`getTaskName`) | **~26%** | React 19 dev-only "Components" 트랙 계측 — **프로덕션 빌드엔 없음** |
| Sigma/WebGL 엔진 자체 (`iterate`/`resize`/`loadShader`/`createWebGLContext`/`loadProgram`/`drawDiscNodeLabel`/`addEdge`, 전부 `node_modules` sigma 청크) | ~24.5% | 최초 마운트 1회성 비용 (WebGL context + shader 컴파일) |
| DOM `removeChild` (일반 + react-dom) | ~12.6% | 초기 커밋 시 placeholder → 실 노드 reconciliation |
| React 커밋 단계 (`recursivelyTraverseMutationEffects`/`commitPassiveMountOnFiber`/`commitMutationEffectsOnFiber`/`commitLayoutEffectOnFiber`) | ~7.6% | 295 노드 트리 commit — 정상 범위 |
| 우리 위젯 코드 (named: `SigmaTopologyImpl.useEffect`, `send`) | **<1%** | — |

**해석**: 세 가설 중 어느 것도 이 초기 로드 구간을 지배하지 않는다. React
DEV-모드 계측 오버헤드(프로덕션에선 사라짐)와 Sigma 라이브러리 자체의
1회성 WebGL 셋업이 합쳐서 절반을 차지한다 — **이건 우리 코드의 문제가
아니다.**

### 2.2 클릭 194ms task 내부 (그래프 엔진, all-thread 샘플 5,132개 — 메인스레드 + 동시 실행 중인 FA2 물리 워커 포함)

가장 중요한 개별 사실: **Chrome의 Forced Reflow 인사이트가 자동으로 잡아낸
73ms 강제 리플로우의 발생 위치는 `node_modules` 안 Sigma 라이브러리 자신의
`resize()` 함수다** — 우리 커스텀 코드(`SigmaSkeletonCards`/`SigmaTopology`)가
아니다. `get offsetWidth`(9.5%)도 같은 계열(레이아웃 강제 읽기).

38-effect cascade 가설은 **부분 확인**: React 커밋 단계 함수들이 실측되지만
(공유 창 이름 수준의) 이 프로파일링 해상도로는 38개 effect 중 정확히 어떤
effect가 비용을 유발하는지까지는 특정할 수 없다 — Phase 1에서 React DevTools
Profiler(`logComponentRender` 이벤트를 컴포넌트별로 역추적)로 좁혀야 한다.

afterRender DOM 쓰기 가설은 **미확인**: `SigmaSkeletonCards`가 죽은 코드이므로
그 파일의 `afterRender` 핸들러는애초에 실행되지 않는다. 관측된 DOM churn
(`removeChild`/`setAttribute`/`appendChild`)의 정확한 발생원(팝오버? 범례
패널? 미니맵?)은 이번 세션에서 컴포넌트 단위로 확정하지 못했다 — Phase 1
선결 조건(§6)으로 남긴다.

## 3. 병목 판정 — 세 가설 vs 실측

| 가설 (audit 프롬프트) | 판정 | 근거 |
|---|---|---|
| O(n²) 카드 충돌 기하 (`SigmaSkeletonCards`) | **기각 — 코드가 실행되지 않음** | §0, 5개 트레이스 전체에서 관련 함수명 0회 등장 |
| 38-effect 캐스케이드 (`SigmaTopology`) | **부분 확인, 해상도 부족** | React 커밋 단계 비용은 실측되나(§2.2) effect 단위 귀속은 Phase 1 과제 |
| `afterRender` 동기 DOM 쓰기 | **미확인 — 다른 원인이 지배적** | DOM churn은 실측되지만(§2.1-2.2) `afterRender` 자체가 아니라 React commit 경로 + Sigma 라이브러리 내부 reflow가 더 크게 기여 |
| **(신규) React DEV 계측 오버헤드** | **확인 — 무시 못할 크기** | 초기 로드의 ~26%가 `logComponentRender` 등 React 19 dev-only 트랙. 프로덕션 빌드 재측정 없이는 실제 병목 크기를 과대평가하게 된다 |
| **(신규) Sigma 라이브러리 자체 비용** | **확인** | WebGL 셋업(~24.5%, 로드 시) + 강제 reflow 73ms(클릭 시) — 커스텀 코드가 아니라 엔진 자체. v2로 옮겨도 그대로 따라온다 (엔진 교체가 아니라면) |

**한 줄 요약**: 지금 측정 가능한 진짜 병목은 audit이 지목한 "우리가 짠 O(n²)
기하"가 아니라 (1) 이미 죽은 코드, (2) React DEV 모드 계측 비용, (3) Sigma
라이브러리 자체의 WebGL/reflow 비용, (4) 아직 정확히 특정 못 한 React
커밋+DOM churn 이다. Phase 1은 프로덕션 빌드 재측정 + effect 단위 귀속부터
시작해야 한다.

## 4. 어댑터 계약 초안 (Task B)

### 4.1 현재 데이터 흐름 (codegraph 확인)

```
HomePage (src/views/home/ui/HomePage.tsx)
  → useOntologyInsight → derivationToInsight   (vault manifest → ontologyInsight)
  → topologySkeleton = buildRevealRadialLayout(skeleton, nodes, reveal)  (src/views/home/lib/topology-skeleton-layout.ts)
  → analysisMode 분기:
      != 'graph' → <TopologyMapCanvas cards layout edges selectedSlug .../>
      == 'graph' → <SigmaTopology projects categories skeletonLayout=null skeletonCards=null .../>
```

`SigmaTopology`가 받는 실제 props 전체 (현재 3,833줄 컴포넌트, `SigmaTopologyProps`
인터페이스, `src/widgets/topology-map-sigma/ui/SigmaTopology.tsx:319`): 그래프 데이터
(`projects`, `categories`), 포커스 상태(`selectedSlug`, `depthLimit`,
`activeCategory`, `searchQuery`, `hubsOnly`), 프레시니스 오버레이(`overlays:
SigmaOverlays` = recentPulse/ownerTint/backrefHighlight, `changedSlugs`), 카메라
토큰(`fitViewToken`, `relayoutToken`), 물리 플래그(`livePhysics`, `forces`), 콜백
10여개, 그리고 **이제는 항상 null인** `skeletonLayout`/`skeletonSlugs`/
`skeletonCards` (죽은 경로, §0).

### 4.2 v2 어댑터 인터페이스 (제안)

목표: 옛/새 위젯이 플래그 뒤에서 바꿔 낄 수 있는 최소 표면. `SigmaSkeletonCards`
관련 3개 prop은 v2에 아예 포함하지 않는다 — 그 책임은 이미
`TopologyMapCanvas`가 전담한다 (§0). v2는 **"살아있는 물리 그래프"** 책임만
진다.

```ts
// topology-map-v2 어댑터 계약 — 그래프 데이터, 포커스 상태, 프레시니스
// 오버레이, 콜백만. 카드/스켈레톤 오버레이는 TopologyMapCanvas 전담(§0) —
// v2 는 재구현하지 않는다.
interface TopologyMapV2Props {
  // 그래프 데이터 — graphology 인스턴스가 아니라 평면 배열로 받는다
  // (SIGMA-PLAYBOOK §1.8: mutation 은 Sigma 가 자동 부분 refresh 하므로
  // 어댑터는 "무엇을 보여줄지"만 알면 되고 graphology 캡슐화는 위젯 내부 책임).
  nodes: TopologyV2Node[];      // SigmaNodeAttrs 의 서브셋 — id/label/kind/size/x/y/isHub/ownerKey/recentlyUpdated/fullDegree
  edges: TopologyV2Edge[];      // source/target/relationType/relationQuality/evidenceCount/kind

  // 포커스 상태 — nodeReducer/edgeReducer 의 입력. 위젯 내부에서 Set/Map으로
  // 미리 계산해 reducer 는 O(1) lookup 만 하게 한다 (SIGMA-PLAYBOOK §3-2).
  focus: {
    selectedSlug: string | null;
    depthLimit: number | null;      // ego 이웃 hop 제한, null = off
    searchQuery: string;
    activeCategory: string | null;
    hubsOnly: boolean;
  };

  // 프레시니스 오버레이 — 3종 독립 토글, 알파 없이 opaque 토큰 + hidden/zIndex 로
  // 표현 (SIGMA-PLAYBOOK §5 저알파 불변식).
  overlays: {
    recentPulse: boolean;
    ownerTint: boolean;
    backrefHighlight: boolean;
  };
  changedSlugs?: ReadonlySet<string>;

  // 물리/카메라 제어 — 토큰 증분 패턴 유지 (기존과 동일 계약, 검증됨)
  livePhysics: boolean;
  forces?: { repel: number; linkDistance: number; collideMultiplier: number };
  fitViewToken: number;
  relayoutToken: number;

  // 콜백 — 팝오버는 하나만 (SIGMA-PLAYBOOK §4-2: "레이어는 하나, 노드는 하나")
  onSelect?: (slug: string) => void;
  onOpen?: (slug: string) => void;      // 더블클릭/딥링크 — 상세 진입
  onPaneClick?: () => void;              // 빈 캔버스 클릭 = 포커스 해제
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;

  minimal?: boolean;   // 임베드 모드 (프로젝트 상세 이웃 지도) — 물리/툴바 축소
}
```

**의도적으로 뺀 것들** (기존 `SigmaTopologyProps`에 있었지만 v2엔 없음):
`skeletonLayout`/`skeletonSlugs`/`skeletonCards` (죽은 경로, §0),
`suppressKindLegend`/`suppressRelationLegend`/`suppressMinimap` (크롬 표시 여부는
호출부 레이아웃 책임이지 그래프 위젯의 데이터 계약이 아니다 — 39개 prop에서
줄이는 첫 항목), `pathWorkflowActive`/`pathSelection`/`healthRepairTarget` (path/health
모드 전용 오버레이는 별도 얇은 adapter로 분리 검토 — Phase 1에서 필요성
재확인).

## 5. 방법론 캐비잇

- **React DEV 모드**: `pnpm dev` (Turbopack, unminified) 위에서 측정 — React 19의
  `logComponentRender`/`createTask`/`getTaskName` 계측이 초기 로드의 ~26%를
  차지한다(§2.1). 프로덕션 빌드(`pnpm build` + 정적 서빙)에서 재측정하면 이
  버킷은 사라지고 상대 비중이 달라진다. **Phase 1은 프로덕션 빌드 재측정을
  포함해야 한다.**
- **공유 브라우저 세션 경합**: 이 진단 세션 도중 같은 스크래치패드/브라우저를
  공유하는 별도 백그라운드 작업(디자인 컨셉 mockup 3종, `concept-a/b/c-*.html`)이
  동시에 실행되며 페이지 선택/포커스를 여러 차례 가로챘다. 이미 저장된 트레이스
  파일(§2 수치의 근거)은 캡처 시점에 URL이 트레이스 메타데이터에 정확히 기록돼
  있어 영향받지 않았지만, **expand/collapse 시나리오(§2 표의 항목 d)는 이 경합
  때문에 캡처하지 못했다** — Phase 1 진입 전 격리된 브라우저 프로필로
  재측정 필요.
- **CPU 프로파일 귀속 방식**: Chrome trace의 `ProfileChunk` 샘플을 이름별로
  집계했다(leaf sample count ≈ self-time 근사). V8이 작은 함수를 인라인하면
  이름이 사라질 수 있어 실제보다 우리 코드 비중이 과소 추정될 가능성이 있다 —
  다만 §0의 "함수명 0회 등장"은 인라인이 아니라 **호출 자체가 없음**을 codegraph
  callers/grep 교차검증으로 별도 확인했으므로 이 캐비잇의 영향을 받지 않는다.

## 6. WebGL 저알파 결함 — 보너스 체크 (미완)

기존 메모리 노트(`webgl-alpha-defect`)가 owner 머신에서 저알파 색이 WebGL에서
불투명하게 합성되는 결함을 기록해 두었다. 이번 세션에서 허브 노드 halo
(`outerBorderColor`, α 0.15)를 캔버스 픽셀 레벨(`readPixels`)로 재확인하려
했으나, §5의 공유 브라우저 세션 경합으로 페이지 선택이 스크립트 실행 도중
반복적으로 다른 컨텍스트로 넘어가 픽셀 샘플을 확보하지 못했다. 스크린샷 육안
확인(`​.tmp-phase0/hub-halo-check2.png`, 커밋 안 됨 — 로컬 스크래치 산출물)
수준에서는 허브 halo가 부드러운 그라데이션으로 보여 결함이 재현되지 않았지만,
이는 신뢰할 만한 반증이 아니다(스크린샷 압축 + 육안 판정의 한계). **Phase 1에서
격리된 브라우저 프로필로 `readPixels` 기반 정량 재검증이 필요** — 결함이
실재한다면 SIGMA-PLAYBOOK §5의 "dim = hidden 또는 opaque 토큰" 불변식이 이미
정답이므로 신규 코드 작성 없이 기존 계약 준수 여부만 감사하면 된다.

## 7. Phase 1 진입 조건 체크

- [ ] `SigmaSkeletonCards.tsx` 도달 불가능 여부를 팀/오너에게 확인 후 삭제 PR
      분리 발행 (본 문서 §0 근거 첨부).
- [ ] 프로덕션 빌드(`pnpm build`)로 §2 시나리오 a/a′/b/b′ 재측정 — React DEV
      계측 버킷(~26%)이 실제로 사라지는지 확인.
- [ ] React DevTools Profiler로 `SigmaTopology`의 38 effect 중 클릭 시 실제
      발화하는 effect 목록을 이름 단위로 확정 (§2.2 "부분 확인" 해소).
- [ ] 클릭 시 관측된 DOM churn(`removeChild`/`setAttribute`/`appendChild`)의
      정확한 컴포넌트 발생원 특정 (팝오버 / 범례 패널 / 미니맵 후보).
- [ ] expand/collapse 시나리오 실측 (격리 브라우저 세션, §5).
- [ ] WebGL 저알파 결함 `readPixels` 정량 재검증 (§6).
- [ ] §4.2 어댑터 계약을 실제 `SigmaTopologyProps` 39개 prop과 1:1 매핑해
      "뺀 것" 목록에 대한 호출부(HomePage/ProjectDetailPage) 합의 확보.
- [ ] Slice 0/1 게이트(디자인/PO) 통과 확인 후에만 v2 구현 착수 — 본 문서는
      진단·계약 고정까지만, 구현은 다음 단계.
