"use client";

/**
 * `TopologyMapV2`'s engine hook — owns the canvas/rAF/pointer wiring so the
 * component itself stays a thin JSX shell (`docs/TOPOLOGY-V2-DESIGN.md` §4
 * P2-P4). Per-frame drawing is delegated to `topology-frame-draw.ts`; layout/
 * adjacency construction to `topology-world.ts`; camera-space conversions to
 * `topology-camera-math.ts`; pointer/wheel handlers to
 * `topology-pointer-handlers.ts` (this file only owns the refs they close over).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
import { MAX_FRAME_DELTA_SECONDS } from "../engine/spring";
import { cameraTransitionDurationMs, easeCameraKeyframe, type CameraKeyframe, type CameraTween } from "../model/camera-easing";
import { stepTugAxis, tugFactorForHop, tugFalloffForDistance } from "../interaction/drag-tug";
import { isCameraUnsettled, isCanvasActive, isEgoTailAnimating, shouldSkipFrame } from "../model/idle-gate";
import { ambientSleepFactor, isAmbientAsleep } from "../model/ambient-sleep";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, type TierRevealConfig, type ZoomTier } from "../model/tier-visibility";
import { relaxNodeSeparation, type SeparationNode } from "../model/separation";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import { initHomeSpring, isHomeSpringConverged, stepHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { DEPTH_DOT_LAYERS, buildDepthDotPattern, buildGridPattern } from "../render/grid";
import { orbitButtonRect, type ClusterBarLabels } from "../render/cluster-chips";
import { createAnimatedBackground, type AnimatedBackground } from "../render/animated-background";
import { buildDustPoints, buildRealmCosmosPoints, computeStarDustCount, type DustPoint } from "../render/starfield";
import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet } from "@/shared/lib/appearance-preferences";
import { centerForInsets, computeClusterFitTarget, computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale, fitWorldTarget, hasAnyNodeOnScreen, worldToScreen } from "./topology-camera-math";
import { drawTopologyFrame } from "./topology-frame-draw";
import { relaxNewlyVisible } from "../model/layout";
import { computeTopologyClusterState } from "./topology-cluster-state";
import type { ClusterChip } from "../model/density-gate";
import { clusterMoreChipId, EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId, rankEgoNeighborsByDOI, scheduleRipple, selectiveEgoNeighbors, stepEmphasis, stepFocusRamp, type EgoNeighborRankEntry } from "../model/focus-state";
import { buildFootprintSteps, buildWalkedEdgeKeys } from "../model/footprint-steps";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import {
  INITIAL_REALM_TRANSITION_STATE,
  REALM_EXIT_FLIP_MS,
  REALM_EXIT_OUTSIDE_RETURN_DELAY_MS,
  REALM_EXIT_OUTSIDE_RETURN_MS,
  REALM_INSIDE_FLIP_MS,
  REALM_OUTSIDE_FLING_MS,
  isRealmOutsideCulled,
  REALM_WARDING_DRAW_DELAY_MS,
  realmDustParallaxFactor,
  realmExitFlipDelayFor,
  realmInsideFlipDelayFor,
  realmInsidePosition,
  realmOutsidePosition,
  realmOutsideReturnAlpha,
  realmOutsideReturnPosition,
  realmTransitionReducer,
  realmWardingDrawProgress,
  realmWardingEraseProgress,
  type RealmTransitionState,
} from "../model/realm-transition";
import {
  depthParallaxFactorForDepth,
  isDepthParallaxActive,
  stepDepthParallax,
  ZERO_PARALLAX,
  type DepthParallaxOffset,
} from "../model/realm-depth-parallax";
import { buildRealmRuntimeData, fallbackAngleFor, realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "./topology-realm-runtime";
import { computeVisibleWardingRadius } from "../model/realm";
import { initWardingFit, stepWardingFit, type WardingFitState } from "../model/realm-warding-fit";
import { createTopologyPointerHandlers, type TopologyPointerHandlers } from "./topology-pointer-handlers";
import { stepTopologyPhysics } from "./topology-physics-step";
import { updatePulses, type Pulse } from "../render/edge-fireflies";
import {
  pickInitialFocus,
  pickNeighborInDirection,
  shouldAnnounceDeadEnd,
  walkDirectionForKey,
} from "../interaction/keyboard-walk";
import {
  collectCanvasObstacles,
  computeFreeArea,
  measureCanvasInsets,
  type Rect,
} from "../interaction/free-area";

import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyMapV2Props } from "./TopologyMapV2";
import { applyForcePositions, buildTopologyWorld, recomputeWorldGeometry, type TopologyWorld, radiusForKind } from "./topology-world";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/**
 * C1 B1 — no `--topology-v2-*` token assigned yet (same "no token" precedent
 * as `engine/camera.ts`'s `DEFAULT_PAN_BOUNDS_MARGIN` / `topology-pointer-
 * handlers.ts`'s `RIPPLE_PER_NEIGHBOR_DELAY_MS`): how fast a neighbor's tug
 * offset eases toward its target (or back to 0 on release) — NOT how far it
 * moves (that's the token-backed `dragTug1Hop`/`dragTug2Hop` factors).
 *
 * Research pass (haiku feel-tuning, C1 mid-implementation): a "connected"
 * drag reads as neighbors following with a slight lag — ~100-300ms catch-up,
 * not rigidly synced to the pointer and not so slow it feels disconnected.
 * 150ms sits in the middle of that band (vs. the initial 80ms, which was
 * closer to the hover-ripple rise tau and read as too instantaneous/rigid for
 * a physically-following neighbor).
 */
const DRAG_TUG_EASE_TAU = 0.15;
/**
 * A2 — 유휴 스킵 전 grace(ms). 램프 감쇠 꼬리(emphasis τ 0.15 → 시각 정착
 * ~0.7s)와 릴리즈 잔여를 여유 있게 덮는다. 시간 기반이라 주사율 무관(A4
 * 와 같은 원칙).
 */
const IDLE_GRACE_MS = 1200;
/**
 * 뷰포트가 "멎었다" 고 볼 프레임 수 — 이 프레임 수만큼 새 크기가 안 들어오면
 * 뷰포트 의존 레이어(그리드/별먼지/우주 도트)를 다시 짓는다. ms 가 아니라
 * 프레임 수인 이유: 이건 디자인 duration 이 아니라 **크기 정착 감지**이고,
 * 기준이 되는 것은 리사이즈를 나르는 프레임 그 자체다(주사율 무관).
 */
const VIEWPORT_SETTLE_FRAMES = 2;

/**
 * 끄는 동안 백킹 해상도 상한 — **드래그의 비용은 계산이 아니라 칠하기다.**
 *
 * 2026-07-31 실측(synth=3000, 14" Retina): 드래그 중 전달 프레임이 **13fps**
 * 인데 우리 JS 는 프레임당 **2.2ms** 로 83ms 중 2.6% 였다. 메인 스레드는 100%
 * 차 있었지만 그중 스크립트는 0.43s/14.9s — 나머지는 전부 래스터다. 그래서
 * 같은 장면을 dpr 만 2→1 로 낮춰 재보니 **13fps → 45fps** 였다. 픽셀을 1/4 로
 * 줄이면 3.3배 빨라진다 = 비용이 픽셀 수에 실려 있다는 직접 증거다.
 *
 * 손을 뗀 프레임에 곧바로 원래 해상도로 돌아오므로, **정지 화면의 선명도는
 * 한 톨도 잃지 않는다.** 흐려지는 것은 어차피 눈이 못 읽는 «움직이는 동안»
 * 뿐이다. 지도 앱의 표준 기법이고, 여기서는 그 교환이 실측으로 정당화된다.
 */
const INTERACTION_DPR_CAP = 1;
/**
 * 시뮬 프레임의 파생 갱신을 «움직인 노드» 로 좁히는 희소성 문턱 — 터그 영향권이
 * 전체의 `1/이 값` 미만일 때만 좁힌 경로를 탄다.
 *
 * 문턱이 필요한 이유는 좁히기가 공짜가 아니어서다: 인덱스 조회는 배열 순회보다
 * 캐시 지역성이 나쁘고, 어느 노드가 움직였는지 실측하려면 좌표 스냅샷도 떠야
 * 한다. 2026-07-31 구간 실측이 갈림점을 직접 보여줬다 — 영향권 **281/3000(9%)**
 * 에서 시뮬 블록 2.1 → 1.5ms(이득), **975/3000(33%)** 에서 기하 0.4 → 0.6ms
 * (손해). 5 는 그 사이에서 손해 쪽에 여유를 두고 고른 값이다.
 */
const SCOPED_FRAME_SPARSITY = 5;
/** World-unit epsilon below which a homing node is considered "arrived" (`relayout-home.ts#isHomeSpringConverged`). */
const HOME_CONVERGE_EPSILON = 0.5;

/**
 * FA2 iterations to run per warm frame — a bounded synchronous tick budget
 * (`model/force-layout.ts` integration note). The sim is warm ONLY while a
 * node is being pin-dragged (or its brief release settle) — never on load. The
 * static default is the deterministic de-piled concentric grid built in
 * `model/layout.ts`; running FA2 on mount turned that clean circuit into a
 * generic force hairball, which was the guardian's 충실도 반려 reason.
 */
/**
 * A4 — the sim advances a refresh-rate-invariant number of iterations: 1 per
 * 60Hz-frame-equivalent of real time, so a 120Hz display doesn't relax the
 * graph twice as fast (each of its frames just does "half a step" of work via
 * the rounded budget). Capped at 3 so a hitchy frame can't explode the sim.
 */
function forceIterationsForDt(dt: number): number {
  return Math.min(3, Math.max(1, Math.round(dt * 60)));
}

export interface UseTopologyLoopArgs {
  nodes: TopologyMapV2Props["nodes"];
  edges: TopologyMapV2Props["edges"];
  focusedSlug: string | null;
  /**
   * The neighbor slug the user is hovering in the detail panel's "연결된 노드"
   * list, or null. Under focus this one node (+ its connecting edge) lights up
   * on the canvas so panel and map read as one ("emphasis ripple" linkage,
   * lead spec §4). Null until the panel-hover wiring feeds it in.
   */
  emphasizedNeighborSlug?: string | null;
  /** 이 그래프의 출처 정체성 — 바뀌면 오버뷰를 다시 맞춘다. `TopologyMapV2Props` 의 같은 이름 참고. */
  dataSourceKey?: string | null;
  fitViewToken: number;
  /** 렌즈/기간이 바뀐 순간 강조 노드로 카메라를 맞추는 토큰(0 = 안 씀). */
  spotlightFitToken?: number;
  relayoutToken: number;
  /**
   * P3d(E1) — "첫 지도 연출". 증가 시 전 노드가 스파인 중심(프로젝트
   * 위치)에서 출발해 홈으로 스프링 정착한다 — "만들어졌다"가 아니라
   * "내 문서들이 모였다"로 읽히는 거울의 순간. 부트스트랩 완료에만
   * 발화(초기 로드 아님). reduced-motion 은 호밍 스냅 경로가 즉착 처리.
   */
  revealToken?: number;
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /** P3c — 엣지 호버 마이크로카드 (식별 변경 시에만 발화, null=해제). */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  onSelect?: (slug: string) => void;
  /** 방향키를 눌렀는데 그 방향에 이어진 노드가 없을 때. 연타는 훅이 걸러 낸다. */
  onWalkDeadEnd?: (() => void) | null;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /**
   * M-5 — the semantic-zoom altitude tier changed (spine → circuit → element).
   * Fires only on transitions (not per-frame), driven by the same reveal bands
   * the draw pass gates node visibility with, so the corner readout's
   * orientation label can never claim "zoom in to see elements" while elements
   * are on screen.
   */
  onZoomTierChange?: (tier: ZoomTier) => void;
  /** W2-B node right-click context menu — see `topology-pointer-handlers.ts#createTopologyPointerHandlers`'s `onContextMenuNode` doc. */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /** 빈 캔버스 우클릭 — 「여기에 개념 만들기」. */
  onContextMenuPane?: (position: { x: number; y: number }) => void;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form upstream, or `null`
   * when there's no fresh focus). Drives the amber agent-focus ring + label
   * activity mark; `null`/omitted draws neither (fabrication 0).
   */
  agentFocusNodeId?: string | null;
  /**
   * 최근 변경 스포트라이트 (협의회 설계 2026-07-23) — non-null 이면 렌즈 ON:
   * 이 집합 밖 노드/엣지를 `--topology-v2-spotlight-rest-alpha` 까지 침강.
   * 켜고 끄는 전이는 focusDimTau 램프 재사용(<200ms 체감), reduced-motion
   * 즉착. null/생략 = off (회귀 0). 집합 자체는 HomePage 가 `?recent=` 창의
   * mtime 산수(useAdaptiveRecentChanges)로 만든다.
   */
  spotlightIds?: ReadonlySet<string> | null;
  /** 엣지 선택 = 페어 포커스 (양끝만 표시, 선택 엣지 pale 인디고). */
  selectedEdge?: { sourceId: string; targetId: string } | null;
  /**
   * 밀도 게이트 (fable 설계) — 사용자가 펼친 부모 slug Set(URL `?open=`).
   * 임계 초과 부모의 자식은 기본 접힘(클러스터 칩)이고, 여기 담긴 부모만
   * 펼쳐 자식을 노출한다. 생략 시 전부 접힘.
   */
  expandedParents?: ReadonlySet<string>;
  /** 밀도 게이트 — 클러스터 칩 클릭 → 해당 부모 확장 토글(URL 왕복). */
  onToggleCluster?: (parentId: string) => void;
  /** S2 파트 5C — 클러스터 칩 호버 툴팁 (식별 변경 시 발화, null=해제). */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** 이 티어에서 접힌 직속 게이트 자식 수(칩 `+N`). */
      count: number;
      /** 패널3-S6 — 부모의 하위 전체 자손 수(노드 뱃지 = descendantCount). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /**
   * "영역 전개" (S4) — 지도를 이 노드의 세계로 전환한다 (`?realm=slug`). null 이면
   * 전체 지도. 값이 바뀌면 루프가 서브트리 재배치 + 전환 안무를 시작한다.
   */
  realmRootId?: string | null;
  /** S4 — 궤도 "전개" 버튼 클릭 → 이 slug 로 영역 진입 (HomePage 가 URL 왕복). */
  onEnterRealm?: (slug: string) => void;
  /** S4 — 궤도 "전개" 버튼 DOM (캔버스 좌표 앵커, 매 프레임 카메라 추종). */
  realmEnterButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * 결계 하단 센서스 각인 문구 — "○○ · 요소 N" (사용자 어휘 "이것만 보기",
   * 2026-07-23 소유자 결정 — 내부명 realm 유지). HomePage 가 원장 census 와
   * 같은 출처로 포맷해 내려보낸다(위젯은 i18n/census 를 직접 만지지 않는다).
   */
  realmCaption?: string | null;
  /**
   * 발자국 트레일 (fable 설계) — 세션 동안 방문(ego 포커스)한 노드 id 목록
   * (오래된 → 최근 순서). HomePage 세션 state 가 내려보낸다. 각 방문 노드에
   * 최근성 감쇠 헤어라인 링을 얹는다 — URL 비영속·정적 표기. 생략/빈 배열 =
   * 발자국 없음(회귀 0).
   */
  visitedTrail?: readonly string[];
  /**
   * 걸어온 길 렌즈 on/off 를 담는 **ref** — 트레일 팝오버가 열려 있는 동안 true.
   * 지도가 잠시 관계 읽기를 접고 궤적 읽기에 양보한다: 방문 노드(`visitedTrail`)만
   * 값과 라벨을 지키고 나머지 노드·칩·라벨·엣지 전부가 기존 dim 값으로 물러난다.
   * 새 모드·토글·URL 상태가 아니라 팝오버 열림과 **동치**다(transient-surface 계약).
   *
   * 값이 아니라 ref 인 이유는 브러싱과 같다 — state 로 올리면 렌즈를 켤 때마다
   * 페이지 트리가 통째로 다시 렌더돼 전환 프레임이 100ms 대로 튄다(실측). 루프가
   * 매 프레임 읽고, 유휴 게이트는 "마지막으로 그린 렌즈 상태"와 비교해 스스로
   * 깨어나므로 렌더 0회로 같은 전환을 얻는다.
   */
  trailLensActiveRef?: RefObject<boolean>;
  /**
   * 「모두 펼치기」·「N개 펼치기」·「접기」의 번역문. 캔버스가 문자열을 만들지
   * 않는다 — 결계 캡션(`realmCaption`)이 이미 쓰는 그 경로 그대로다.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * 걸어온 길 브러싱 — 팝오버에서 hover/focus 중인 행의 노드 id를 담는 **ref**.
   * 렌즈 동안 지도의 호버 채널을 빌려 그 노드에 기존 호버 프리뷰 링을 그린다
   * ("2걸음 전이 어느 노드지"를 숫자 없이 가리켜서 답한다).
   *
   * 왜 값이 아니라 ref 인가: 호버는 행을 훑는 동안 연속으로 바뀌는 신호인데
   * React state 로 올리면 한 번 바뀔 때마다 HomePage 트리 전체가 다시 렌더된다
   * (실측 68~109ms — 호버가 끈적하게 느껴지는 크기다). 프레임 루프는 어차피
   * 매 프레임 ref 를 읽으므로 렌더를 한 번도 돌리지 않고 같은 결과를 얻는다
   * (`tourAnchorRef` 와 같은 계약).
   */
  trailHoverNodeIdRef?: RefObject<string | null>;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 표시-렌즈 티어 게이트 config. 생략 시
   * `DEFAULT_TIER_REVEAL`(개발 모드 — capability/element 모두 정상 줌 반응).
   * HomePage 가 비개발(plain) 모드에서 `PLAIN_TIER_REVEAL`(element 상시 숨김)
   * 을 넘긴다 — 드로우/히트/팬-클램프 전부 이 값 하나로 정합된다.
   */
  tierReveal?: TierRevealConfig;
  /**
   * 가이드 투어 (2026-07-23) — 캔버스 노드 앵커(2·4단계) 프로젝션 대상 노드
   * id, 또는 `null`(해당 단계가 아니거나 앵커 노드를 못 찾음). realm "전개"
   * 버튼과 나란한 블록이 매 프레임 `tourAnchorRef` 의 DOM 에 transform +
   * `--tour-anchor-r` 를 써넣는다.
   */
  tourAnchorNodeId?: string | null;
  /** 가이드 투어 앵커 원 DOM(`TopologyMapV2` 가 렌더, ref 만 공유). */
  tourAnchorRef?: RefObject<HTMLDivElement | null>;
  /**
   * 아이콘 세트 (Phase 5 #21) — 노드 바디 렌더 스타일. `"geometric"`(기본, fill) /
   * `"line"`(stroke-only). kind→실루엣 매핑 불변. DOM 글리프와 같은 스토어를 읽어
   * 함께 스왑. 생략 시 `"geometric"`.
   */
  glyphSet?: GlyphSet;
  /**
   * 캔버스 배경 세트 — `"dot"`(기본, 정적 blueprint grid) / `"flow"`(흐름장) /
   * `"web"`(근접 성좌) / `"gravity"`(중력장). 뒤 셋은 커서에 반응하는 입자
   * 배경이고 앰비언트 휴면을 그대로 탄다. 생략 시 `"dot"`.
   */
  canvasBackground?: CanvasBackground;
  /** 발자국 표현 설정. 생략/`null` 이면 발자국을 그리지 않는다. */
  footprint?: FootprintPreference | null;
  /**
   * 확장 설정 — 펼치기 표시 · 자식 배치 · 한 번에 여는 개수 · 이름을 시도할
   * 개수 · 동시에 펼쳐 둘 부모 수. 생략 시 `DEFAULT_EXPAND`.
   */
  expand?: ExpandPreference;
  /** 휠/세로 스와이프 소유권 — `topology-pointer-handlers.ts` 의 `wheelIntent` 참고. */
  wheelIntent?: "zoom" | "page-scroll";
  /** 앰비언트 휴면 지연 — `TopologyMapV2` 의 `ambientSleepDelayMs` 참고. */
  ambientSleepDelayMs?: number;
}

const EMPTY_EXPANDED_SET: ReadonlySet<string> = new Set();
const EMPTY_TRAIL: readonly string[] = [];

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  /** 방향키로 이웃을 걷는다 (2026-08-09, 갈래 B) — 캔버스의 `onKeyDown`. */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, emphasizedNeighborSlug = null, dataSourceKey = null, fitViewToken, spotlightFitToken = 0, relayoutToken, revealToken = 0, onSelectEdge, onHoverEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, onContextMenuPane, agentFocusNodeId = null, spotlightIds = null, selectedEdge = null, expandedParents = EMPTY_EXPANDED_SET, onToggleCluster, onHoverCluster, realmRootId = null, onEnterRealm, realmEnterButtonRef, realmCaption = null, visitedTrail = EMPTY_TRAIL, trailLensActiveRef, clusterBarLabels = null, trailHoverNodeIdRef, tierReveal = DEFAULT_TIER_REVEAL, tourAnchorNodeId = null, tourAnchorRef, glyphSet = "geometric", canvasBackground = "dot", footprint = null, expand = DEFAULT_EXPAND, wheelIntent = "zoom", ambientSleepDelayMs, onWalkDeadEnd = null } = args;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });
  /**
   * ResizeObserver 가 **잰** 최신 크기. 커밋(캔버스 백킹 크기 교체)은 여기서
   * 하지 않고 rAF 프레임이 가져간다 — 이유는 아래 리사이즈 effect 의 주석.
   */
  const pendingViewportRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  /** 뷰포트 의존 레이어를 다시 지어야 하는가 (크기 정착 후 1회). */
  const viewportRebuildPendingRef = useRef(false);
  /** 지금 적용된 백킹 해상도 배율 — 상호작용 시작/종료에서만 바뀐다. */
  const appliedDprScaleRef = useRef<number | null>(null);
  /** 새 크기가 안 들어온 연속 프레임 수 — `VIEWPORT_SETTLE_FRAMES` 와 비교. */
  const viewportSettleFramesRef = useRef(0);
  const commitViewportSizeRef = useRef<(() => boolean) | null>(null);
  const rebuildViewportLayersRef = useRef<(() => void) | null>(null);
  const worldRef = useRef<TopologyWorld | null>(null);
  const dustPointsRef = useRef<DustPoint[]>([]);
  /** S8 결함 6 — 영역 활성 중 결계 안 우주 도트(뷰포트당 1회 빌드, resize 갱신). */
  const cosmosPointsRef = useRef<DustPoint[]>([]);
  const gridPatternRef = useRef<CanvasPattern | null>(null);
  /**
   * 움직이는 배경(흐름장/근접 성좌/중력장)의 입자 상태 + 오프스크린 버퍼.
   * 변형이 바뀌면 통째로 새로 만든다 — 입자 의미가 변형마다 달라 재사용이
   * 오히려 첫 몇 초를 이상하게 만든다.
   */
  const animatedBgRef = useRef<AnimatedBackground | null>(null);
  /** 커서 스크린 좌표(캔버스 기준). 캔버스 밖이면 null — 배경이 조용해진다. */
  const bgPointerRef = useRef<{ x: number; y: number } | null>(null);
  /** 깊이 도트 세 층의 패턴(정적, 마운트/리사이즈 1회 빌드). */
  const depthDotPatternsRef = useRef<(CanvasPattern | null)[]>([]);
  const depthDotCanvasRef = useRef<HTMLCanvasElement[]>([]);
  // Phase 5 #20/#21 — 개인화 설정 prop 을 매 프레임 읽을 수 있게 ref 미러
  // (tierReveal 선례). 설정 변경 시 아래 effect 가 갱신한다.
  const glyphStyleRef = useRef<"fill" | "line">(glyphSet === "line" ? "line" : "fill");
  const canvasBackgroundRef = useRef<CanvasBackground>(canvasBackground);
  /** 발자국 설정 + 잉크 — 매 프레임 읽으므로 ref 미러(캔버스 배경과 같은 패턴). */
  const footprintPrefRef = useRef<FootprintPreference | null>(footprint ?? null);
  /**
   * 확장 설정 — 프레임 루프가 매 프레임 읽으므로 ref 미러(발자국·배경과 같은
   * 패턴). 설정이 바뀌면 아래 effect 가 갱신하고 **다음 프레임부터** 반영된다.
   */
  const expandPrefRef = useRef<ExpandPreference>(expand);
  const footprintInkRef = useRef<FootprintInk>([232, 196, 122]);
  const footprintStepColorRef = useRef<string>("#e8c47a");
  /**
   * 걸음이 하나 늘어난 순간 — 그 자국만 짧게 도착 모션을 받는다.
   * 길이만 본다(내용 비교 불필요): 트레일은 뒤에만 자란다.
   */
  const footprintTrailLenRef = useRef(0);
  const footprintAppearAtRef = useRef(0);
  /**
   * 앰비언트 휴면 지연 — 프레임 루프가 매 프레임 읽으므로 값이 아니라 ref 다
   * (이 파일이 `canvasBackground` 등에 이미 쓰는 패턴). 값으로 닫으면 루프
   * effect 의 의존성이 되어 프롭이 바뀔 때마다 rAF 루프가 통째로 재시작한다.
   */
  const ambientSleepDelayRef = useRef<number | undefined>(ambientSleepDelayMs);

  // Live force simulation (`model/force-layout.ts`) — seeded off the concentric
  // layout, ticked while warm (`heatRef > 0`) or while a node is pinned.
  const simRef = useRef<ForceSimulation | null>(null);
  const heatRef = useRef(0);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  /** rank4 터치 핀치줌 — 활성 터치 포인터(pointerId → 캔버스 좌표). 핸들러 팩토리는 매 렌더 재생성되므로 훅이 상태를 소유한다. */
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** rank4 — 진행 중 핀치의 직전 프레임 거리/중점(null = 핀치 아님). */
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  /** C1 B1/B2 — the active (or just-released, through its settle burst) drag's tug/settle-restriction set. */
  const dragAffectedSetRef = useRef<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string> } | null>(null);
  /** C1 B1 — the dragged node's world position at grab time (for computing this drag's total displacement Δ). */
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  /** C1 B1 — each tug-affected neighbor's current eased offset (world units), added on top of its natural position. */
  const dragTugOffsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /**
   * 시뮬 프레임 «시작» 좌표 스냅샷 (노드 배열 순서). 프레임 끝에서 이것과
   * 비교해 **정말 움직인 노드**를 뽑고, 파생 기하 갱신을 거기로 좁힌다
   * (`recomputeWorldGeometry(world, tokens, movedIds)`).
   *
   * 「어느 집합이 움직일 예정인가」로 유추하지 않고 실측하는 이유: 한 프레임의
   * 좌표를 쓰는 주체가 셋(힘 적용 · 이웃 터그 · 겹침 완화)인데 셋의 사정거리가
   * 서로 다르다. 유추하면 언젠가 하나를 빠뜨리고, 그 증상은 «엣지가 노드에서
   * 떨어져 보이는» 가시 결함이다.
   */
  const geomPrevXRef = useRef<Float64Array | null>(null);
  const geomPrevYRef = useRef<Float64Array | null>(null);
  /**
   * 직전 프레임에 **겹침 완화가 민** 노드들 중 힘-적용 집합 밖의 것.
   *
   * 이 프레임의 `applyForcePositions` 가 이들의 좌표를 sim 값으로 되돌리는 것이
   * 종전 동작이라, 좁힌 write-back 에도 그 되돌림을 남기려면 대상에 포함해야
   * 한다. (되돌림 자체의 타당성은 별개 문제다 — 여기서는 동작을 바꾸지 않는다.)
   */
  const sepDisplacedIdsRef = useRef<Set<string>>(new Set());
  /** C1 B3 — active auto-arrange homing springs, keyed by node id; empty/absent when no relayout is in flight. */
  const homeSpringsRef = useRef<Map<string, HomeSpringState>>(new Map());
  const homingActiveRef = useRef(false);
  /**
   * 결계 불변식 (소유자 실보고 2026-07-23, 루트가 자기 결계 밖) — 영역 active 중
   * 호밍의 노드별 목표 오버라이드. null 이면 전역 `homeX`/`homeY`, 영역 중엔
   * `insideTargets`(영역 좌표계) 가 목표다. 전역 홈으로 호밍하면 결계 원은 영역
   * 원점에 남는데 노드는 스파인 좌표로 날아가 "루트가 원 밖" 이 됐다. 호밍
   * 수렴/취소 시 함께 클리어.
   */
  const homeTargetOverrideRef = useRef<ReadonlyMap<string, { x: number; y: number }> | null>(null);
  /** 결계 불변식 — 직전 프레임의 pin-drag 노드 id (릴리즈 전이 감지). */
  const prevPinnedNodeIdRef = useRef<string | null>(null);

  // --- S4 "영역 전개" 상태 ---
  /** 전환 상태기계 (idle/entering/active/exiting). */
  const realmTransitionRef = useRef<RealmTransitionState>(INITIAL_REALM_TRANSITION_STATE);
  /** 현재 영역의 전환 시작 데이터(서브트리·재배치 좌표·결계·이탈 출발점). */
  const realmDataRef = useRef<RealmRuntimeData | null>(null);
  /**
   * S8 결함 5 — active 정착 후 좌표 소유권을 일반 경로(드래그/sim/호밍)에 넘겼는가.
   * active 페이즈가 매 프레임 `node.x = insideTargets` 로 덮어쓰면 드래그와 싸워
   * 노드가 안 움직였다(소유자 실보고). 정착 첫 프레임에 한 번 스냅 + sim 재시드
   * 후 이 플래그를 세우고, 이후 active 프레임은 좌표를 건드리지 않는다. 진입/이탈
   * 시 false 로 리셋.
   */
  const realmActiveHandedOffRef = useRef(false);
  /**
   * S9 결함 2 — 결계 반경 재적합 이징 상태. 매 프레임 **가시 멤버**(밀도 게이트
   * 접힘 제외)로 목표 반경을 측정해 240ms 이징으로 옮긴다(칩 확장/접힘 시에만
   * 1회 이징 — 지속 애니메이션 없음). 진입마다 null 로 리셋해 첫 프레임이 초기
   * 반경으로 스냅 시드한다.
   */
  const wardingFitRef = useRef<WardingFitState | null>(null);
  // 직전 `realmRootId`(전환 진입/이탈 diff). null 로 초기화하는 게 핵심:
  // `?realm=slug` 딥링크로 마운트하면 prev(null) ≠ realmRootId(slug) 라 첫
  // effect 가 영역 진입을 발화한다(공유 링크·에이전트가 영역을 그대로 재현).
  const prevRealmRootIdRef = useRef<string | null>(null);
  /** 궤도 "전개" 버튼이 지금 겨냥한 노드 slug (버튼 클릭이 읽는다). */
  const realmEnterTargetRef = useRef<string | null>(null);
  /** onEnterRealm prop 미러 (버튼 리스너 클로저용). */
  const onEnterRealmRef = useRef<typeof onEnterRealm>(onEnterRealm);
  /** 궤도 버튼 DOM 미러 (rAF 마운트 전용 effect 가 prop ref 를 dep 으로 걸지 않게). */
  const realmEnterButtonElRef = useRef<HTMLButtonElement | null>(null);
  /** 가이드 투어 앵커 원 DOM 미러 — 같은 이유(realm 버튼과 동형). */
  const tourAnchorElRef = useRef<HTMLDivElement | null>(null);
  // --- S5 깊이 시차 (영역 active 중 카메라 입력 반응) ---
  /** depth2(capability 링) 시차 오프셋(월드 단위). 카메라 정지 시 0 수렴. */
  const realmParallaxDepth2Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);
  /** depth3+(element 링) 시차 오프셋(월드 단위). */
  const realmParallaxDepth3Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);
  /** 직전 프레임 카메라 중심(월드) — 시차 델타 계산. null=이전 표본 없음. */
  const prevCameraCenterRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * 이번 프레임 시차 데이터(밴드별 오프셋 + depthById). rAF 가 매 프레임 갱신,
   * 포인터 히트테스트가 읽어 드로우와 **같은** 오프셋으로 클릭을 맞춘다. 영역
   * active + 오프셋 유의미할 때만 non-null.
   */
  const realmParallaxRef = useRef<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>(null);
  /**
   * S10 결함 3 — 이번 프레임의 깊이 기반 티어 kind 오버라이드. rAF 가 드로우와
   * **같은 게이트**로 매 프레임 채우고(영역 비활성이면 null), 포인터 히트테스트가
   * 읽어 depth1 element 자식이 그려질 때 함께 잡히게 한다.
   */
  const realmTierKindsRef = useRef<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>(null);
  /** 영역 루트의 contains 조상 체인 캐시 — 바깥 밀도 게이트가 영역 내부를 가리지 않게 펼침 취급할 집합. */
  const realmExpandChainRef = useRef<{ rootId: string; chain: ReadonlySet<string> } | null>(null);
  /** 결계 센서스 캡션 prop 미러 — rAF 프레임 클로저가 최신 문구를 읽는다. */
  const realmCaptionRef = useRef<string | null>(realmCaption);
  realmCaptionRef.current = realmCaption;
  // 막대 문구 미러 — 히트테스트와 드로우가 **같은 문자열**로 폭을 잰다.
  const clusterBarLabelsRef = useRef<ClusterBarLabels | null>(clusterBarLabels);
  clusterBarLabelsRef.current = clusterBarLabels;

  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });
  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
  /**
   * WCAG 2.2 §2.3.3 — "누가 카메라를 마지막으로 움직였나". 포인터 핸들러의
   * 제스처(휠·핀치·팬·플릭)가 true 로, 이 파일의 **프로그램적** 이동(ego
   * 다이브·fit·결계·초기 스냅)이 false 로 되돌린다. `stepTopologyPhysics` 가
   * 이 값으로 reduced-motion 카메라 스냅을 앱 개시 이동에만 한정한다 —
   * 사용자가 개시한 줌/팬은 표준이 명시적으로 예외로 두는 항목이고, 그걸
   * 자르면 뷰포트 전체가 한 프레임에 순간이동해 오히려 더 나쁘다.
   */
  const userDrivenCameraRef = useRef(false);
  /**
   * S3 마감 폴리시 (fable 설계) — the live cubic camera transition, or null.
   * Set by `beginCameraTween` on every programmatic move (focus dive, cluster
   * dive, fit/relayout); driven each frame in the rAF loop; cleared the instant
   * an interactive gesture (wheel/drag) takes over. Never set under
   * `prefers-reduced-motion` (the spring path snaps instead).
   */
  const cameraTweenRef = useRef<CameraTween | null>(null);
  const dampingRef = useRef(1.0);
  /**
   * Dive-zoom fix (owner: "줌 인/아웃이 느림") — which spring angular frequency
   * this frame's camera step uses. `null` until the first token read (the rAF
   * loop falls back to `cameraSpringAngFreqTransition` for that first frame).
   * Set to `cameraSpringAngFreqInteractive` on every live wheel tick
   * (`topology-pointer-handlers.ts#handleWheel`); reset to
   * `cameraSpringAngFreqTransition` by every PROGRAMMATIC camera move below
   * (initial snap, fit/relayout, focus dive/deselect) so that move's whole
   * settle plays out at the cinematic rate, not whatever the last wheel tick
   * left behind.
   */
  const cameraAngularFreqRef = useRef<number | null>(null);
  const overviewScaleRef = useRef(1);
  const hasInitializedRef = useRef(false);
  /**
   * 마지막으로 오버뷰를 맞춰 준 **출처**. 월드가 다시 지어질 때 이 값과 다르면
   * 초기 맞춤을 한 번 더 돌린다 (`dataSourceKey` prop 의 주석 참고).
   */
  const fittedDataSourceKeyRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef(0);
  // FIX (QA first-light pass, blocker 2 continued): `useEffect(fn, [relayoutToken,
  // fitViewToken])` also fires once on mount (standard React behavior, not just
  // on token changes) — it used to be harmless because it recomputed the exact
  // same tight-bounding-fit target `trySnapInitialCamera` had just set. Now that
  // the initial camera intentionally starts at the *simplified* overview scale
  // (`computeOverviewCameraTarget`), that same mount-time fire was immediately
  // overwriting it back to the full/tight fit — the reduced-density fix never
  // visibly took effect. Captured once (lazy initializer runs exactly once,
  // even under React StrictMode's dev-only double-invoke of effects — a plain
  // "have I run before" boolean ref does NOT survive that double-invoke
  // safely, since the mount/cleanup/remount cycle flips it back and forth).
  // The effect below skips whenever both tokens still equal their captured
  // mount-time values — i.e. no real "fit view"/relayout click happened yet.
  const initialFitTokensRef = useRef({ relayout: relayoutToken, fitView: fitViewToken });
  // 마운트 시점 값 — 위 fit 들과 같은 이유로 첫 발화를 건너뛴다.
  const initialSpotlightFitTokenRef = useRef(spotlightFitToken);
  /*
   * **밀린 맞춤** — 딥링크로 들어온 세션을 위해 (2026-08-02, 모션석 감사가
   * 잡았다).
   *
   * `?recent=` 가 URL 에 이미 있는 채로 마운트하면 토큰이 **마운트 직후 한 번**
   * 올라가는데, 그 순간 지도는 아직 레이아웃 전이라 아래 가드
   * (`!hasInitializedRef.current`)에 걸려 **조용히 반환**된다. 토큰은 다시 안
   * 바뀌므로 **영영 안 움직인다** — 기록 화면에서 보낸 사람이 강조 노드가 화면
   * 밖인 기본 오버뷰에 착지한다. 고치려던 바로 그 증상이다.
   *
   * 그래서 「지금 못 하면 버린다」가 아니라 **「빚으로 남긴다」**로 바꾼다.
   * 초기화가 끝나는 자리에서 한 번 갚고 지운다.
   */
  const pendingSpotlightFitRef = useRef(false);
  /** 최신 `runSpotlightFit` 을 지역 함수에서 부르기 위한 손잡이(낡은 클로저 방지). */
  const runSpotlightFitRef = useRef<(() => boolean) | null>(null);
  // C1 B3 — same mount-skip pattern, but for the DEDICATED relayout-only
  // effect below (node-position homing), which must not fire on mount either.
  const initialRelayoutTokenRef = useRef(relayoutToken);

  const pointerMachineRef = useRef<PointerMachineState>(INITIAL_POINTER_MACHINE_STATE);
  const dragHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const camStartAtDownRef = useRef({ x: 0, y: 0 });
  const canvasRectRef = useRef<{ left: number; top: number } | null>(null);

  const focusedSlugRef = useRef<string | null>(focusedSlug);
  const lastFocusedSlugRef = useRef<string | null>(focusedSlug);
  const panelEmphasisNodeIdRef = useRef<string | null>(emphasizedNeighborSlug);
  const hoveredNodeIdRef = useRef<string | null>(null);
  /** P3c — 호버 중 엣지 (드로우 잉크 강조 + 마이크로카드 공유 상태). */
  const hoveredEdgeRef = useRef<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null>(null);
  /** 엣지 선택(페어 포커스) prop 미러 — rAF 클로저용. */
  const selectedEdgeRef = useRef<{ sourceId: string; targetId: string } | null>(selectedEdge);
  /** 발자국 트레일 prop 미러 — rAF 클로저가 매 프레임 최근성 rank 를 만든다. */
  const visitedTrailRef = useRef<readonly string[]>(visitedTrail);
  /**
   * 걸어온 길 렌즈 keep-set — `visitedTrail` 이 바뀔 때만 제자리(clear+add)로
   * 갱신한다. 60fps 루프 안에서 매 프레임 Set 을 새로 만들지 않기 위한 것
   * (프레임 예산: 렌즈로 늘어나는 per-frame 할당 0).
   */
  const visitedTrailSetRef = useRef<Set<string>>(new Set(visitedTrail));
  /**
   * 마지막으로 **그린** 렌즈 상태. 유휴 게이트가 이걸 현재 ref 와 비교해
   * "렌즈가 방금 바뀌었다"를 활동으로 친다 — 렌즈는 React state 가 아니라
   * ref 라 effect 로 깨울 수 없으므로, 깨우기 책임을 프레임 게이트가 진다.
   */
  const drawnTrailLensRef = useRef(false);
  /** 걸어온 길 렌즈/브러싱 prop ref 미러 — rAF 클로저가 deps 없이 최신 것을 읽게 (`tourAnchorRef` 와 같은 미러 관용). */
  const trailLensPropRef = useRef<RefObject<boolean> | null>(trailLensActiveRef ?? null);
  const trailBrushPropRef = useRef<RefObject<string | null> | null>(trailHoverNodeIdRef ?? null);
  /** 밀도 게이트 — 펼친 부모 Set 미러(rAF + 포인터 클로저 공용). */
  const expandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);
  /** S2 파트 5B — 직전 펼침 Set (새로 펼쳐진 부모 diff → 카메라 다이브용). */
  const prevExpandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);
  /** 밀도 게이트 — 이번 프레임의 클러스터 칩(월드 anchor). 히트테스트가 읽는다. */
  const clusterChipsRef = useRef<readonly ClusterChip[]>([]);
  /**
   * S3 마감 폴리시 (fable 설계, S2 known gap) — 이번 프레임에 **그리지 않은**
   * 노드 집합(밀도게이트 접힘 + 선택적 ego 로 숨긴 이웃). 포인터 히트테스트가
   * 읽어 숨은 노드를 클릭/호버 대상에서 제외한다(그리지 않으면 잡히지 않는다).
   */
  const clusteredIdsRef = useRef<ReadonlySet<string>>(EMPTY_EXPANDED_SET);
  /** 밀도 게이트 — 호버 중인 클러스터 부모 id(칩 보더 강조 + 커서). */
  const hoveredClusterIdRef = useRef<string | null>(null);
  /**
   * S2 파트 3a — 선택적 ego 의 점등 배치 수(세션 임시). 1 = 상위 24 이웃만,
   * `이웃 +N` 칩 클릭마다 +1. 포커스 변경 시 1 로 리셋(아래 focus 효과).
   */
  const egoRevealBatchesRef = useRef(1);
  /**
   * 고팬아웃 배치-공개(2026-07) — 펼친 클러스터 부모별 점등 배치 수(parentId →
   * 배치 수, 기본 1 = 상위 24 자식). `+N 더보기` 칩 클릭마다 그 부모만 +1(URL
   * 비영속·세션 임시). 접힌 부모는 프레임 배치 처리부에서 정리한다. `이웃 +N`
   * 의 단일 `egoRevealBatchesRef` 를 부모별로 일반화한 것 — 펼침은 여러 부모가
   * 동시에 존재할 수 있기 때문.
   */
  const clusterRevealBatchesRef = useRef<Map<string, number>>(new Map());
  /**
   * 고팬아웃 배치-공개 — 배치로 이번에 드러난 자식의 등장 램프(childId → 0..1).
   * DOI 순 center-out stagger 로 0→1 수렴한다(시작 시각은 `batchAppearStartRef`).
   * `drawTopologyFrame` 이 자식 draw 알파 + 미세 appearScale(0.6→1)에 곱한다 —
   * 펼침 그룹 페이드(chipReveal)를 이 per-child stagger 로 대체(이중 페이드 방지).
   * reduced-motion 은 즉시 1.
   */
  const batchAppearRef = useRef<Map<string, number>>(new Map());
  /**
   * 고팬아웃 배치-공개 — 배치 자식별 등장 램프의 시작 절대 시각(childId → ms,
   * `performance.now()` 동일 시계). `scheduleRipple`(base 0 + i·rippleStaggerMs,
   * rippleStaggerMaxMs 예산 cap 재사용)로 DOI rank i 순으로 채운다. 시작 전엔
   * 램프가 0 에 머물러 "느린 열거" 없이 총 예산 안에서 압축 stagger 된다.
   */
  const batchAppearStartRef = useRef<Map<string, number>>(new Map());
  /** 고팬아웃 배치-공개 — 직전 프레임에 배치로 보이던 자식(신규-공개 diff 용). */
  const prevBatchVisibleRef = useRef<Set<string>>(new Set());
  const emphasisRef = useRef<Map<string, number>>(new Map());
  /** C1 A2 — ego tier-reveal ramp, stepped in `stepTopologyPhysics`, consumed by `drawTopologyFrame`. */
  const egoRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * Click-focus signature — per-node 0..1 color ramp, stepped in
   * `stepTopologyPhysics`, consumed by `drawTopologyFrame` to lerp normal↔dim/
   * ego color + ease the center radius. Sibling to `emphasisRef`/`egoRevealRef`.
   */
  const focusRampRef = useRef<Map<string, number>>(new Map());
  /**
   * rank7 — 클러스터 칩 펼침/접힘 reveal 램프(parentId → 0..1). 펼친 부모는 1 로,
   * 접힌 부모는 0 으로 `--topology-v2-cluster-reveal-tau` 에 exp 수렴한다. 프레임
   * 루프가 매 프레임 스텝하고, `drawTopologyFrame` 이 ① 펼친 디스크 자식의 draw
   * 알파에 곱해 등장 페이드를, ② `drawClusterChip` 의 pill/badge 알파 페이드인을
   * 만든다. `stepEmphasis`(focus-state) 재사용. reduced-motion 은 즉시 스냅.
   */
  const chipRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * 다섯째 티어 관통 채널 — **칩 펼침으로 드러난 자식**의 0..1 램프.
   * 앞의 넷(엣지 선택 · 발자국 · ego · 스포트라이트)과 같은 문법이다.
   *
   * **`clusterRevealTau` 를 쓴다 — 칩 자신의 형태 전환과 같은 값이다.**
   * 처음엔 `egoRevealRiseTau`(0.22)를 빌려 썼는데, 그건 *다른 사건*(ego
   * 클릭)의 리듬이었다. 이 채널을 낳는 입력은 칩 클릭이고, 그 입력의 리듬은
   * 이미 `clusterRevealTau`(0.17)로 정해져 있다 — 칩의 pill/badge 페이드가
   * 그 값을 쓴다. `design.md` 의 **"한 입력 = 한 사건"** 이 요구하는 것이
   * 정확히 이 일치다.
   *
   * ⚠️ 그리고 이 채널은 드로우에서 **그룹 페이드를 대체한다**
   * (`topology-frame-draw.ts` 의 `revealMul`). 둘 다 걸면 알파가 두 지수의
   * **곱**이 되어, 칩이 "펼쳐졌다"고 말한 뒤로도 자식이 한참 오는 중이다
   * (실측: 칩 90% 도달 391ms vs 자식 621ms — 230ms 차, 120ms 임계 초과).
   * 같은 파일이 `batchAppear` 에 대해 "이중 페이드 방지"라고 적어 둔 가드에
   * 이 채널이 나중에 붙느라 안 들어갔던 것이다.
   */
  const expandRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * rank8 — 신규 노드 등장 램프(nodeId → 0..1). world 재빌드 시 이전 id 집합과
   * diff 해 **신규** 노드에만 0 을 심고(기존 노드는 1 유지 → 회귀 0), 프레임 루프가
   * 1 로 수렴시킨다. `drawTopologyFrame` 이 effRadius(0.6→1 미세 scale)와 globalAlpha
   * (0→1)에 곱해 노드가 "툭" 나타나지 않고 부풀며 등장하게 한다. reduced-motion 은
   * 즉시 1. 첫 빌드(이전 집합 없음)는 전부 1 로 심어 초기 로드 연출과 충돌 방지.
   */
  const appearRef = useRef<Map<string, number>>(new Map());
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  /**
   * rank9 — 라벨별 LOD present 램프(nodeId → 0..1). `drawTopologyFrame` 이 배치
   * 결과를 알고 그 자리에서 스텝/소비한다(루프는 수명만 소유). 라벨 깜빡임을
   * 페이드로 바꾼다.
   */
  const labelPresentRef = useRef<Map<string, number>>(new Map());
  /**
   * Click-focus signature — the focus classification the COLOR ramp reads from,
   * held for the ~160ms fade after a deselect so the dim/ego target the colors
   * ease FROM persists instead of snapping to normal (④·⑨). Mirrors the live
   * focus while a selection is active, then lingers until the retained subject's
   * ramp decays to ~0 (see the per-frame update after `stepTopologyPhysics`).
   */
  const colorFocusRef = useRef<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string } | null } | null>(null);
  const rippleStartRef = useRef<Map<string, number>>(new Map());
  const reducedMotionRef = useRef(false);
  /**
   * Canvas-emphasis slice §B2 — the just-committed selection's one-shot
   * commit-pulse anchor (which node, and when it was clicked). Set once per
   * NEW selection by the "focused slug change" effect below, never mutated
   * per-frame — `drawTopologyFrame` derives `now - startAtMs` itself every
   * frame and lets `model/selection-pulse.ts#computeSelectionPulse` decide
   * when the pulse has expired (no cleanup timer needed; an expired pulse
   * just draws nothing).
   */
  const selectionPulseRef = useRef<{ nodeId: string; startAtMs: number } | null>(null);
  /**
   * R6 호버 펄스 — 활성 일회성 신호 리스트. 포인터 핸들러가 호버 시 발사(append),
   * 프레임 루프가 매 프레임 만료 제거(`updatePulses`) 후 드로우로 넘긴다.
   */
  const pulsesRef = useRef<Pulse[]>([]);
  /**
   * R6 상시 혜성 — 월드에 depends 엣지가 하나라도 있는가(유휴 게이트용, 월드
   * 빌드 시 1회 계산). 없으면 코멧이 없어 유휴 판정이 성립한다.
   */
  const hasDependsEdgesRef = useRef(false);
  /**
   * Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 contains 엣지도 코멧이
   * 흐르므로, 포커스가 걸려 있고 그래프에 contains 엣지가 하나라도 있으면
   * 유휴 게이트가 얼지 않아야 한다(정확한 "이 포커스 노드에 물린 캡 안쪽
   * 엣지가 있는가"까지는 굳이 안 따진다 — `hasDependsEdgesRef`와 같은 결의
   * 월드-단위 coarse 플래그로 충분하고, 포커스가 없으면 어차피 깨어있을
   * 이유가 없다).
   */
  const hasContainsEdgesRef = useRef(false);
  /** A2 — 마지막 활동 시각. 활동 플래그가 참인 프레임마다 갱신. */
  const lastActiveMsRef = useRef(0);
  /**
   * 앰비언트 휴면 — 마지막 **사용자 입력** 시각. `lastActiveMsRef` 와 다른
   * 것이 요점이다: 저쪽은 "앰비언트 모션이 도는 중"에도 매 프레임 갱신되므로
   * 영원히 최신이라, 그 값으로는 "사람이 손을 놓았는가"를 절대 알 수 없다.
   * 이 ref 는 포인터·휠만 갱신한다 (2026-07-28 카운슬 「작업대」 P0).
   */
  // 렌더 중 `performance.now()` 는 불순 호출이라 lint 가 막는다(react-hooks/refs).
  // 0 으로 두는 것이 의미상으로도 맞다 — `performance.now()` 의 원점이 곧 네비게이션
  // 시각이므로, "입력이 0시에 있었다" 는 "페이지를 연 뒤로 아직 안 만졌다" 와 같다.
  // 그 상태로 30초가 지나면 잠드는 것이 의도한 동작이다.
  const lastInputMsRef = useRef(0);
  /** A2 — 직전 프레임 카메라 값 (움직임 감지용). */
  const prevCameraSampleRef = useRef<{ x: number; y: number; s: number } | null>(null);
  /** W6 agent visibility — mirrors `agentFocusNodeId` prop into a ref for the rAF closure, same pattern as `focusedSlugRef`. */
  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);
  /** 가이드 투어 — `tourAnchorNodeId` prop 미러(같은 패턴). */
  const tourAnchorNodeIdRef = useRef<string | null>(tourAnchorNodeId);
  /** 스포트라이트 — prop 미러(같은 패턴) + on/off 지수 램프(0..1, 프레임 바디가 step). */
  const spotlightIdsRef = useRef<ReadonlySet<string> | null>(spotlightIds);
  const spotlightRampRef = useRef(0);
  /**
   * 「걸어온 길」 렌즈 세기 0..1 — 스포트라이트와 **같은** 지수 램프를 쓴다
   * (신규 easing 0). 팝오버를 닫아도 이 값이 0 에 닿을 때까지 렌즈 집합을 계속
   * 넘겨 트레일 잉크가 램프로 소멸한다.
   */
  const trailLensRampRef = useRef(0);
  /** M-5 — mirror the tier-change callback into a ref for the rAF closure, and
   * track the last emitted tier so the callback fires only on transitions. */
  const onZoomTierChangeRef = useRef<typeof onZoomTierChange>(onZoomTierChange);
  const lastZoomTierRef = useRef<ZoomTier | null>(null);
  /** 슬라이스 C — 티어 게이트 config 미러(같은 패턴). rAF 클로저 + 포인터 핸들러가 공유. */
  const tierRevealRef = useRef<TierRevealConfig>(tierReveal);

  /**
   * S3 마감 폴리시 (fable 설계) — begin a cubic ease-in-out camera transition
   * from the live camera to `target` (van Wijk 정신, 거리 비례 duration). The
   * rAF loop drives it via `easeCameraKeyframe`. Under `prefers-reduced-motion`
   * it no-ops (clears any tween) so the physics-step reduced snap owns the jump.
   * Stable identity (refs only) so listing it in the programmatic-move effects'
   * deps never re-fires them.
   */
  /**
   * 카메라 목표 계산에 쓸 토큰 — **좌·우 안전 인셋만 실측값으로 바꾼다.**
   *
   * ## 왜 (2026-08-10, 프로브가 드러낸 것)
   *
   * `topology-camera-math` 는 **이미** 안전 인셋으로 패널을 피한다. 그런데 그 값이
   * CSS 토큰이라 정적이고, 실제 기하는 상태에 따라 바뀐다. 실측(1512×982):
   * 토큰은 좌 78 · 우 120 인데, 실제는 **선택 전 좌 324 · 우 0**, **선택 후 좌 0 ·
   * 우 384** 였다(선택하면 INDEX 가 접히고 팝오버가 열린다).
   *
   * 어제 나는 이 사실을 모르고 **선택 경로에만 두 번째 보정**(자유 영역 시프트)을
   * 얹었다. 그건 같은 관심사의 둘째 체계이고, 그래서 한 번은 188px 어긋나고 한 번은
   * 64px 과보정됐다. 옳은 처방은 시프트를 더 만드는 게 아니라 **이미 있는 인셋에
   * 참값을 먹이는 것**이다.
   *
   * ## 왜 좌·우만, 왜 카메라 목표에만
   *
   * `safeInsetTop`(148)은 상단 도구 레인과 도킹 칩, `safeInsetBottom`(96)은 **라벨
   * 자리 예약**이다(그 예약이 없어 최하단 라벨이 조용히 사라진 사고가 있었다) —
   * 「덮는 패널」이 아니라 레이아웃 약속이라 측정으로 대체하면 그 사고가 돌아온다.
   *
   * 그리고 `safeInset*` 는 **라벨 컬링**(`topology-frame-draw`)도 읽는다. 전역으로
   * 덮으면 카메라와 무관한 관심사를 건드리므로, 목표를 계산하는 자리에서만 갈아 끼운다.
   *
   * 토큰값과 **큰 쪽**을 쓴다 — 토큰이 패널 말고 다른 이유로 예약한 폭을 잃지 않는다.
   */
  const cameraTokens = useCallback(<T extends { safeInsetLeft: number; safeInsetRight: number }>(tokens: T): T => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return tokens;
    const box = canvasEl.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return tokens;
    const measured = measureCanvasInsets(canvasEl, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
    return {
      ...tokens,
      safeInsetLeft: Math.max(tokens.safeInsetLeft, measured.left),
      safeInsetRight: Math.max(tokens.safeInsetRight, measured.right),
    };
  }, []);

  const beginCameraTween = useCallback((target: CameraTarget, durationOverrideMs?: number) => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    cameraTweenRef.current = { start, target: tgt, startMs: performance.now(), durationMs: durationOverrideMs ?? cameraTransitionDurationMs(start, tgt) };
  }, []);

  useEffect(() => {
    onZoomTierChangeRef.current = onZoomTierChange;
  }, [onZoomTierChange]);

  useEffect(() => {
    onEnterRealmRef.current = onEnterRealm;
  });

  useEffect(() => {
    realmEnterButtonElRef.current = realmEnterButtonRef?.current ?? null;
  });

  useEffect(() => {
    tourAnchorElRef.current = tourAnchorRef?.current ?? null;
  });

  useEffect(() => {
    trailLensPropRef.current = trailLensActiveRef ?? null;
    trailBrushPropRef.current = trailHoverNodeIdRef ?? null;
  });

  useEffect(() => {
    focusedSlugRef.current = focusedSlug;
    // 선택/해제는 정적 상태 전이 — 유휴 스킵 중에도 한 번 다시 그린다
    // (selectedEdge 효과와 대칭). 해제 시 이 wake 가 없으면 retained
    // colorFocus 페이드가 유휴 게이트에 얼어 링이 풀 opacity 로 남는다.
    // 이벤트 출처(빈-클릭 pointer · Escape key · 패널 X-close DOM 버튼)와
    // 무관하게 focusedSlug→null 전이만으로 페이드를 보장한다.
    lastActiveMsRef.current = performance.now();
  }, [focusedSlug]);

  useEffect(() => {
    agentFocusNodeIdRef.current = agentFocusNodeId;
  }, [agentFocusNodeId]);
  useEffect(() => {
    tourAnchorNodeIdRef.current = tourAnchorNodeId;
  }, [tourAnchorNodeId]);
  useEffect(() => {
    spotlightIdsRef.current = spotlightIds;
  }, [spotlightIds]);
  // Phase 5 #21 — 아이콘 세트 변경 시 다음 프레임부터 새 렌더 스타일.
  useEffect(() => {
    glyphStyleRef.current = glyphSet === "line" ? "line" : "fill";
  }, [glyphSet]);
  // 확장 설정 변경 — 다음 프레임부터 새 표시/배치/개수. 값만 갈아끼우므로
  // 월드 재빌드 없이 즉시 반영된다(배치는 아래 레이아웃 effect 가 다시 푼다).
  useEffect(() => {
    expandPrefRef.current = expand;
  }, [expand]);
  /**
   * 캔버스 배경 변경 — 도트면 입자 엔진을 **버리고**, 아니면 그 변형으로 새로
   * 만든다. 도트에서 엔진을 살려 두면 보이지도 않는 버퍼를 매 프레임 굴린다.
   */
  useEffect(() => {
    canvasBackgroundRef.current = canvasBackground;
    animatedBgRef.current?.dispose();
    if (canvasBackground !== "web") {
      animatedBgRef.current = null;
      return;
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => {
      const raw = rootStyle.getPropertyValue(name).trim();
      return raw === "" ? fallback : raw;
    };
    const inkMax = Number(read("--canvas-bg-ink-max", "0.08"));
    animatedBgRef.current = createAnimatedBackground("web", {
      inkMax: Number.isFinite(inkMax) ? inkMax : 0.08,
      particleRgb: read("--canvas-bg-particle-rgb", "150, 165, 220"),
    });
    return () => {
      animatedBgRef.current?.dispose();
      animatedBgRef.current = null;
    };
  }, [canvasBackground]);

  /**
   * 발자국 설정 + 잉크 — 색 2택을 토큰에서 읽어 RGB 로 푼다. 캔버스는 CSS 변수를
   * 못 읽으므로 여기서 한 번 푼다(설정이 바뀔 때만, 프레임마다가 아니다).
   */
  useEffect(() => {
    footprintPrefRef.current = footprint;
    if (!footprint) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const hex = rootStyle
      .getPropertyValue(footprint.tone === "indigo" ? "--color-footprint-trail-indigo" : "--color-footprint-trail")
      .trim();
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (parsed) {
      const n = parseInt(parsed[1], 16);
      footprintInkRef.current = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      footprintStepColorRef.current = hex.startsWith("#") ? hex : `#${parsed[1]}`;
    } else {
      // 토큰이 없거나 rgba() 형태 — 기본 앰버로 폴백한다(발자국이 사라지는 것보다 낫다).
      footprintInkRef.current = footprint.tone === "indigo" ? [200, 210, 255] : [232, 196, 122];
      footprintStepColorRef.current = footprint.tone === "indigo" ? "#c8d2ff" : "#e8c47a";
    }
  }, [footprint]);

  /**
   * 커서 위치 추적 — 움직이는 배경만 쓴다. 큰 포인터 핸들러 팩토리를 건드리지
   * 않고 네이티브 리스너로 좌표만 받는다(그쪽은 히트 테스트·드래그·핀치를
   * 소유하고 있어, 배경 좌표 하나 때문에 그 계약에 손대는 것은 값이 비싸다).
   * `passive` 라 스크롤/줌 성능에 영향이 없다.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      bgPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      bgPointerRef.current = null;
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // 앰비언트 휴면 지연 — 표면마다 다르다(관문은 짧다). 자기 의존성으로 둔다.
  useEffect(() => {
    ambientSleepDelayRef.current = ambientSleepDelayMs;
  }, [ambientSleepDelayMs]);

  useEffect(() => {
    tierRevealRef.current = tierReveal;
  }, [tierReveal]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
    // 선택 변경은 정적 상태 전이 — 유휴 스킵 중에도 한 번 다시 그린다.
    lastActiveMsRef.current = performance.now();
  }, [selectedEdge]);

  useEffect(() => {
    const prev = prevExpandedParentsRef.current;
    prevExpandedParentsRef.current = expandedParents;
    expandedParentsRef.current = expandedParents;
    // 밀도 게이트: 확장 토글 = 정적 상태 전이 → 유휴 스킵 중에도 wake 해서
    // 접힌 자식이 나타나거나 사라진 결과를 즉시 다시 그린다 (selectedEdge 패턴).
    lastActiveMsRef.current = performance.now();

    // S2 파트 5B — 새로 펼쳐진 부모(있으면 하나)로 카메라 다이브. 접기(제거)만
    // 있으면 카메라는 유지한다(소유자 지시). 자식은 카메라가 디스크로 들어가며
    // tier 알파로 자연 리빌된다(기존 램프 재사용 — 신규 모션 계약 없음).
    let newlyExpanded: string | null = null;
    for (const id of expandedParents) {
      if (!prev.has(id)) {
        newlyExpanded = id;
        break;
      }
    }
    if (newlyExpanded === null) return;
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    // 고팬아웃 배치-공개 — 다이브는 전량 디스크가 아니라 **이번 배치**(DOI 상위
    // EGO_NEIGHBOR_LIMIT 자식)의 bbox 에 fit 한다. 소수를 크게 — 108 자식을
    // 통째로 담으려 멀리 빼는 대신, 실제로 그려지는 상위 24 만 담아 크게 본다.
    // 잔여는 접혀 있으므로 프레이밍에 넣을 필요가 없다(density-gate domain 면제
    // 와 동일 규칙으로 게이트 자식만 랭크). 자식이 임계 이하면 restrict 없음.
    const gatedChildren = (world.childrenByParent.get(newlyExpanded) ?? []).filter(
      (c) => world.nodeById.get(c)?.kind !== "domain",
    );
    // 배치 크기는 설정(「확장 → 한 번에 여는 개수」)이 정한다 — 프레이밍이
    // 실제로 그려지는 수와 어긋나면 「담으려던 것」과 「보이는 것」이 갈린다.
    const batchSize = expandPrefRef.current.batchSize;
    let batchRestrict: Set<string> | null = null;
    if (gatedChildren.length > batchSize) {
      const ranked = rankEgoNeighborsByDOI(
        gatedChildren.map((id) => ({
          id,
          kind: world.nodeById.get(id)?.kind ?? "element",
          degree: world.neighborMap.get(id)?.size ?? 0,
          // childrenByParent 는 containment(parentId ← contains) 유도라 전원
          // contains — 균일 가중치라 상대 순서는 종전과 동일(결정론 유지).
          relationType: "contains",
        })),
      );
      batchRestrict = new Set<string>([newlyExpanded, ...ranked.slice(0, batchSize)]);
    }
    const target = computeClusterFitTarget(world, tokens, width, height, newlyExpanded, overviewEntryScale, batchRestrict);
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    // 프로그램적 카메라 이동 — 큐빅 ease-in-out 트윈(reduced-motion 은 스프링에
    // 위임). angfreq 는 트윈 종료 후/중단 시 스프링이 이어받을 때의 값.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(target);
  }, [expandedParents, beginCameraTween]);

  useEffect(() => {
    panelEmphasisNodeIdRef.current = emphasizedNeighborSlug;
  }, [emphasizedNeighborSlug]);

  useEffect(() => {
    visitedTrailRef.current = visitedTrail;
    // keep-set 은 제자리 갱신 — 프레임 루프는 이 Set 을 읽기만 한다.
    const keep = visitedTrailSetRef.current;
    keep.clear();
    for (const id of visitedTrail) keep.add(id);
    // 발자국 추가/소거는 정적 상태 전이 — 유휴 스킵 중에도 한 번 다시 그린다
    // (선택 링·엣지 선택과 같은 wake 계약).
    lastActiveMsRef.current = performance.now();
  }, [visitedTrail]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  /**
   * #71 안전망 — 리사이즈/모니터 이동 뒤 **노드가 하나도 화면에 없으면** 전체
   * 맞추기로 되돌린다.
   *
   * 규율: 매 resize 마다 강제로 맞추지 않는다. 사용자가 잡아둔 줌·위치는 의도이고
   * 그걸 지우는 건 다른 종류의 결함이다. 오직 "빈 지도로 보이는" 명백한 상태
   * (`hasAnyNodeOnScreen === false`)에서만 개입한다. 튐을 막기 위해 스프링
   * 타깃만 옮기고 값은 건드리지 않는다 — reduced-motion 은 카메라 트윈 계약이
   * 이미 존중한다.
   */
  const rescueCameraIfEverythingOffscreen = (tokens: TopologyV2Tokens) => {
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    if (hasAnyNodeOnScreen(cameraRef.current, width, height, world.nodes)) return;
    const target = computeOverviewCameraTarget(world.spineBounds, width, height, tokens, world.nodes.length);
    cameraTargetRef.current = { tx: target.tx, ty: target.ty, tscale: target.tscale };
    userDrivenCameraRef.current = false;
  };

  const trySnapInitialCamera = (tokens: TopologyV2Tokens) => {
    if (hasInitializedRef.current) return;
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    // Passive default = the simplified overview scale (blocker 2 fix,
    // `computeOverviewCameraTarget`'s own JSDoc), fit to the SPINE bbox
    // (project+domain+hub — the only tier drawn at entry), NOT the full
    // 295-node bounds. Fitting the full bounds after the de-pileup spread them
    // wide shrank the ~8 visible spine nodes to a dot (the fit regression).
    // `overviewScaleRef` MUST anchor on the SAME spine bounds — it feeds both
    // the altitude band's "100%" reference AND the zoom-ratio entry scale
    // (`overviewEntryScale = overviewScale × overviewEntryRatio`), so if it used
    // the full bounds while the camera sits at the spine fit, zoomRatio would be
    // ≫1 at entry and capabilities would cross-fade in immediately (soup) and
    // farT would drift off circuit.
    const target = computeOverviewCameraTarget(world.spineBounds, width, height, tokens, world.nodes.length);
    cameraRef.current = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    hasInitializedRef.current = true;
    /*
     * 딥링크로 들어와 밀려 있던 강조 맞춤을 여기서 갚는다(`pendingSpotlightFitRef`).
     * 초기 카메라를 방금 세운 **직후**라, 오버뷰가 한 프레임 보였다가 강조로
     * 이동하는 게 아니라 처음부터 강조를 향한다.
     *
     * 함수를 ref 로 부르는 이유: 이 자리는 `useCallback` 밖의 지역 함수이고,
     * `runSpotlightFit` 을 직접 닫으면 그 시점의 낡은 클로저를 붙든다.
     */
    if (pendingSpotlightFitRef.current && runSpotlightFitRef.current?.()) {
      pendingSpotlightFitRef.current = false;
    }
  };

  // --- world (layout + adjacency) — rebuilt whenever the graph itself changes ---
  useEffect(() => {
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // 설치 앱 proof — 데스크톱 WebView 검증이 클릭-취소 임계(hysteresis)를
    // 읽는 계약 지점. 토큰 값 그대로 노출한다 (v2 = 7px).
    containerRef.current?.setAttribute(
      "data-stage-pan-click-cancel-px",
      String(tokens.hysteresisPx),
    );
    // 확장 구조는 **씨앗 좌표**를 정하므로 월드 빌드의 입력이다 — 아래 dep
    // 배열에 들어 있어, 설정을 바꾸면 월드가 다시 지어지며 자식이 새 배치로 간다.
    const world = buildTopologyWorld(nodes, edges, tokens, expand.structure);
    worldRef.current = world;
    // rank8 — 신규 노드 등장 램프 시드. 첫 빌드(이전 집합 없음)는 전부 1(연출
    // 없음, 초기 로드 안무와 충돌 방지). 이후 빌드는 이전에 없던 id 만 0 으로
    // 심어 부풀며 등장하게 하고, 기존 노드는 그대로(1) 둔다(회귀 0). 사라진 id
    // 는 정리. 램프 자체의 수렴은 프레임 루프(stepTopologyPhysics)가 담당.
    {
      const prevIds = prevNodeIdsRef.current;
      const appear = appearRef.current;
      const isFirstBuild = prevIds.size === 0;
      const nextIds = new Set<string>();
      for (const n of world.nodes) {
        nextIds.add(n.id);
        if (isFirstBuild || prevIds.has(n.id)) {
          if (!appear.has(n.id)) appear.set(n.id, 1);
        } else {
          appear.set(n.id, 0); // 신규 노드 — 0 에서 부풀며 등장.
        }
      }
      for (const id of [...appear.keys()]) if (!nextIds.has(id)) appear.delete(id);
      prevNodeIdsRef.current = nextIds;
    }
    // R6 상시 혜성 — 유휴 게이트가 코멧 상시성을 알 수 있게 depends 유무를 캐시.
    hasDependsEdgesRef.current = world.edges.some((e) => e.kind === "depends");
    hasContainsEdgesRef.current = world.edges.some((e) => e.kind === "contains");
    // 새 월드 = 이전 월드의 엣지를 겨냥한 펄스는 무효(엣지 id 가 옛 것).
    pulsesRef.current = [];
    // Seed the force sim off the concentric layout (spatial memory) and warm it
    // so it settles into an organic layout that un-piles the fan-arcs.
    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );
    nodeDragRef.current = null;
    // No load-time settle: the sim stays cold until a node is pin-dragged. The
    // static default is the deterministic de-piled grid from `topology-world`.
    heatRef.current = 0;
    // A graph rebuild invalidates any in-flight drag/tug/homing state — those
    // ids/refs point at the OLD world's nodes.
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    homeSpringsRef.current.clear();
    homingActiveRef.current = false;
    homeTargetOverrideRef.current = null;
    prevPinnedNodeIdRef.current = null;
    onVisibleCountChange?.(nodes.length);
    onGraphStatsChange?.({ nodes: nodes.length, relations: edges.length });
    /*
     * **데이터 소스가 바뀌면 오버뷰를 다시 맞춘다** (원장 2026-08-08 (3) ②).
     *
     * `trySnapInitialCamera` 는 `hasInitializedRef` 로 최초 1회만 돌았다. 그래서
     * 세션 중에 볼트를 열면(샘플 → 로컬) **직전 그래프의 카메라로 새 그래프를
     * 그렸다** — 새 월드의 최외곽 노드가 크롬 안전영역 밖에 서고, 위 라벨 컬이
     * 그 이름을 지우는 경로의 절반이 이것이다.
     *
     * 트리거는 「출처 정체성」 하나다. 노드 수 변화로 걸면 사용자가 공방에서
     * 노드 하나를 더할 때마다 카메라를 낚아채게 되고, 그건 고치려던 결함보다
     * 나쁘다. 새 카메라 로직은 만들지 않는다 — 초기화 플래그를 내려 **같은
     * 오버뷰 핏 경로**를 한 번 더 통과시킬 뿐이라, 안전영역 핏 · 오버뷰 배율
     * 기준(`overviewScaleRef` → 하단 안내의 zoomRatio) · reduced-motion 처리가
     * 전부 그대로 재사용된다. 새 월드의 노드는 등장 램프(위 `appearRef`)를 타고
     * 부풀어 오르므로 주목 승자(새 그래프)가 전환을 갖는다.
     *
     * ⚠️ **`null` 은 「바뀜」이 아니라 「아직 모름」이다.** 볼트 정체성 문자열은
     * 로딩 중에 **거짓말을 한다** — 라이브 갱신마다 `load()` 가 status 를
     * `'loading'` 으로 되돌리므로(`use-local-vault.ts`) 그 순간의 정체성은
     * `local:<폴더>` 가 아니라 `sample:<샘플>` 로 계산된다. 그 값을 변화로 세면
     * **볼트에 파일 하나가 저장될 때마다 카메라를 낚아채게 된다** — 실측
     * (2026-08-08): 노드 하나를 더하니 카메라가 dx −3.93 · dy −10.66 ·
     * scale −0.0327 만큼 튀었다. 고치려던 결함보다 나쁜 쪽이다. 그래서 호출부가
     * 정착 전에는 `null` 을 주고(HomePage 의 `deeplinkSourceReady`, 같은 신호가
     * 딥링크 정리에서 이미 같은 값을 치렀다) 여기서는 **마지막으로 알던 값과만**
     * 비교한다. 같은 규율의 한 줄 요약: 「정착하기 전의 범위는 범위가 아니다」.
     */
    if (dataSourceKey !== null && dataSourceKey !== fittedDataSourceKeyRef.current) {
      fittedDataSourceKeyRef.current = dataSourceKey;
      hasInitializedRef.current = false;
    }
    trySnapInitialCamera(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, expand.structure]);

  // --- resize (mechanical) + grid pattern/dust (viewport-dependent, built once/on resize) ---
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    /**
     * 재기: 크기만 적어 둔다. **캔버스 백킹 크기를 여기서 바꾸지 않는다.**
     *
     * `canvas.width = n` 은 비트맵을 지운다. ResizeObserver 콜백은 브라우저
     * 프레임에서 rAF **뒤**, 페인트 **앞**에 돈다 — 그래서 여기서 크기를
     * 바꾸면 그 프레임의 순서가 `그린다 → 지운다 → 페인트` 가 되어 **빈
     * 캔버스가 화면에 나간다.** 도킹 패널의 폭 전이는 매 프레임 RO 를
     * 발화시키므로 전이 내내(실측 183~200ms) 지도가 노드 0·엣지 0·그리드 0
     * 으로 보였다. 커밋을 rAF 안으로 옮기면 순서가 `지운다 → 그린다 →
     * 페인트` 가 되어 같은 리사이즈가 한 프레임도 비우지 않는다.
     */
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      pendingViewportRef.current = { width: rect.width, height: rect.height, dpr };
      // Keep the cached pointer rect fresh whenever layout changes (see
      // `canvasRectRef` in `topology-pointer-handlers.ts`).
      canvasRectRef.current = { left: rect.left, top: rect.top };
    };

    /** 프레임 안에서 부르는 값싼 절반 — 백킹 크기 + 뷰포트 사실만. */
    const commitViewportSize = () => {
      const pending = pendingViewportRef.current;
      if (!pending) return false;
      pendingViewportRef.current = null;
      const backingWidth = Math.max(1, Math.round(pending.width * pending.dpr));
      const backingHeight = Math.max(1, Math.round(pending.height * pending.dpr));
      const sizeChanged = canvas.width !== backingWidth || canvas.height !== backingHeight;
      // **CSS 크기가 그대로면 뷰포트 레이어를 다시 만들지 않는다.**
      // `rebuildViewportLayers` 가 쓰는 값(별먼지·격자·깊이 도트)은 전부 CSS
      // 픽셀 기준이라 dpr 이 바뀌어도 그대로 유효하다. 이 구분이 없으면 드래그를
      // 잡고 놓을 때마다 별먼지를 두 번 다시 만들게 되고, 렉을 고치려던 것이
      // 새 렉이 된다.
      const cssSizeChanged =
        viewportRef.current.width !== pending.width || viewportRef.current.height !== pending.height;
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      viewportRef.current = pending;
      if (cssSizeChanged) viewportRebuildPendingRef.current = true;
      return sizeChanged;
    };

    /**
     * 비싼 절반 — 뷰포트 의존 레이어 재생성 + 카메라 구제. **크기가 정착한
     * 뒤 1회만** 돈다(`VIEWPORT_SETTLE_FRAMES`). 전이 중에는 이전 점군을
     * 그대로 그린다: 잠깐 어긋난 별먼지가 빈 화면보다 낫고, 카메라를 매
     * 프레임 재-fit 하면 전이 끝에 두 번 튄다.
     */
    const rebuildViewportLayers = () => {
      const { width, height } = viewportRef.current;
      if (width <= 0 || height <= 0) return;

      const tokens = readTopologyV2TokensOrNull();
      if (!tokens) return;

      if (!gridCanvasRef.current) gridCanvasRef.current = document.createElement("canvas");
      if (!gridPatternRef.current) {
        gridPatternRef.current = buildGridPattern(gridCanvasRef.current, {
          minorColor: tokens.gridMinor,
          majorColor: tokens.gridMajor,
          baseColor: tokens.canvasBgNear,
        });
      }
      // 깊이 도트 세 층 — 정적 타일이라 뷰포트 재빌드 때 한 번만 만든다.
      if (depthDotCanvasRef.current.length === 0) {
        depthDotCanvasRef.current = DEPTH_DOT_LAYERS.map(() => document.createElement("canvas"));
      }
      {
        const rootStyle = getComputedStyle(document.documentElement);
        const rgb = rootStyle.getPropertyValue("--canvas-bg-particle-rgb").trim() || "150, 165, 220";
        depthDotPatternsRef.current = DEPTH_DOT_LAYERS.map((layer, i) =>
          buildDepthDotPattern(depthDotCanvasRef.current[i], layer, `rgba(${rgb}, ${0.055 * layer.alphaScale})`),
        );
      }
      dustPointsRef.current = buildDustPoints(width, height, computeStarDustCount(width, height, tokens.dustAreaPerPoint), tokens.dustParallaxMin, tokens.dustParallaxMax);
      // S8 결함 6 — 우주 도트는 dust 의 2배 밀도(레이어 2장). dust 와 같은
      // areaPerPoint 토큰 기준으로 카운트를 잡고 2배로.
      cosmosPointsRef.current = buildRealmCosmosPoints(
        width,
        height,
        computeStarDustCount(width, height, tokens.dustAreaPerPoint) * 2,
      );
      trySnapInitialCamera(tokens);
      rescueCameraIfEverythingOffscreen(tokens);
    };

    commitViewportSizeRef.current = commitViewportSize;
    rebuildViewportLayersRef.current = rebuildViewportLayers;

    // 마운트 1회는 즉시 커밋한다 — `trySnapInitialCamera` 가 첫 카메라를
    // 정하려면 첫 프레임 전에 뷰포트 사실이 있어야 한다.
    measure();
    commitViewportSize();
    rebuildViewportLayers();
    viewportRebuildPendingRef.current = false;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        commitViewportSizeRef.current = null;
        rebuildViewportLayersRef.current = null;
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);

    // #71 — `ResizeObserver` 는 **크기** 변화만 본다. 창을 다른 모니터로 옮기면
    // CSS 크기는 그대로인데 `devicePixelRatio` 만 바뀌고, 그러면 캔버스 백킹
    // 크기가 옛 DPR 로 남아 그려지는 내용이 어긋난다. DPR 변화를 따로 듣는다.
    // `matchMedia(resolution)` 은 현재 DPR 에서 벗어나는 순간 한 번 발화하므로
    // 매번 새 질의로 다시 건다.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      measure();
      watchDpr();
    };
    const watchDpr = () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      dprQuery?.removeEventListener?.("change", onDprChange);
      const dpr = window.devicePixelRatio || 1;
      dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      dprQuery.addEventListener?.("change", onDprChange);
    };
    watchDpr();

    return () => {
      observer.disconnect();
      dprQuery?.removeEventListener?.("change", onDprChange);
      commitViewportSizeRef.current = null;
      rebuildViewportLayersRef.current = null;
    };
  }, []);

  // --- relayoutToken / fitViewToken — both mean "spring back to the full overview fit" ---
  useEffect(() => {
    // Skip while both tokens still equal their captured mount-time values —
    // this effect's own mount-time fire (see `initialFitTokensRef` above).
    // `trySnapInitialCamera` already set the correct initial camera; this
    // effect should only react to an actual "fit view"/relayout click after.
    const initial = initialFitTokensRef.current;
    if (relayoutToken === initial.relayout && fitViewToken === initial.fitView) return;
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    // 결계 불변식 (소유자 실보고 2026-07-23) — 영역 전개 중의 fit/재배치 카메라는
    // 전역 스파인이 아니라 **영역 콘텐츠 bbox** 로 복귀한다. 전역 overview 로
    // 트윈하면 카메라가 결계 세계를 떠나 "빈 원 + 어딘가의 노드들" 이 된다
    // (S9 결함 1 의 deselect 복귀와 같은 계약).
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens,
      );
      const target = realmCameraTarget(bounds, tokens, width, height);
      cameraTargetRef.current = target;
      userDrivenCameraRef.current = false;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(target);
      return;
    }
    // Panel-aware: spring back to the overview centered in the VISIBLE area, not
    // behind the left ReaderLens panel (Design Guardian 카메라 반려). Fits the
    // SPINE bbox (not the full 295-node bounds) so "fit view" reframes the same
    // legible 8-node spine as the initial entry — and keeps `overviewScaleRef`
    // on the same spine bounds so the zoom-ratio/altitude anchor stays at ratio 1.
    const overviewTarget = computeOverviewCameraTarget(world.spineBounds, width, height, tokens, world.nodes.length);
    cameraTargetRef.current = overviewTarget;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // eases via the cubic transition tween (reduced-motion → spring/snap), not
    // whatever a preceding wheel gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(overviewTarget);
  }, [relayoutToken, fitViewToken, beginCameraTween]);

  /*
   * spotlightFitToken — 「최근 변경」 렌즈를 켜거나 기간을 바꾼 **그 순간**,
   * 강조된 노드가 전부 화면에 들어오게 카메라를 맞춘다.
   *
   * 왜 필요한가 (2026-08-02 소유자 지적): 창을 30일에서 1일로 좁히면 강조가
   * 15개에서 3개로 줄어드는데 **화면은 그대로**였다. 남은 셋이 화면 밖이면
   * 사용자에게는 「아무 일도 안 일어났다」로 보인다. 이 앱의 다른 곳(검색 선택 ·
   * 「이것만 보기」)은 전부 카메라가 따라가는데 렌즈만 안 갔다.
   *
   * **사람이 잡아둔 화면을 뺏지 않는다**: 토큰이 바뀐 그 순간에만 한 번 맞추고,
   * 그 뒤 팬/줌 하면 다시 안 건드린다(위 fit 들과 같은 계약). 강조가 0개면 아예
   * 움직이지 않는다 — 맞출 대상이 없는데 움직이면 길만 잃는다.
   */
  /*
   * 실제 맞춤 — 성공하면 `true`. 실패 이유가 「아직 준비 안 됨」이면 호출부가
   * 빚으로 남기고, 「맞출 대상이 없음」이면 그대로 끝난다(빚을 남겨도 갚을 게
   * 없다). 두 실패를 가르지 않으면 강조 0개인 세션이 초기화 때마다 헛일한다.
   */
  const runSpotlightFit = useCallback((): boolean => {
    const ids = spotlightIdsRef.current;
    if (ids === null || ids.size === 0) return true; // 갚을 빚 없음
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hit = 0;
    for (const node of world.nodes) {
      if (!ids.has(node.id)) continue;
      hit += 1;
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    // 강조 id 가 현재 월드에 하나도 없을 수 있다(접힌 클러스터 안 등) — 맞출
    // bbox 가 없으므로 카메라를 건드리지 않는다. 빚으로도 안 남긴다: 다시
    // 시도해도 같은 결과다.
    if (hit === 0) return true;

    // 가장자리에 딱 붙지 않게 여백을 준다 — bbox 를 그대로 맞추면 라벨·링·자국이
    // 잘린다.
    const padX = Math.max(48, (maxX - minX) * 0.18);
    const padY = Math.max(48, (maxY - minY) * 0.18);
    const target = fitWorldTarget(
      { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY },
      width,
      height,
      tokens.cameraScaleMax,
      tokens.cameraScaleMin,
    );
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(target);
    return true;
  }, [beginCameraTween]);
  runSpotlightFitRef.current = runSpotlightFit;

  useEffect(() => {
    if (spotlightFitToken === initialSpotlightFitTokenRef.current) return;
    if (!runSpotlightFit()) pendingSpotlightFitRef.current = true;
  }, [spotlightFitToken, runSpotlightFit]);


  // --- relayoutToken ONLY (not fitViewToken) — also restores every node's
  // position to its canonical (`homeX`/`homeY`) layout coordinate over a
  // short critically-damped spring transition (C1 B3). "지도 전체 맞추기"/
  // fit-view intentionally does NOT do this — it only recenters the camera,
  // it's a different user action ("재배치"/auto-arrange is the button that
  // implies "put the nodes back", per `HomePage.tsx`'s `onRelayout`). ---
  useEffect(() => {
    if (relayoutToken === initialRelayoutTokenRef.current) return;
    const world = worldRef.current;
    if (!world) return;

    // Relayout is a clean slate: drop any in-flight drag/tug/settle state so
    // the homing transition below isn't fighting stale sim pins or tug offsets,
    // and reseed the sim's OWN internal graph at the home coordinates too — it
    // doesn't automatically track `world.nodes` mutations, so without this a
    // drag right after a relayout would start from the sim's stale pre-relayout
    // positions and jump.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();

    // 결계 불변식 (소유자 실보고 2026-07-23, 재현 경로 ②) — 영역 전개 중의
    // Auto-arrange 는 "이 세계를 다시 정돈" 이다: 호밍 목표는 전역 `homeX/homeY`
    // 가 아니라 **영역 재배치 좌표**(insideTargets). 전역 홈으로 보내면 결계
    // 원은 영역 원점에 남고 멤버 전원이 스파인 좌표로 날아가 "루트가 자기 결계
    // 밖" 이 됐다. 밖 노드는 하드 컬 상태라 스프링을 만들지 않는다.
    // 이탈(exiting) 중의 재배치는 전역 경로 — 역재생의 목적지가 전역 홈이므로
    // 영역 타깃 호밍이 닫히는 세계로 노드를 되돌리면 안 된다.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      simRef.current = createForceSimulation(
        world.nodes.map((n) => {
          const t = realmData.insideTargets.get(n.id);
          return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
        }),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) {
        if (realmData.insideTargets.has(node.id)) springs.set(node.id, initHomeSpring(node.x, node.y));
      }
      homeSpringsRef.current = springs;
      homeTargetOverrideRef.current = realmData.insideTargets;
      homingActiveRef.current = true;
      return;
    }

    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );

    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = null;
    homingActiveRef.current = true;
  }, [relayoutToken]);

  // --- P3d(E1) 첫 지도 연출 — 부트스트랩 직후 전 노드가 스파인 중심에서
  // 모여 나와 제자리로 정착한다. 기존 호밍 스프링(A5 ω, A8 reduced-motion
  // 스냅)을 그대로 타므로 신규 모션 계약이 없다.
  // 0 초기화가 핵심: 빈 vault 는 캔버스를 마운트하지 않으므로 부트스트랩
  // 완료(토큰 증가)가 마운트보다 먼저다 — 현재 prop 으로 초기화하면 첫
  // 마운트가 그 증가를 삼켜 연출이 발화하지 않는다.
  const lastRevealTokenRef = useRef(0);
  useEffect(() => {
    if (revealToken === lastRevealTokenRef.current) return;
    lastRevealTokenRef.current = revealToken;
    const world = worldRef.current;
    if (!world || world.nodes.length === 0) return;
    // 출발점 = 프로젝트 노드의 홈 (없으면 스파인 bbox 중심)
    const projectNode = world.nodes.find((n) => n.kind === "project");
    const cx = projectNode?.homeX ?? (world.spineBounds.minX + world.spineBounds.maxX) / 2;
    const cy = projectNode?.homeY ?? (world.spineBounds.minY + world.spineBounds.maxY) / 2;
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      if (node.kind !== "project") {
        node.x = cx;
        node.y = cy;
      }
      springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    recomputeWorldGeometry(world, tokens);
    homeSpringsRef.current = springs;
    homingActiveRef.current = true;
  }, [revealToken]);

  // --- focused slug change — spring-dive to the ego bbox, or back to overview when cleared ---
  useEffect(() => {
    if (lastFocusedSlugRef.current === focusedSlug) return;
    lastFocusedSlugRef.current = focusedSlug;
    // S2 파트 3a — 새 포커스는 상위 24 이웃부터 (칩 클릭으로 더 편 배치를 리셋).
    egoRevealBatchesRef.current = 1;

    // Canvas-emphasis slice §B2 — a NEW selection (never a deselect) starts
    // the one-shot commit pulse. Captured unconditionally (before the
    // tokens/world early-return below) so the pulse timestamp is never
    // skipped even if the camera-target computation bails out for some
    // reason.
    selectionPulseRef.current = focusedSlug !== null ? { nodeId: focusedSlug, startAtMs: performance.now() } : null;

    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0) return;

    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    // S8 결함 4 — 영역 전개 중이면 ego bbox 를 영역 멤버로 제한(결계 밖 fling
    // 이웃이 bbox 를 부풀려 카메라가 화면 밖으로 날아가는 것 차단). 포커스
    // 다이브가 결계 안에서만 움직인다.
    const realmActive = realmTransitionRef.current.phase !== "idle";
    const realmData = realmDataRef.current;
    // S9 결함 1 — 영역 안에서 바닥 클릭(deselect)하면 카메라가 폭주하던 결함:
    // `computeFocusCameraTarget` 의 null 분기는 **전역** spineBounds 기준이라 영역
    // 재배치 좌표계(원점 0,0)와 어긋나 화면 밖으로 날아갔다. 영역 active 중
    // deselect 복귀 목표는 영역 콘텐츠 bbox(가시 멤버 기준) — entryCamera(영역
    // '해제' 전용)가 아니라 현재 영역 fit 이다.
    /*
     * ⚠️ **목표 계산 자체를 한 프레임 미룬다.**
     *
     * 피해야 할 팝오버는 **바로 이 선택 때문에** 열리므로, 이 effect 가 도는 시점에는
     * DOM 에 없다. 그때 인셋을 재면 오른쪽이 0으로 나오고 보정이 사라진다 —
     * 게이트가 정확히 그것을 잡았다(「자유 127px · 화면 64px」). 그래서 **재는 것과
     * 계산하는 것을 같은 프레임**에 둔다.
     *
     * 200~420ms 이동 앞의 한 프레임(≈16ms)은 보이지 않고, 「한 사건」 게이트가 그
     * 시차를 프레임 수로 지킨다.
     */
    const raf = requestAnimationFrame(() => {
    let target: CameraTarget | null;
    if (focusedSlug === null && realmActive && realmData) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens,
      );
      target = realmCameraTarget(bounds, tokens, width, height);
    } else {
      const realmMembers = realmActive ? realmData?.memberIds ?? null : null;
      target = computeFocusCameraTarget(world, cameraTokens(tokens), width, height, focusedSlug, overviewEntryScale, realmMembers);
    }
    if (!target) return;
    /*
     * **패널에 가리지 않는 자리로 보정한다** (2026-08-10 소유자 확정:
     * *"가려선 안되지 패널 뺀 공간 가운데로 맞춰줘"*).
     *
     * 노드를 고르면 오른쪽에 팝오버가 열린다. 그런데 이 목표는 **뷰포트 가운데**
     * 기준이라, 고른 것이 그것을 설명하는 패널 뒤로 들어갈 수 있었다. 실측
     * (1512×982): 캔버스 x64 w1448 · 팝오버 x1128 w352 → 자유 영역 가운데는 화면
     * 가운데보다 **192px 왼쪽**이다.
     *
     * 개요 경로에는 이미 같은 개념이 있었다(그 아래 *"Panel-aware: … not behind the
     * left ReaderLens panel"*) — 없던 것은 **선택 경로**다. 여기가 그 한 곳이다.
     *
     * 패널 폭을 상수로 박지 않고 DOM 에서 잰다: 값을 박으면 패널이 바뀌는 날 조용히
     * 어긋난다. 선택이 바뀔 때만 도는 계산이라 프레임 예산과 무관하다.
     */
      const finalTarget = target;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraTargetRef.current = finalTarget;
      userDrivenCameraRef.current = false;
      // Dive-zoom fix — focus dive AND deselect-return are both PROGRAMMATIC
      // camera moves (this effect fires for both directions of `focusedSlug`
      // changing), so both ease via the cubic transition tween (reduced-motion →
      // spring/snap).
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      lastActiveMsRef.current = performance.now();
      beginCameraTween(finalTarget);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedSlug, beginCameraTween, cameraTokens]);

  // --- S4 "영역 전개" — realmRootId 변경 시 서브트리 재배치 + 전환 안무 시작.
  // 진입: 서브트리를 그 노드 임시 루트로 재배치, 안 노드는 FLIP·밖 노드는 중력
  // 이탈, 카메라는 결계 원으로 돌리 인. 이탈: 전 노드 홈 스프링 복귀(기존 relayout
  // 호밍 재사용) + 카메라 overview fit. 신규 모션 계약은 realm-transition 의
  // FLIP/fling 뿐, 이탈은 검증된 호밍 경로를 탄다.
  useEffect(() => {
    if (realmRootId === prevRealmRootIdRef.current) return;
    prevRealmRootIdRef.current = realmRootId;
    lastActiveMsRef.current = performance.now();

    const world = worldRef.current;
    const tokens = readTopologyV2TokensOrNull();
    const { width, height } = viewportRef.current;
    if (!world || !tokens) return;
    const now = performance.now();
    const reduced = reducedMotionRef.current;

    // 전환은 물리/호밍과 배타 — 진행 중 상태를 정리한다 (relayout 과 같은 계약).
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    // S8 결함 5 — 새 전환은 좌표 소유권 핸드오프를 리셋(진입/이탈 모두).
    realmActiveHandedOffRef.current = false;

    if (realmRootId !== null) {
      // --- 진입 ---
      // S9 결함 2 — 결계/프레이밍을 진입 시점 펼침 상태 기준 가시 멤버로 잡는다
      // (영역 루트는 항상 펼침 — 그 직속 자식이 영역 스파인).
      const data = buildRealmRuntimeData(
        world,
        realmRootId,
        tokens,
        new Set([...expandedParentsRef.current, realmRootId]),
      );
      if (!data) return;
      realmDataRef.current = data;
      // S9 결함 2 — 새 영역이므로 결계 이징을 리셋(첫 프레임이 초기 반경 스냅 시드).
      wardingFitRef.current = null;
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "enter",
        rootId: realmRootId,
        now,
        reducedMotion: reduced,
      });
      // 호밍은 진입 중 realm 이 좌표를 소유하므로 끈다.
      homingActiveRef.current = false;
      homeSpringsRef.current.clear();
      homeTargetOverrideRef.current = null;
      // 카메라: 결계 원 fit 으로 돌리 인 (기존 큐빅 트윈 재사용).
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // S8 결함 2 — 해제 시 복귀할 "원래 보던 곳" 키프레임을 진입 직전 카메라
        // 값으로 저장(카메라 초기화된 경우만 — 딥링크 마운트는 null 유지).
        data.entryCamera = {
          tx: cameraRef.current.x.value,
          ty: cameraRef.current.y.value,
          tscale: cameraRef.current.scale.value,
        };
        const target = realmCameraTarget(data.bounds, tokens, width, height);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // 돌리 인은 안무 전체(이탈→FLIP→결계)를 타고 간다 — 거리 비례 단기
        // 트윈이면 카메라만 먼저 끝나 "컷" 으로 읽힌다 (녹화 검수).
        beginCameraTween(target, 860);
      }
    } else {
      // --- 이탈(S6): 입장의 결정론 역재생 — 안 노드 역FLIP(깊은 층 먼저) + 밖
      // 노드 역중력 귀환. 좌표는 realm 데이터가 소유하므로(홈 스프링 아님) 프레임
      // 루프의 exiting 스텝이 굴린다. 카메라는 750ms overview 트윈으로 안무 동기. ---
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "exit",
        now,
        reducedMotion: reduced,
      });
      // 물리는 전환과 배타 — 홈 좌표로 시드해 이탈 후 드래그가 튀지 않게 한다
      // (전환 중엔 heat 0 이라 tick 안 함).
      simRef.current = createForceSimulation(
        world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      if (reduced) {
        // A8 — reduced-motion 은 여정 없이 결과만. 결정론 역재생(non-reduced 전용)
        // 대신 검증된 홈 스프링 스냅 경로를 탄다(프레임 루프의 reduced 호밍 블록이
        // 즉시 homeX/homeY 로 스냅). 이펙트에서 노드를 직접 mutate 하지 않는다.
        const springs = new Map<string, HomeSpringState>();
        for (const node of world.nodes) springs.set(node.id, initHomeSpring(node.x, node.y));
        homeSpringsRef.current = springs;
        homeTargetOverrideRef.current = null; // 이탈 목표는 전역 홈
        homingActiveRef.current = true;
      } else {
        // 안 노드 역FLIP + 밖 노드 역중력 귀환은 realm 데이터가 소유 → 홈 스프링 끔.
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
        // S8 결함 5 — 정착 후 드래그로 멤버가 옮겨졌을 수 있으므로, 역FLIP 시작점
        // (insideTargets)을 현재 라이브 좌표로 갱신해 이탈 첫 프레임의 튐을 없앤다.
        const data = realmDataRef.current;
        if (data) {
          const liveTargets = new Map<string, { x: number; y: number }>();
          for (const [id, fallback] of data.insideTargets) {
            const n = world.nodeById.get(id);
            liveTargets.set(id, n ? { x: n.x, y: n.y } : fallback);
          }
          realmDataRef.current = { ...data, insideTargets: liveTargets };
        }
      }
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // S8 결함 2 — 진입 시 저장한 키프레임이 있으면 그 "원래 보던 곳"으로
        // 복귀(없으면 overview fit 폴백). 750ms 트윈 유지.
        const savedEntry = realmDataRef.current?.entryCamera ?? null;
        const target = savedEntry ?? computeOverviewCameraTarget(world.spineBounds, width, height, tokens, world.nodes.length);
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // 750ms 트윈 — 안무(안 역FLIP 660 / 밖 귀환 650)와 동기. 입장 860 패턴.
        beginCameraTween(target, 750);
      }
    }
  }, [realmRootId, beginCameraTween]);

  // --- single rAF loop: physics -> altitude -> emphasis -> particles -> draw ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /**
     * **`alpha: false` — 이 지도는 자기 뒤를 보여 줄 일이 없다.**
     *
     * 명세(WHATWG canvas): alpha 가 false 면 모든 픽셀의 알파 성분이 1.0 으로
     * 고정되고 바꾸려는 시도는 조용히 무시된다. 그래서 **컴포지터가 캔버스
     * 뒤 페이지 콘텐츠와의 블렌딩을 통째로 건너뛸 수 있다** — Blink 는
     * `html_canvas_element.cc` 에서 이 값으로 `cc_layer_->SetContentsOpaque()`
     * 를 직접 세우고, `cc/layers/layer.h` 는 그것을 "블렌딩을 생략해도 된다는
     * 최적화 힌트"로 정의한다.
     *
     * 이득이 나는 자리가 중요하다 — **JS 프레임 시간이 아니라 컴포지트
     * 단계**다. 그래서 `performance.mark` 프로파일에는 안 잡히고, 그 사실을
     * 모르면 "재 봤는데 차이 없다"는 잘못된 결론이 나온다.
     *
     * 조건은 우리가 이미 만족한다: 다크 단일이고 매 프레임 배경을 전체
     * 칠한다. 부작용은 안 그린 영역이 투명이 아니라 **검정**이 되는 것인데,
     * 전체를 칠하므로 무관하다.
     *
     * ⚠️ **주 캔버스에만.** `render/grid.ts` · `render/animated-background.ts`
     * 의 오프스크린은 이 캔버스 **위에 합성**되므로 알파가 필요하다 — 거기에
     * 같이 넣으면 배경 타일이 서로를 가린다.
     */
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let handle = 0;
    let cancelled = false;

    const frame = (now: number) => {
      if (cancelled) return;

      // 끄는 동안에만 백킹 해상도를 낮춘다(`INTERACTION_DPR_CAP`). 전이 시점은
      // 상호작용의 **시작과 끝 두 번뿐**이라 프레임마다 캔버스를 재할당하지 않는다.
      {
        const deviceDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const interacting =
          pointerMachineRef.current.phase === "dragging" || nodeDragRef.current !== null;
        const wantScale = interacting ? Math.min(deviceDpr, INTERACTION_DPR_CAP) : deviceDpr;
        const pending = pendingViewportRef.current;
        if (pending) {
          // 리사이즈가 대기 중이면 그 dpr 을 **덮는다.** `measure()` 는 장치
          // dpr 을 적어 두므로, 끄는 중에 창이 바뀌면 그 한 번으로 전체 해상도가
          // 되살아나 남은 드래그 내내 느려진다(드문 대신 조용한 실패다).
          pending.dpr = wantScale;
          appliedDprScaleRef.current = wantScale;
        } else if (appliedDprScaleRef.current !== wantScale) {
          appliedDprScaleRef.current = wantScale;
          const { width, height } = viewportRef.current;
          if (width > 0 && height > 0) {
            pendingViewportRef.current = { width, height, dpr: wantScale };
          }
        }
      }

      // 리사이즈 커밋은 **그리기 바로 앞**이다 — ResizeObserver 콜백에서 하면
      // 캔버스를 지운 뒤 그대로 페인트돼 빈 지도가 화면에 나간다(리사이즈
      // effect 의 `measure` 주석). 여기서 지우고 아래에서 곧바로 다시 그린다.
      if (commitViewportSizeRef.current?.()) {
        viewportSettleFramesRef.current = 0;
        // 유휴 게이트가 이 프레임을 건너뛰면 지운 캔버스가 그대로 나간다.
        lastActiveMsRef.current = now;
      } else if (viewportRebuildPendingRef.current) {
        viewportSettleFramesRef.current += 1;
        if (viewportSettleFramesRef.current >= VIEWPORT_SETTLE_FRAMES) {
          rebuildViewportLayersRef.current?.();
          viewportRebuildPendingRef.current = false;
          lastActiveMsRef.current = now;
        }
      }

      const tokens = readTopologyV2TokensOrNull();
      const world = worldRef.current;
      const { width, height, dpr } = viewportRef.current;
      if (!tokens || !world || width <= 0 || height <= 0) {
        handle = requestAnimationFrame(frame);
        return;
      }

      const dt =
        lastFrameTimeRef.current === 0
          ? 0
          : Math.min((now - lastFrameTimeRef.current) / 1000, MAX_FRAME_DELTA_SECONDS);
      lastFrameTimeRef.current = now;

      // --- A2 유휴 게이트: 활동 플래그를 refs 에서 재평가. 전부 꺼진 채
      // grace 가 지나면 물리+페인트를 건너뛴다 (rAF 는 유지 — 어떤 상태
      // 변화든 다음 프레임에 자연 복귀, wake 배선/동결 실패 모드 없음).
      {
        const cam = cameraRef.current;
        const target = cameraTargetRef.current;
        const prev = prevCameraSampleRef.current;
        // M-1 회귀: 값 이동만 보면 유휴 스킵 중 휠(타깃만 변경)이 영원히
        // 무시된다 — 스프링 미정착(타깃≠값)도 활동이다 (idle-gate 계약).
        const cameraUnsettled = isCameraUnsettled(
          { x: cam.x.value, y: cam.y.value, scale: cam.scale.value },
          target,
        );
        const cameraMoving =
          prev === null ||
          cameraUnsettled ||
          Math.abs(cam.x.value - prev.x) > 0.01 ||
          Math.abs(cam.y.value - prev.y) > 0.01 ||
          Math.abs(cam.scale.value - prev.s) > 0.0001;
        prevCameraSampleRef.current = { x: cam.x.value, y: cam.y.value, s: cam.scale.value };

        /**
         * 앰비언트 휴면 계수 (2026-07-28 카운슬 「작업대」 P0 처방).
         *
         * 상시 혜성과 fresh 브리드는 **끄지 않는다** — 혜성은 depends 엣지의
         * 방향을 나르는 유일한 채널이라 끄면 타입 있는 사실이 사라진다(카운슬
         * 판별식: "그 모션을 끄면 정보를 잃는가?" — 잃는다). 대신 사람이 손을
         * 놓고 한참 지나면 속도를 0 으로 램프해 재운다.
         *
         * 계수는 혜성 속도에 곱해지고(램프 = 흐르다 서서히 멎음), 0 에 닿는
         * 순간 위 두 활동 플래그가 내려가 `isCanvasActive` 가 자연히 닫힌다.
         * 어떤 입력이든 `noteInput()` 이 `lastInputMs` 를 밀어 다음 프레임에
         * 계수가 1 로 복귀한다 — wake 배선이 필요 없는 idle-gate 설계 그대로.
         */
        const ambientFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
        const ambientAsleep = isAmbientAsleep(ambientFactor);

        const active = isCanvasActive({
          pointerActive: pointerMachineRef.current.phase !== "idle",
          // 드래그 grab/release 가 heat 를 충전하는 동안(또는 노드가 pin 된
          // 동안)만 시뮬을 웜으로 인정한다. 상시 물리 토글은 제거됐다(#19).
          simWarm: heatRef.current > 0 || nodeDragRef.current !== null,
          homing: homingActiveRef.current,
          selectionPulseActive: selectionPulseRef.current !== null &&
            now - selectionPulseRef.current.startAtMs < tokens.selectPulseDurationMs,
          // R6 상시 혜성 — depends 엣지가 있고 reduced-motion 이 아니면 코멧이
          // 포커스와 무관하게 항상 흐르므로 캔버스는 유휴가 되지 않는다(소유자
          // 지시 "상시성"). 처방 E 의 포커스 contains 코멧과 호버 펄스도 같은
          // 플래그를 짓는다. 문서 hidden 시엔 rAF 자체가 브라우저에 의해 정지돼
          // 배터리를 지킨다.
          //
          // 세 갈래의 합성은 `idle-gate.ts` 의 순수 함수가 소유한다 — 여기서
          // 인라인 OR 로 짜던 동안 앰비언트 휴면이 **depends 갈래에만** 걸려,
          // 노드를 선택해 둔 채 손을 놓으면 앱이 영원히 안 잠들었다.
          egoTailAnimating: isEgoTailAnimating({
            reducedMotion: reducedMotionRef.current,
            ambientAsleep,
            hasDependsEdges: hasDependsEdgesRef.current,
            edgePulseSpeed: tokens.edgePulseSpeed,
            focused: focusedSlugRef.current !== null,
            hasContainsEdges: hasContainsEdgesRef.current,
            livePulseCount: pulsesRef.current.length,
          }),
          // 렌즈 브러싱도 진행 중인 상호작용 — 유휴로 접으면 호버 링이 얼거나
          // 뜨지 않는다(캔버스 호버와 같은 대우).
          emphasisTarget:
            hoveredNodeIdRef.current !== null ||
            panelEmphasisNodeIdRef.current !== null ||
            hoveredClusterIdRef.current !== null ||
            ((trailLensPropRef.current?.current ?? false) && (trailBrushPropRef.current?.current ?? null) !== null),
          // 렌즈 on/off 전이 — 마지막으로 그린 상태와 다르면 한 프레임 깨워
          // 새 상태를 그린다(스포트라이트 램프 정착과 같은 계약).
          trailLensSettling:
            (trailLensPropRef.current?.current ?? false) !== drawnTrailLensRef.current ||
            Math.abs(
              trailLensRampRef.current - ((trailLensPropRef.current?.current ?? false) ? 1 : 0),
            ) > 0.01,
          // 앰비언트 휴면 — fresh 브리드는 에이전트가 매일 볼트를 고치는 이
          // 제품의 **정상 상태**에서 거의 항상 참이라(카운슬 실측), 이 플래그가
          // 유휴 게이트를 영구히 열어 두는 두 원인 중 하나였다.
          breathing: !reducedMotionRef.current && !ambientAsleep && world.nodes.some((n) => n.fresh),
          cameraMoving,
          // 선택 해제 페이드: 라이브 포커스는 없는데 retained colorFocus 가 아직
          // 남아 있으면(선택 링·배경 dim 의 색 타깃) focus 램프가 0 으로 감쇠할
          // 때까지 깨어 있어야 한다. 이 감쇠·colorFocus 클리어는 아래 프레임
          // 바디에서만 일어나므로, 코멧/카메라 같은 우발 활동에 의존하지 않고
          // 여기서 명시적으로 활동으로 친다(deselect 링 잔류 회귀 차단).
          focusFadeSettling:
            colorFocusRef.current !== null && focusedSlugRef.current === null && selectedEdgeRef.current === null,
          // 스포트라이트 on/off 전이 중(램프 미도달)은 활동 — 램프 step 이
          // 프레임 바디 안에서만 일어나므로 focusFadeSettling 과 같은 계약.
          spotlightSettling:
            Math.abs(spotlightRampRef.current - (spotlightIdsRef.current !== null ? 1 : 0)) > 0.01,
          // S6 — 이탈 역재생은 홈 스프링(homing)을 안 쓰므로 여기서 직접 깨워
          // 둬야 안무가 유휴 게이트에 얼지 않는다.
        }) ||
        realmTransitionRef.current.phase === "entering" ||
        realmTransitionRef.current.phase === "exiting";
        if (active) lastActiveMsRef.current = now;
        else if (shouldSkipFrame(now, lastActiveMsRef.current, IDLE_GRACE_MS)) {
          handle = requestAnimationFrame(frame);
          return;
        }
      }

      // --- force simulation: tick ONLY while a node is pin-dragged (or its
      // brief release settle). Never on load — the static default is the
      // deterministic grid, and the camera is NOT auto-reframed here (that
      // reframing only existed to chase the removed load settle). ---
      const sim = simRef.current;
      const pinned = nodeDragRef.current !== null;
      // C1 B3: a user grab interrupts any in-flight auto-arrange homing —
      // the drag wins, rather than the two fighting over the node's position.
      if (pinned && homingActiveRef.current) {
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
      }

      // --- 결계 불변식 (소유자 실보고 2026-07-23, 재현 경로 ①) — 영역 멤버가
      // 결계 **밖**에서 릴리즈되면 영역 타깃으로 재홈잉한다(고무줄 복귀). 결계는
      // 경계다: 루트(타깃=원점)를 끌어내 놓으면 "자기 결계 밖의 루트" 로 세계
      // 문법이 깨진다. 안쪽 릴리즈는 자유 배치 유지(MindNode 식) — Auto-arrange
      // 가 언제든 정돈한다. 기존 홈 스프링 + 목표 오버라이드 재사용, 신규 모션 0. ---
      {
        const pinnedId = nodeDragRef.current?.nodeId ?? null;
        const releasedId = prevPinnedNodeIdRef.current !== null && pinnedId === null ? prevPinnedNodeIdRef.current : null;
        prevPinnedNodeIdRef.current = pinnedId;
        const realmData = realmDataRef.current;
        if (releasedId !== null && realmData !== null && realmTransitionRef.current.phase === "active") {
          const target = realmData.insideTargets.get(releasedId);
          const released = world.nodeById.get(releasedId);
          const radius = wardingFitRef.current?.value ?? realmData.wardingRadius;
          const outside =
            released !== undefined &&
            Math.hypot(released.x - realmData.wardingCenter.x, released.y - realmData.wardingCenter.y) > radius;
          if (target && released && outside) {
            // 재홈잉 대상 = 릴리즈 노드 + 이번 드래그의 터그 영향권(1/2-hop) 중
            // 영역 멤버. 릴리즈 노드만 스프링하면 터그로 끌려온 이웃이 변위
            // 채로 동결된다(정상 릴리즈의 settle 이 터그를 0 으로 되감는 경로를
            // 아래 heat=0 이 끊으므로) — 결계 위반은 흐트러진 무리 전체를
            // 제자리로 정돈한다 (스코프 좁힌 relayout 과 같은 문법).
            const affected = dragAffectedSetRef.current;
            const springIds = new Set<string>([releasedId]);
            if (affected !== null && affected.draggedId === releasedId) {
              for (const id of affected.oneHop) springIds.add(id);
              for (const id of affected.twoHop) springIds.add(id);
            }
            // settle burst 대신 홈 스프링이 좌표를 소유 — 둘이 같은 노드를 놓고
            // 싸우지 않게 열/터그를 접는다 (relayout 과 같은 배타 계약).
            heatRef.current = 0;
            dragAffectedSetRef.current = null;
            dragTugOffsetsRef.current.clear();
            const springs = new Map(homeSpringsRef.current);
            const override = new Map(homeTargetOverrideRef.current ?? []);
            for (const id of springIds) {
              const t = realmData.insideTargets.get(id);
              const n = world.nodeById.get(id);
              if (!t || !n) continue;
              springs.set(id, initHomeSpring(n.x, n.y));
              override.set(id, t);
            }
            homeSpringsRef.current = springs;
            homeTargetOverrideRef.current = override;
            homingActiveRef.current = true;
            // sim 내부 좌표도 복귀 목표로 재시드 — 다음 드래그의 applyForcePositions
            // 가 stale 드롭 좌표를 되쓰지 않게 (S8 결함 5와 같은 계약). heat=0 이라
            // 스프링 수렴 전엔 sim 이 tick 하지 않아 목표 좌표 시드가 안전하다.
            simRef.current = createForceSimulation(
              world.nodes.map((n) => {
                const t = override.get(n.id);
                return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
              }),
              world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
            );
          }
        }
      }
      if (sim && (heatRef.current > 0 || pinned)) {
        // C1 B2 — radius-limited release settle: restrict BOTH the live-drag
        // tick and the post-release settle burst to the dragged node's own
        // cluster (itself + 1-hop + 2-hop), so far nodes never drift via FA2
        // either (matching the explicit tug's own falloff below).
        const affected = dragAffectedSetRef.current;
        // **«움직일 수 있는 것» ∩ «그려지는 것».**
        // 허브를 끌면 1홉+2홉이 그래프 대부분이라 홉 제한만으로는 안 걸러진다
        // (실측: 활성 집합만 적용했을 때 137.6 → 137.6ms, 이득 0). 접혀서 화면에
        // 없는 노드는 힘을 받아 움직여도 아무 데도 안 보이므로 계산 대상이 아니다.
        const clustered = clusteredIdsRef.current;
        const restrictToIds = affected
          ? new Set<string>(
              [affected.draggedId, ...affected.oneHop, ...affected.twoHop].filter(
                (id) => !clustered.has(id),
              ),
            )
          : null;
        // **좁힌 경로는 «희소할 때만» 이득이다** (2026-07-31 구간 실측).
        //
        // 이 프레임에 좌표를 쓰는 주체가 셋인데 그중 이웃 터그는 접힌 노드까지
        // 포함한 1/2홉 전체를 매 프레임 민다. 그래서 «움직인 노드» 는 감사가
        // 가정한 ~30 이 아니라 **터그 영향권의 크기**다 — 프로젝트 루트를 끌면
        // 975/3000(33%)이라 인덱스 우회가 오히려 손해였고(기하 0.4 → 0.6ms),
        // 도메인을 끌면 281/3000(9%)이라 시뮬 블록이 2.1 → 1.5ms 로 줄었다.
        //
        // 그래서 갈림길을 하나 둔다: 희소하면 좁히고, 아니면 **스냅샷조차 뜨지
        // 않고** 종전 전체 경로 그대로 간다. 이득이 없을 때 비용만 남기지 않는
        // 것이 이 판정의 목적이다.
        const nodeCount = world.nodes.length;
        const scoped =
          affected !== null &&
          (affected.oneHop.size + affected.twoHop.size + 1) * SCOPED_FRAME_SPARSITY < nodeCount;
        let prevX: Float64Array | null = null;
        let prevY: Float64Array | null = null;
        if (scoped) {
          // 프레임 시작 좌표를 떠 둔다 — 프레임 끝에서 «정말 움직인 것» 을 실측해
          // 파생 기하 갱신을 거기로 좁힌다.
          if (geomPrevXRef.current?.length !== nodeCount) {
            geomPrevXRef.current = new Float64Array(nodeCount);
            geomPrevYRef.current = new Float64Array(nodeCount);
          }
          prevX = geomPrevXRef.current!;
          prevY = geomPrevYRef.current!;
          for (let i = 0; i < nodeCount; i += 1) {
            prevX[i] = world.nodes[i].x;
            prevY[i] = world.nodes[i].y;
          }
        }

        sim.tick(forceIterationsForDt(dt), restrictToIds);
        // **되쓸 대상도 제한한다.** 제한 틱은 부분 그래프 밖 좌표를 건드리지
        // 않으므로 그 값을 다시 써 넣는 것은 무의미한 3000회 왕복이다. 단
        // **터그 이웃과 직전 프레임의 겹침-밀림 노드는 포함해야 한다** — 이 되쓰기가
        // 그들의 프레임 변위를 0 으로 되돌리는 것이 기존 계약이고, 빠뜨리면
        // 터그 오프셋이 프레임마다 누적돼 이웃이 날아간다.
        const applyOnly =
          scoped && affected
            ? new Set<string>([
                affected.draggedId,
                ...affected.oneHop,
                ...affected.twoHop,
                ...sepDisplacedIdsRef.current,
              ])
            : null;
        applyForcePositions(world, sim.positions(applyOnly));

        // C1 B1 — explicit neighbor tug: the dragged node's own per-frame
        // world-space displacement (Δ since grab) propagates to 1-hop/2-hop
        // neighbors, falling off by hop distance, eased in/out so the motion
        // reads as springy lag-then-catch-up rather than a rigid rod. Also
        // runs (easing back toward 0) during the post-release settle so the
        // offset doesn't pop away the instant the pointer lifts.
        if (affected) {
          const draggedNode = world.nodeById.get(affected.draggedId);
          const dragStart = dragStartPosRef.current;
          const factors = { oneHop: tokens.dragTug1Hop, twoHop: tokens.dragTug2Hop };
          const tugIds = new Set<string>([...affected.oneHop, ...affected.twoHop]);
          for (const id of tugIds) {
            const hop = affected.oneHop.has(id) ? 1 : 2;
            const tugged = world.nodeById.get(id);
            // Hop count says WHO may be tugged; world distance from the grab
            // point says HOW MUCH. Without the distance term a hub-and-spoke
            // vault (everything within 2 hops) drags the whole map along.
            // Measured from `dragStart`, not the dragged node's live position,
            // so the elastic neighborhood is fixed at grab time and neighbors
            // never fade in/out mid-drag.
            const falloff =
              tugged && dragStart
                ? tugFalloffForDistance(Math.hypot(tugged.x - dragStart.x, tugged.y - dragStart.y), tokens.dragTugRadius)
                : 0;
            const factor = tugFactorForHop(hop, factors) * falloff;
            let targetX = 0;
            let targetY = 0;
            if (pinned && draggedNode && dragStart) {
              targetX = (draggedNode.x - dragStart.x) * factor;
              targetY = (draggedNode.y - dragStart.y) * factor;
            }
            const prevOffset = dragTugOffsetsRef.current.get(id) ?? { x: 0, y: 0 };
            // A8 — under reduced motion the neighbor offset tracks the pointer
            // 1:1 (user-driven position, no animated lag/catch-up easing).
            const nextOffset = reducedMotionRef.current
              ? { x: targetX, y: targetY }
              : {
                  x: stepTugAxis(prevOffset.x, targetX, dt, DRAG_TUG_EASE_TAU),
                  y: stepTugAxis(prevOffset.y, targetY, dt, DRAG_TUG_EASE_TAU),
                };
            dragTugOffsetsRef.current.set(id, nextOffset);
            if (tugged) {
              tugged.x += nextOffset.x;
              tugged.y += nextOffset.y;
            }
          }
        }

        // B7 — 드래그/정착이 만든 겹침을 같은 프레임에서 완화 (호밍 중에는
        // 호출되지 않는 블록이라 첫 지도 연출의 의도적 모임은 보호된다).
        {
          // **그려지지 않는 노드는 겹칠 수 없다.**
          //
          // 밀도 게이트로 접힌 서브트리는 칩 하나로 대체되어 화면에 없다
          // (실측 synth=3000: 3000개 중 **2820개(94%)가 접혀 있고 화면 안은
          // 118개**). 안 보이는 것들끼리의 겹침을 푸는 것은 결과가 아무 데도
          // 나타나지 않는 순수 낭비인데, 쌍 수는 N² 라 그 낭비가 프레임의
          // 78%(109.3ms)를 먹고 있었다.
          //
          // 소유자가 세 번 물은 것이 정확히 이것이다 — *"화면에 보이는 건
          // 20개인데 왜 3000개를 다 계산하나"*. 데이터로 들고 있는 것과 매
          // 프레임 계산에 넣는 것은 다른 얘기이고, 여기서 그 둘이 구분 없이
          // 같았다.
          const drawnIdx: number[] = [];
          const sepNodes: SeparationNode[] = [];
          for (let i = 0; i < world.nodes.length; i += 1) {
            const n = world.nodes[i];
            if (clusteredIdsRef.current.has(n.id)) continue;
            drawnIdx.push(i);
            sepNodes.push({
              id: n.id,
              x: n.x,
              y: n.y,
              r: radiusForKind(n.kind, tokens) * n.magnitudeScale,
            });
          }
          // **이번 프레임에 실제로 움직인 것만 검사한다.** 정지-정지 쌍은 지난
          // 프레임에 이미 안 겹쳤으므로 새로 겹칠 수 없다.
          //
          // 힘 시뮬은 이 집합(`dragAffectedSetRef`)을 **이미 받고 있었는데**
          // 겹침 해소만 안 받아서, 3000노드에서 프레임당 900만 회 거리 계산의
          // 99.99%가 «둘 다 정지» 였다(2026-07-31 실측 109.3ms, 프레임의 78%).
          // 집합이 없으면(정착 종료 후 등) 종전대로 전 노드 — 동작 동일.
          const sepActive = affected
            ? new Set<string>([affected.draggedId, ...affected.oneHop, ...affected.twoHop])
            : null;
          relaxNodeSeparation(sepNodes, {
            ratio: tokens.nodeMinSeparationRatio,
            iterations: 2,
            pinnedId: nodeDragRef.current?.nodeId ?? null,
            activeIds: sepActive,
          });
          // 밀린 노드를 여기서 기록해 둔다 — 다음 프레임의 좁힌 write-back 이
          // 이들의 «되돌림» 을 빠뜨리지 않게 (위 `applyOnly`).
          const sepDisplaced = sepDisplacedIdsRef.current;
          sepDisplaced.clear();
          for (let i = 0; i < sepNodes.length; i += 1) {
            const target = world.nodes[drawnIdx[i]];
            if (scoped && (target.x !== sepNodes[i].x || target.y !== sepNodes[i].y)) {
              sepDisplaced.add(target.id);
            }
            target.x = sepNodes[i].x;
            target.y = sepNodes[i].y;
          }
        }
        // 이 프레임에 좌표가 실제로 바뀐 노드만 — 셋(힘·터그·겹침) 중 누가 썼든
        // 결과로 판정하므로 어느 하나를 빠뜨릴 수 없다.
        let movedIds: Set<string> | null = null;
        if (prevX && prevY) {
          movedIds = new Set<string>();
          for (let i = 0; i < nodeCount; i += 1) {
            const node = world.nodes[i];
            if (node.x !== prevX[i] || node.y !== prevY[i]) movedIds.add(node.id);
          }
        }
        recomputeWorldGeometry(world, tokens, movedIds);
        // A4 — heat is a TIME budget (ms), not a frame count, so the release
        // settle lasts `--topology-v2-node-release-settle-ms` on every display.
        if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
        if (!pinned && heatRef.current <= 0) {
          // Settle burst finished — release the affected-set restriction and
          // drop any residual (by-now-decayed-near-0) tug offsets.
          dragAffectedSetRef.current = null;
          dragTugOffsetsRef.current.clear();
          sepDisplacedIdsRef.current.clear();
          // 드래그 동안 bbox 는 «넓히기만» 했다(팬 클램프라 넉넉한 쪽이 안전).
          // 정착이 끝나는 이 한 프레임에서 정확한 값으로 되돌린다 — 안쪽으로
          // 모인 그래프의 클램프가 드래그 이전보다 헐렁한 채 남지 않게.
          recomputeWorldGeometry(world, tokens);
        }
      }

      // C1 B3 — auto-arrange homing: springs every node back to its own
      // `homeX`/`homeY` over a short critically-damped transition, independent
      // of the FA2/tug block above (relayout resets heat/pin, so the two never
      // run in the same frame in practice).
      if (homingActiveRef.current) {
        // A8 — reduced-motion users get the relayout RESULT, not the journey.
        // 결계 불변식 — 영역 중 호밍 목표는 오버라이드(영역 insideTargets)가
        // 우선한다. null 이면 기존 전역 homeX/homeY 계약 그대로.
        const homeOverride = homeTargetOverrideRef.current;
        if (reducedMotionRef.current) {
          for (const node of world.nodes) {
            if (!homeSpringsRef.current.has(node.id)) continue;
            const t = homeOverride?.get(node.id);
            node.x = t?.x ?? node.homeX;
            node.y = t?.y ?? node.homeY;
          }
          recomputeWorldGeometry(world, tokens);
          homingActiveRef.current = false;
          homeSpringsRef.current.clear();
          homeTargetOverrideRef.current = null;
        } else {
          let allConverged = true;
          for (const node of world.nodes) {
            const spring = homeSpringsRef.current.get(node.id);
            if (!spring) continue;
            const t = homeOverride?.get(node.id);
            const targetX = t?.x ?? node.homeX;
            const targetY = t?.y ?? node.homeY;
            // A5 — homing has its own ω (7.5): a relayout is a layout
            // CORRECTION and should end decisively, unlike the camera's
            // cinematic transition spring (4.7) this used to borrow.
            const nextSpring = stepHomeSpring(spring, targetX, targetY, dt, tokens.nodeHomeSpringAngFreq, tokens.cameraDampingDefault);
            homeSpringsRef.current.set(node.id, nextSpring);
            node.x = nextSpring.x.value;
            node.y = nextSpring.y.value;
            if (!isHomeSpringConverged(nextSpring, targetX, targetY, HOME_CONVERGE_EPSILON)) allConverged = false;
          }
          recomputeWorldGeometry(world, tokens);
          if (allConverged) {
            homingActiveRef.current = false;
            homeSpringsRef.current.clear();
            homeTargetOverrideRef.current = null;
          }
        }
      }

      // --- S4 "영역 전개" 좌표 스텝: 안 노드 FLIP + 밖 노드 중력 이탈. tick 으로
      // entering→active / exiting→idle 정착. 이탈(exiting)은 위 호밍이 홈으로
      // 되돌리므로 여기선 좌표를 건드리지 않는다(배타). ---
      {
        const rt = realmTransitionReducer(realmTransitionRef.current, { type: "tick", now });
        realmTransitionRef.current = rt;
        const data = realmDataRef.current;
        if (data && rt.phase === "entering") {
          const elapsed = now - rt.startMs;
          const flipDur = reducedMotionRef.current ? 0 : REALM_INSIDE_FLIP_MS;
          const flingDur = reducedMotionRef.current ? 0 : REALM_OUTSIDE_FLING_MS;
          const outsideCulled = isRealmOutsideCulled(rt, now);
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              const from = data.insideFrom.get(node.id) ?? target;
              // S5 깊이 계층 순차 조립 — 멤버 깊이별로 FLIP 시작을 계단식으로
              // 밀어 루트→바깥 링이 층층이 앉는 공감각을 만든다(각 링 660 유지).
              const delay = realmInsideFlipDelayFor(data.depthById.get(node.id) ?? 1);
              const p = realmInsidePosition(from, target, elapsed - delay, flipDur);
              node.x = p.x;
              node.y = p.y;
            } else if (!outsideCulled) {
              const from = data.outsideFrom.get(node.id);
              if (from) {
                const p = realmOutsidePosition(from, data.flingCenter, elapsed, {
                  duration: flingDur,
                  fallbackAngle: fallbackAngleFor(node.id),
                });
                node.x = p.x;
                node.y = p.y;
              }
            }
          }
          recomputeWorldGeometry(world, tokens);
        } else if (data && rt.phase === "active") {
          // S8 결함 5 — 정착: 한 번만 목표로 스냅하고 sim 을 영역 좌표로 재시드해
          // 좌표 소유권을 일반 경로(드래그/sim/호밍)에 넘긴다. 이후 active 프레임은
          // 좌표를 덮어쓰지 않아 드래그가 정상 동작한다(매 프레임 target 로 덮어쓰던
          // 구조가 드래그와 싸워 노드가 안 움직였다 — 소유자 실보고).
          if (!realmActiveHandedOffRef.current) {
            for (const node of world.nodes) {
              const target = data.insideTargets.get(node.id);
              if (target) {
                node.x = target.x;
                node.y = target.y;
              }
            }
            // sim 을 현재(영역) 좌표로 재시드 — 안 하면 드래그 첫 tick 의
            // applyForcePositions 가 빌드 시 전역 좌표를 되써 멤버가 튄다.
            simRef.current = createForceSimulation(
              world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
              world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
            );
            realmActiveHandedOffRef.current = true;
            recomputeWorldGeometry(world, tokens);
          }
        } else if (data && rt.phase === "exiting" && !reducedMotionRef.current) {
          // S6 퇴장 역재생 — 안 노드 역FLIP(깊은 층 먼저, target→home) + 밖 노드
          // 역중력 귀환(fling 위치→home). 입장 스텝의 결정론 역전. reduced-motion
          // 은 위 exit effect 가 이미 홈으로 스냅 + duration0 로 즉시 idle 이라 여긴
          // 안 온다.
          const elapsed = now - rt.startMs;
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              const home = data.insideFrom.get(node.id) ?? target;
              const delay = realmExitFlipDelayFor(data.depthById.get(node.id) ?? 1);
              const p = realmInsidePosition(target, home, elapsed - delay, REALM_EXIT_FLIP_MS);
              node.x = p.x;
              node.y = p.y;
            } else {
              const from = data.outsideFrom.get(node.id);
              if (from) {
                const p = realmOutsideReturnPosition(from, data.flingCenter, elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS, {
                  duration: REALM_EXIT_OUTSIDE_RETURN_MS,
                  fallbackAngle: fallbackAngleFor(node.id),
                });
                node.x = p.x;
                node.y = p.y;
              }
            }
          }
          recomputeWorldGeometry(world, tokens);
          // 이탈 프레이밍 결함(노드 감사 2026-07-24): 진입 시 collapse 된 영역
          // 레이아웃에서 `overviewScaleRef` 가 collapsed spineFit(≈0.24)로 굳어,
          // 이탈 후 stepCamera 의 scale 상한(overviewEntryScale×maxZoomRatio)이
          // ≈0.73 으로 눌려 카메라가 canonical overview(≈1.14)에 못 오르고
          // 축소 프레임에 고착됐다. 역재생으로 노드가 홈으로 돌아오는 매 프레임
          // spineBounds 가 회복되므로 상한 anchor 를 라이브로 재계산해 트윈→스프링
          // 인계 시점에 상한이 목표를 누르지 않게 한다(fresh/deselect 경로와 동치).
          overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
        } else if (rt.phase === "idle" && realmDataRef.current !== null) {
          // 이탈 완료 — 역재생이 홈으로 되돌렸으니 realm 데이터 정리 + 홈 spineBounds
          // 기준으로 overview anchor 를 최종 확정(위 exiting 재계산의 마감).
          realmDataRef.current = null;
          overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
        }
      }

      const focusedNodeId = focusedSlugRef.current;
      // 포커스 중엔 호버를 널링한다("포커스가 emphasis 소유권 독점"). 걸어온 길
      // 렌즈는 이 규칙의 **유일한 예외**다 — 렌즈 동안 커서는 캔버스가 아니라
      // 팝오버 위에 있어 캔버스 호버와 경쟁하지 않고, 행 hover 가 지도 호버
      // 채널을 그대로 빌려 브러싱(행 ↔ 노드)을 만든다. 렌즈가 꺼지면 즉시
      // 원래 규칙으로 돌아온다.
      const trailLensActive = trailLensPropRef.current?.current ?? false;
      const trailBrushNodeId = trailLensActive ? (trailBrushPropRef.current?.current ?? null) : null;
      const hoveredNodeId = trailBrushNodeId ?? (focusedNodeId ? null : hoveredNodeIdRef.current);
      // Panel-row emphasis only bites while a node is focused (that's the only
      // time the "연결된 노드" list exists) — otherwise hover owns the ripple.
      const panelEmphasisNodeId = focusedNodeId ? panelEmphasisNodeIdRef.current : null;

      // S3 마감 폴리시 — 큐빅 카메라 전환 트윈. 진행 중이면 이번 프레임 카메라를
      // 이징으로 직접 구동하고 physics-step 의 스프링을 건너뛴다(freezeCamera).
      // reduced-motion 은 트윈을 버리고 스프링/스냅 경로에 위임. 트윈 종료 시
      // 최종값으로 스냅 후 해제 — 이후 프레임은 스프링이 목표에 정지해 있다.
      let freezeCamera = false;
      {
        const tween = cameraTweenRef.current;
        if (tween) {
          if (reducedMotionRef.current) {
            cameraTweenRef.current = null;
          } else {
            const elapsed = now - tween.startMs;
            if (elapsed >= tween.durationMs) {
              cameraRef.current = {
                x: { value: tween.target.x, velocity: 0 },
                y: { value: tween.target.y, velocity: 0 },
                scale: { value: tween.target.scale, velocity: 0 },
              };
              cameraTweenRef.current = null;
            } else {
              const eased = easeCameraKeyframe(tween.start, tween.target, elapsed, tween.durationMs);
              cameraRef.current = {
                x: { value: eased.x, velocity: 0 },
                y: { value: eased.y, velocity: 0 },
                scale: { value: eased.scale, velocity: 0 },
              };
              freezeCamera = true;
            }
          }
        }
      }

      const { camera, farT, zoomRatio } = stepTopologyPhysics({
        world,
        camera: cameraRef.current,
        target: cameraTargetRef.current,
        damping: dampingRef.current,
        overviewScale: overviewScaleRef.current,
        tokens,
        cameraAngularFrequency: cameraAngularFreqRef.current ?? tokens.cameraSpringAngFreqTransition,
        dt,
        now,
        // 앰비언트 휴면 — 혜성 속도에 곱해지는 계수(각성 1 → 잠듦 0).
        // 유휴 게이트 판정부와 다른 스코프라 여기서 다시 구한다. 순수 산술
        // 함수라 비용이 없고, 같은 `now`/`lastInputMs` 면 같은 값이다.
        ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
        focusedNodeId,
        pairFocusActive: selectedEdgeRef.current !== null,
        hoveredNodeId,
        panelEmphasisNodeId,
        isDragging: pointerMachineRef.current.phase === "dragging",
        reducedMotion: reducedMotionRef.current,
        userDrivenCamera: userDrivenCameraRef.current,
        freezeCamera,
        // **직전 프레임의** 접힘 집합이다 — 이번 프레임 것은 아래 클러스터
        // 단계에서야 정해진다. 램프는 시간 위의 값이라 한 프레임 지연이 곧
        // 정상 동작이고(펼친 노드는 다음 프레임부터 0 에서 램프 인, 접힌
        // 노드는 한 프레임 더 램프), 순서를 뒤집어 얻을 것이 없다.
        clusteredIds: clusteredIdsRef.current,
        emphasisById: emphasisRef.current,
        rippleStartById: rippleStartRef.current,
        egoRevealById: egoRevealRef.current,
        focusRampById: focusRampRef.current,
        appearById: appearRef.current,
        tierReveal: tierRevealRef.current,
      });
      cameraRef.current = camera;

      // Click-focus signature — refresh the retained color focus. While a
      // selection is live, mirror it; after a deselect, hold the last focus so
      // the color fade has a dim/ego target to ease from, clearing only once the
      // retained subject's ramp has decayed (~160ms) — then the selection ring
      // and background dim have fully faded out (④·⑨). Reduced motion snaps the
      // ramp to 0 the same frame, so this clears immediately too.
      {
        const livePairFocus = selectedEdgeRef.current;
        if (focusedNodeId !== null || livePairFocus !== null) {
          colorFocusRef.current = { focusedNodeId, selectedEdge: livePairFocus };
        } else if (colorFocusRef.current !== null) {
          const retained = colorFocusRef.current;
          const probeId =
            retained.focusedNodeId ?? retained.selectedEdge?.sourceId ?? retained.selectedEdge?.targetId ?? null;
          const retainedRamp = probeId !== null ? (focusRampRef.current.get(probeId) ?? 0) : 0;
          if (retainedRamp < 0.02) colorFocusRef.current = null;
        }
      }

      // R6 호버 펄스 — 수명(420ms) 지난 펄스 제거. 발사(append)는 포인터
      // 핸들러의 호버 경로가 한다(프로토타입 startRipple 의 펄스 부분).
      pulsesRef.current = updatePulses(pulsesRef.current, now);

      // --- S5 깊이 시차 스텝 — 영역 active 중 카메라 입력(팬/줌으로 이동한 월드
      // 중심)의 프레임 델타를 깊이 밴드별 오프셋에 충전한다. 카메라 정지 시
      // exp 감쇠로 0 수렴 — reduced-motion 은 오프셋 0(effect 없음). 감쇠 꼬리는
      // 유휴 grace(1200ms) 안에 사실상 0 이 되므로(tau 0.18s) 별도 wake 배선
      // 없이 idle-gate 계약을 지킨다. entering 페이즈의 돌리-인은 프로그램적
      // 이동이라 시차에서 제외(입력 반응만) — 중심만 동기화해 active 진입 시
      // 큰 델타가 튀지 않게 한다. ---
      {
        const realmActive =
          realmDataRef.current !== null &&
          realmTransitionRef.current.phase === "active" &&
          !reducedMotionRef.current;
        const prevC = prevCameraCenterRef.current;
        if (realmActive && prevC) {
          const delta = { x: camera.x.value - prevC.x, y: camera.y.value - prevC.y };
          const depthById = realmDataRef.current!.depthById;
          realmParallaxDepth2Ref.current = stepDepthParallax(
            realmParallaxDepth2Ref.current,
            delta,
            depthParallaxFactorForDepth(2),
            dt,
          );
          realmParallaxDepth3Ref.current = stepDepthParallax(
            realmParallaxDepth3Ref.current,
            delta,
            depthParallaxFactorForDepth(3),
            dt,
          );
          const d2 = realmParallaxDepth2Ref.current;
          const d3 = realmParallaxDepth3Ref.current;
          realmParallaxRef.current =
            isDepthParallaxActive(d2) || isDepthParallaxActive(d3)
              ? { depthById, depth2: d2, depth3: d3 }
              : null;
        } else {
          realmParallaxDepth2Ref.current = ZERO_PARALLAX;
          realmParallaxDepth3Ref.current = ZERO_PARALLAX;
          realmParallaxRef.current = null;
        }
        prevCameraCenterRef.current = { x: camera.x.value, y: camera.y.value };
      }

      // M-5 — emit the semantic-zoom tier only when it changes (spine →
      // circuit → element), so the corner readout's orientation hint tracks
      // what's actually drawn. Same reveal bands as the draw pass (default
      // config), so the label and the visible nodes can't contradict.
      // S6 진입 히치 제거 — `onZoomTierChange` 는 HomePage 의 setState 라 호출마다
      // 페이지 전체를 재렌더한다. 영역 전개/해제의 프로그램적 카메라 돌리 중엔
      // 스케일이 tier 경계를 가로지르며 매번 방출돼 안무 프레임을 얼렸다(진입
      // +331ms 125ms 히치, perf-realm 실측). 전환(entering/exiting) 중엔 방출을
      // 미루고, 정착(active/idle) 후 아래 비교가 최종 tier 를 한 번만 방출한다.
      const realmTransitioning =
        realmTransitionRef.current.phase === "entering" || realmTransitionRef.current.phase === "exiting";
      const nextZoomTier = classifyZoomTier(zoomRatio, tierRevealRef.current);
      if (!realmTransitioning && nextZoomTier !== lastZoomTierRef.current) {
        lastZoomTierRef.current = nextZoomTier;
        onZoomTierChangeRef.current?.(nextZoomTier);
      }

      // 밀도 게이트 (fable 설계) — 이번 프레임의 접힘/칩 상태를 라이브 위치로
      // 계산한다(부모가 드래그/살아있는 그래프로 움직이면 칩 anchor 도 따라감).
      // 판정 로직은 순수 모델(`density-gate.ts`), 여긴 좌표 주입만.
      // 영역 전개 중엔 영역 루트를 항상 펼침 취급 — 루트 직속 자식은 그
      // 세계의 스파인이라 게이트로 접으면 영역이 텅 빈 링으로 보인다
      // (전역 도메인 면제와 같은 논리, /?synth=2000 실증). prop 이 아니라
      // ref 를 읽는다 — 프레임 클로저가 stale realmRootId 를 캡처해 버튼
      // 클릭 진입에선 펼침이 안 먹던 결함(녹화 프레임 검수 실증).
      const liveRealmRootId = realmDataRef.current?.rootId ?? null;
      // 소유자 실보고 (2026-07-23, capability 영역 텅 빈 링) — 루트만 펼침
      // 취급하면 부족하다: 루트 자신이 바깥 세계에서 밀도 게이트에 접힌
      // 자식(예: 역량 28개 도메인의 capability)이면 루트·멤버 전원이
      // clusteredIds 에 걸려 영역이 통째로 비어 보인다. 루트의 contains
      // 조상 체인까지 펼침 취급해 바깥 게이트가 영역 내부를 가리지 못하게
      // 한다 (조상의 다른 자식들은 어차피 realm 밖 하드 컬 대상).
      let effectiveExpanded: ReadonlySet<string> = expandedParentsRef.current;
      if (liveRealmRootId) {
        // 조상 체인은 rootId 기준으로 1회만 계산해 캐시 (프레임 루프 내부).
        if (realmExpandChainRef.current?.rootId !== liveRealmRootId) {
          const chain = new Set<string>([liveRealmRootId]);
          let cursor: string | null = liveRealmRootId;
          while (cursor) {
            let parent: string | null = null;
            for (const [pid, kids] of world.childrenByParent) {
              if (kids.includes(cursor)) {
                parent = pid;
                break;
              }
            }
            if (!parent || chain.has(parent)) break;
            chain.add(parent);
            cursor = parent;
          }
          realmExpandChainRef.current = { rootId: liveRealmRootId, chain };
        }
        const withRealm = new Set(expandedParentsRef.current);
        for (const id of realmExpandChainRef.current.chain) withRealm.add(id);
        effectiveExpanded = withRealm;
      }
      const clusterState = computeTopologyClusterState(world, effectiveExpanded);

      // S2 파트 3a — 선택적 ego: 포커스 노드의 이웃이 limit 을 넘으면 DOI 상위
      // (revealedBatches × limit)만 남기고 나머지는 접는다(clusteredIds 에 합류 →
      // 노드·엣지·라벨이 기존 스킵 경로로 함께 숨는다). `이웃 +N` 칩은 같은
      // 렌더/히트 경로를 타는 ClusterChip(ego:true)로 얹는다. 세션 임시 상태.
      let frameClusteredIds: ReadonlySet<string> = clusterState.clusteredIds;
      let frameChips: readonly ClusterChip[] = clusterState.chips;
      // 영역 활성 시 — 멤버가 **바깥** 부모의 밀도 게이트로 접혀 있으면 해제
      // (공유 요소의 1차 귀속처가 영역 밖 역량인 케이스). 영역 안 부모의
      // 게이트(내부 +N 칩)는 유지한다. realmVisibleBounds 의 가시-멤버
      // 규칙과 동일해야 결계/프레이밍과 드로우가 갈라지지 않는다.
      if (liveRealmRootId && realmDataRef.current) {
        const memberIds = realmDataRef.current.memberIds;
        let needsFilter = false;
        for (const id of frameClusteredIds) {
          if (memberIds.has(id)) {
            const pid = world.nodeById.get(id)?.parentId ?? null;
            if (!pid || !memberIds.has(pid)) {
              needsFilter = true;
              break;
            }
          }
        }
        if (needsFilter) {
          const filtered = new Set<string>();
          for (const id of frameClusteredIds) {
            if (memberIds.has(id)) {
              const pid = world.nodeById.get(id)?.parentId ?? null;
              if (!pid || !memberIds.has(pid)) continue;
            }
            filtered.add(id);
          }
          frameClusteredIds = filtered;
        }
      }
      {
        const focusId = focusedSlugRef.current;
        const neighbors = focusId ? world.neighborMap.get(focusId) : undefined;
        if (focusId && neighbors && neighbors.size > expandPrefRef.current.batchSize) {
          // DOI 관계 위계 — 포커스 노드에 닿는 엣지의 원 relationType(WorldEdge.
          // relationType, contains|depends 2치로 뭉개기 전)을 이웃별로 수집한다.
          // 같은 페어에 엣지가 여럿이면 강한 쪽(contains > depends > relates)을
          // 남긴다 — DOI 는 "가장 강한 구조적 결속"으로 랭크하는 게 맞다.
          // O(E) 스캔이지만 이 블록은 >24 이웃 허브 포커스 중에만 돈다.
          const relTier = (t: string): number =>
            t === "contains" || t === "belongs_to" ? 3 : t === "depends_on" ? 2 : 1;
          const relByNeighbor = new Map<string, string>();
          for (const edge of world.edges) {
            const other =
              edge.sourceId === focusId ? edge.targetId : edge.targetId === focusId ? edge.sourceId : null;
            if (other === null) continue;
            const prevRel = relByNeighbor.get(other);
            if (prevRel === undefined || relTier(edge.relationType) > relTier(prevRel)) {
              relByNeighbor.set(other, edge.relationType);
            }
          }
          const entries: EgoNeighborRankEntry[] = [];
          for (const id of neighbors) {
            const n = world.nodeById.get(id);
            entries.push({
              id,
              kind: n?.kind ?? "element",
              degree: world.neighborMap.get(id)?.size ?? 0,
              relationType: relByNeighbor.get(id),
            });
          }
          const ranked = rankEgoNeighborsByDOI(entries);
          const sel = selectiveEgoNeighbors(
            ranked,
            egoRevealBatchesRef.current,
            expandPrefRef.current.batchSize,
          );
          if (sel.hiddenCount > 0) {
            // 영역 언클러스터 필터가 적용된 frameClusteredIds 를 기반으로 합친다
            // (clusterState 원본을 다시 쓰면 위 realm 보정이 무효화된다).
            frameClusteredIds = new Set<string>([...frameClusteredIds, ...sel.hiddenNeighbors]);
            const focusNode = world.nodeById.get(focusId);
            if (focusNode) {
              // 포커스 노드 바로 아래(월드)에 앵커 — 반지름 + 여유만큼 내린다.
              const r = radiusForKind(focusNode.kind, tokens) * focusNode.magnitudeScale;
              frameChips = [
                ...clusterState.chips,
                {
                  parentId: EGO_NEIGHBOR_CHIP_ID,
                  count: sel.hiddenCount,
                  expanded: false,
                  anchor: { x: focusNode.x, y: focusNode.y + r + 26 },
                  ego: true,
                },
              ];
            }
          }
        }
      }
      // --- 고팬아웃 배치-공개(2026-07) — 펼친 클러스터 부모의 자식을 DOI 순
      //     배치로 드러낸다. density-gate 는 펼친 부모의 게이트 자식을 전량
      //     노출하므로(수백 자식이 한 번에 쏟아져 라벨/노드가 뭉갬) 여기서
      //     런타임 후처리: ① 게이트 자식(domain 면제 — density-gate 와 동일)을
      //     rankEgoNeighborsByDOI 정렬 ② 상위 (배치수 × EGO_NEIGHBOR_LIMIT)만
      //     보이고 ③ 나머지 + 그 서브트리는 frameClusteredIds 로 되돌려 접고
      //     ④ 부모 옆(펼침 배지 anchor)에 `+N 더보기` 칩(합성 id)을 얹는다. 칩
      //     클릭은 그 부모의 배치를 +1(clusterRevealBatchesRef, URL 비영속).
      //     학습비용 0 — `이웃 +N` 배치-공개와 동형 UX. ego 블록이 이미
      //     frameChips 를 새 배열로 바꿨을 수 있으므로 append 로 이어받는다. ---
      const batchAppearVisible = new Set<string>();
      {
        const expandedNow = new Set<string>();
        const moreChips: ClusterChip[] = [];
        const hiddenFromBatch = new Set<string>();
        const prevVisible = prevBatchVisibleRef.current;
        // 배치는 사용자가 명시적으로 펼친 부모만(URL `?open=`) 대상이다. 영역
        // 진입이 자동 주입한 펼침(realmExpandChain — 그 세계의 스파인)은 배치로
        // 다시 접으면 영역이 텅 비므로 제외한다.
        const userExpanded = expandedParentsRef.current;
        const realmChain = realmExpandChainRef.current?.chain;
        for (const chip of clusterState.chips) {
          if (!chip.expanded || chip.ego) continue;
          const parentId = chip.parentId;
          if (!userExpanded.has(parentId) || realmChain?.has(parentId)) continue;
          expandedNow.add(parentId);
          // density-gate 와 같은 domain 면제 — 스파인 자식은 배치 대상 아님.
          const gated = (world.childrenByParent.get(parentId) ?? []).filter(
            (c) => world.nodeById.get(c)?.kind !== "domain",
          );
          if (gated.length === 0) continue;
          const ranked = rankEgoNeighborsByDOI(
            gated.map((id) => ({
              id,
              kind: world.nodeById.get(id)?.kind ?? "element",
              degree: world.neighborMap.get(id)?.size ?? 0,
              // childrenByParent 유도 = 전원 contains — 균일 가중치, 순서 불변.
              relationType: "contains",
            })),
          );
          // shown = 배치수 × 24 (selectiveEgoNeighbors 와 동일 산식, 순서 보존
          // 위해 ranked.slice 직접). 잔여는 접고 `+N 더보기` 칩으로.
          const shown =
            Math.max(1, clusterRevealBatchesRef.current.get(parentId) ?? 1) *
            expandPrefRef.current.batchSize;
          const visibleOrdered = ranked.slice(0, shown);
          const hidden = ranked.slice(shown);
          for (const id of visibleOrdered) batchAppearVisible.add(id);
          if (hidden.length > 0) {
            // 잔여 자식 + 그 서브트리를 접는다(부모 없이 떠도는 손자 방지 —
            // density-gate clusteredIds 규칙과 동형).
            const stack = [...hidden];
            while (stack.length > 0) {
              const id = stack.pop() as string;
              if (hiddenFromBatch.has(id)) continue;
              hiddenFromBatch.add(id);
              const kids = world.childrenByParent.get(id);
              if (kids) stack.push(...kids);
            }
            // `+N 더보기` 칩 — 펼침 배지 anchor(자식 디스크 바깥, outward)에 세운다.
            // ego:true 로 표시해 펼침-디스크/그룹-리빌/chipReveal 로직에서 면제된다
            // (포인터가 합성 id 를 실제 부모로 해석해 툴팁/배치 점등 분기).
            moreChips.push({
              parentId: clusterMoreChipId(parentId),
              count: hidden.length,
              expanded: false,
              anchor: chip.anchor,
              ego: true,
            });
          }
          // 신규-공개 자식(직전 프레임 미공개)만 DOI 순 center-out stagger 스케줄
          // + 램프 0 시드. scheduleRipple(base 0 + i·rippleStaggerMs,
          // rippleStaggerMaxMs 예산 cap 재사용) — 24개도 총 ~180ms 안에 압축.
          const newly = visibleOrdered.filter((id) => !prevVisible.has(id));
          if (newly.length > 0) {
            const sched = scheduleRipple(parentId, now, newly, 0, tokens.rippleStaggerMs, tokens.rippleStaggerMaxMs);
            for (const s of sched) {
              if (s.nodeId === parentId) continue;
              batchAppearStartRef.current.set(s.nodeId, s.startAtMs);
              batchAppearRef.current.set(s.nodeId, 0);
            }
          }
        }
        // 접힌 부모의 배치 카운트 정리 — 다음 펼침은 다시 상위 24 부터.
        for (const pid of [...clusterRevealBatchesRef.current.keys()]) {
          if (!expandedNow.has(pid)) clusterRevealBatchesRef.current.delete(pid);
        }
        if (hiddenFromBatch.size > 0) {
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...hiddenFromBatch]);
        }
        if (moreChips.length > 0) {
          frameChips = [...frameChips, ...moreChips];
        }
        prevBatchVisibleRef.current = batchAppearVisible;
      }
      // --- S4 "영역 전개" — 밖 노드 하드 컬(fling 완료 후) + 결계 링 파라미터 ---
      const realmState = realmTransitionRef.current;
      const realmData = realmDataRef.current;
      let realmWarding: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null } | null = null;
      let realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null = null;
      let realmDustParallax = 0;
      // S5 — 깊이 연출용: 선명도(entering+active)는 depthById, 시차(active 만)는
      // 밴드 오프셋. 시차는 위 스텝이 이미 active+유의미일 때만 ref 를 채웠다.
      let realmDepthById: ReadonlyMap<string, number> | null = null;
      let realmDepthParallax: { depth2: DepthParallaxOffset; depth3: DepthParallaxOffset } | null = null;
      // S7 — 이탈 중 귀환하는 밖 노드의 materialize 알파(모션 감사 처방 B).
      // exiting 이고 reduced-motion 이 아닐 때만 채운다 — reduced-motion 은
      // exit effect 가 이미 즉시 홈으로 스냅해 이 프레임을 지나가지 않는다.
      let realmOutsideReturnAlphaById: Map<string, number> | null = null;
      if (
        realmData &&
        (realmState.phase === "entering" || realmState.phase === "active" || realmState.phase === "exiting")
      ) {
        const exiting = realmState.phase === "exiting";
        realmTierKinds = realmData.tierKindById;
        realmDepthById = realmData.depthById;
        // S5 시차 밴드는 active 전용 — 이탈 중엔 세계가 접히는 중이라 미적용.
        realmDepthParallax = !exiting && realmParallaxRef.current
          ? { depth2: realmParallaxRef.current.depth2, depth3: realmParallaxRef.current.depth3 }
          : null;
        if (realmState.phase === "entering" && !reducedMotionRef.current) {
          realmDustParallax = realmDustParallaxFactor(now - realmState.startMs);
        }
        // S7 — 귀환 중인 밖 노드마다 materialize 알파를 채운다. 위 좌표 스텝
        // (S6)이 같은 `elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS` 를 좌표에
        // 쓰므로 여기서도 그대로 재사용해 위치와 알파가 항상 같은 프레임에서
        // 일치한다(drift 0).
        if (exiting && !reducedMotionRef.current) {
          const elapsed = now - realmState.startMs - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS;
          const alphaMap = new Map<string, number>();
          for (const id of realmData.outsideFrom.keys()) {
            alphaMap.set(id, realmOutsideReturnAlpha(elapsed, REALM_EXIT_OUTSIDE_RETURN_MS));
          }
          realmOutsideReturnAlphaById = alphaMap;
        }
        // 이탈 중엔 밖 노드가 귀환하므로 컬하지 않는다(isRealmOutsideCulled 가
        // exiting 에 false). entering/active 에서만 fling 완료 후 하드 컬.
        if (isRealmOutsideCulled(realmState, now)) {
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...realmData.outsideIds]);
        }
        // 영역 밖 부모의 밀도 칩도 영역 세계에선 존재하지 않는다 — 노드는
        // 컬되는데 칩만 남으면 빈 우주에 칩이 떠도는 결함 (실화면 실증).
        // 고팬아웃 배치-공개 — `+N 더보기` 칩은 합성 id 라 실제 부모로 해석해
        // 멤버 판정(영역 안 부모의 배치 칩은 유지, 밖 부모 것은 함께 컬).
        frameChips = frameChips.filter((ch) =>
          realmData.memberIds.has(parseClusterMoreChipId(ch.parentId) ?? ch.parentId),
        );
        // S9 결함 2 — 결계 반경은 이번 프레임의 **가시 멤버**(밀도 게이트/ego 로
        // 접힌 것 제외)의 도달거리로 재적합한다. 접힌 phyllotaxis 자식까지 세던
        // 정적 `realmData.wardingRadius` 는 보이는 세계보다 훨씬 큰 원을 그렸다.
        // insideTargets(정착 좌표)로 측정해 진입 FLIP 중 매 프레임 목표가
        // 흔들리지 않게 하고, 가시 집합이 바뀔 때만 240ms 이징으로 옮긴다.
        const wc = realmData.wardingCenter;
        const reaches: number[] = [];
        for (const id of realmData.memberIds) {
          if (frameClusteredIds.has(id)) continue;
          const t = realmData.insideTargets.get(id);
          if (!t) continue;
          const mn = world.nodeById.get(id);
          const nr = mn ? radiusForKind(mn.kind, tokens) * mn.magnitudeScale : 0;
          reaches.push(Math.hypot(t.x - wc.x, t.y - wc.y) + nr);
        }
        const targetWardingRadius = computeVisibleWardingRadius(reaches);
        const nextFit = stepWardingFit(
          wardingFitRef.current ?? initWardingFit(targetWardingRadius),
          targetWardingRadius,
          now,
          reducedMotionRef.current,
        );
        wardingFitRef.current = nextFit;
        realmWarding = {
          centerX: realmData.wardingCenter.x,
          centerY: realmData.wardingCenter.y,
          radius: nextFit.value,
          // S6 — 이탈은 결계를 역방향으로 지운다(1→0); 입장은 지연 후 그린다(0→1).
          drawProgress: exiting
            ? realmWardingEraseProgress(now - realmState.startMs)
            : realmWardingDrawProgress(now - realmState.startMs - REALM_WARDING_DRAW_DELAY_MS),
          // 결계 센서스 각인 — 원이 "무엇의 경계인지" 스스로 말한다 (진입 시 1회 파생).
          caption: realmCaptionRef.current,
        };
      }

      // --- S4 궤도 "전개" 버튼 위치 — 포커스 노드 링 바깥 **정동(오른쪽)** 에
      // 앵커, 매 프레임 카메라 추종. 영역 안이거나 자식 없는 노드면 소멸.
      //
      // 우상단 45° 였다가 옮겼다(2026-08-02): 확장 컨트롤(어깨 배지)이 **같은
      // 방위**를 쓰고 있어서, 배지의 80% 가 이 버튼 밑으로 들어가고
      // `elementFromPoint` 가 이 버튼을 돌려줬다 — 배지는 눌리지 않았고 화면에
      // 삐져나온 끝 글자 하나가 거짓 수(`+17` → 「7」)로 읽혔다. 기본값인 머리
      // 위 막대도 우하단 모서리 80px² 가 물렸다. 방위 배분의 단일 출처와 근거는
      // `render/cluster-chips.ts` 의 「서로 다른 방위」 절이고, 반지름 전수
      // 겹침 0 은 `expand-settings.contract.test.ts` 가 잠근다. ---
      {
        const btn = realmEnterButtonElRef.current;
        if (btn) {
          const fid = focusedSlugRef.current;
          const node = fid ? world.nodeById.get(fid) : undefined;
          const hasChildren = fid ? (world.childrenByParent.get(fid)?.length ?? 0) > 0 : false;
          const engaged = realmState.phase !== "idle";
          const eligible = Boolean(fid && node && hasChildren && !engaged && onEnterRealmRef.current);
          // rank6 — 전개 버튼은 display flex/none 하드 토글(툭 나타남/사라짐)
          // 대신 opacity + pointer-events 로 페이드한다(CSS transition 150ms,
          // TopologyMapV2 JSX). 포커스 노드가 남아 있는 한 매 프레임 transform
          // 을 계속 갱신해 페이드아웃 중에도 카메라를 따라 붙는다(위치 고정 아님).
          if (node) {
            const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value;
            const s = worldToScreen(camera, width, height, node.x, node.y);
            // 자리의 단일 출처 — 확장 컨트롤의 사각형 계산이 같은 함수를 본다.
            const orbit = orbitButtonRect(s.x, s.y, rr);
            const bx = orbit.x + orbit.w / 2;
            const by = orbit.y + orbit.h / 2;
            btn.style.transform = `translate(-50%, -50%) translate(${bx}px, ${by}px)`;
          }
          // **탭 정지도 함께 켜고 끈다** (2026-07-29 키보드 실측).
          //
          // `opacity: 0` 은 포커스 가능성을 끄지 않는다. 그래서 이 버튼이 안
          // 보이는 동안에도 Tab 순서에 남아 있었고, 지도에서 26번째 Tab 이
          // 여기 멈췄다 — 링은 alpha 0 이라 화면 어디에도 안 보이고 Enter 도
          // 안 먹는다(클릭 판정은 캔버스 히트 테스트에 있다). 키보드 사용자
          // 에게는 **포커스가 사라진 한 칸**이었다.
          //
          // `pointerEvents` 를 끄는 바로 이 자리가 짝이다. 여기서 안 끄면
          // JSX 의 초기값만으로는 프레임마다 바뀌는 가시성을 따라갈 수 없다.
          if (eligible) {
            realmEnterTargetRef.current = fid;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.tabIndex = 0;
            btn.removeAttribute("aria-hidden");
          } else {
            realmEnterTargetRef.current = null;
            btn.style.opacity = "0";
            btn.style.pointerEvents = "none";
            btn.tabIndex = -1;
            btn.setAttribute("aria-hidden", "true");
          }
        }
      }

      // --- 가이드 투어 캔버스 노드 앵커(2·4단계) 프로젝션 — realm 버튼
      // 블록과 나란한 동형 블록. `tourAnchorNodeId` 가 가리키는 노드의 화면
      // 좌표 + 반경을 매 프레임 원(div)에 써넣는다. TopologyMapV2 가 그
      // 원 자체를 스크림 컷아웃으로 그린다(CSS transition 없음 — 이 매
      // 프레임 transform 이 곧 모션, spec §5). ---
      {
        const anchorEl = tourAnchorElRef.current;
        if (anchorEl) {
          const anchorId = tourAnchorNodeIdRef.current;
          const node = anchorId ? world.nodeById.get(anchorId) : undefined;
          if (node) {
            const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value;
            const s = worldToScreen(camera, width, height, node.x, node.y);
            anchorEl.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px)`;
            anchorEl.style.setProperty("--tour-anchor-r", `${rr + 10}px`);
          }
        }
      }

      // rank7 — 클러스터 칩 reveal 램프 스텝. 이번 프레임에 펼쳐진(!ego) 부모는
      // 1 로, 그 외 추적 중인 부모는 0 으로 `clusterRevealTau` 에 수렴한다. ~0 에
      // 도달하고 더는 펼쳐지지 않은 키는 정리한다. reduced-motion 은 즉시 스냅.
      {
        const revealMap = chipRevealRef.current;
        const expandedNow = new Set<string>();
        for (const ch of frameChips) {
          if (ch.expanded && !ch.ego) expandedNow.add(ch.parentId);
        }
        // 추적 대상 = 지금 펼친 부모 ∪ 이미 램프가 남아 있는(페이드아웃 중) 부모.
        const tracked = new Set<string>([...expandedNow, ...revealMap.keys()]);
        for (const pid of tracked) {
          const target = expandedNow.has(pid);
          const prev = revealMap.get(pid) ?? 0;
          const nextVal = reducedMotionRef.current
            ? (target ? 1 : 0)
            : stepEmphasis(prev, target, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          if (!target && nextVal <= 0.02) revealMap.delete(pid);
          else revealMap.set(pid, nextVal);
        }
      }

      // 고팬아웃 배치-공개 — 배치 자식의 등장 램프 스텝.
      //
      // **`clusterRevealTau` 를 쓴다 — 칩과 같은 값이다.** 종전엔
      // `egoRevealRiseTau`(0.22)였는데, 그건 *다른 사건*(ego 클릭)의 리듬이다.
      // 이 램프를 낳는 입력은 칩 클릭이고, 그 입력의 리듬은 칩의 pill/badge
      // 페이드가 이미 `clusterRevealTau`(0.17)로 정해 뒀다.
      //
      // ⚠️ **이 한 줄이 그 수정의 실제 도달 지점이다.** 앞서 다섯째 관통 채널
      // (`expandRevealRef`)의 tau 만 바꿨는데, 프레임 실측(design-motion,
      // 2026-07-31)이 자식은 여전히 τ 226~236ms 로 오른다고 잡았다 — 칩 클릭
      // 자식은 **전원 이 배치 경로**로 등록되고(`hidden.length===0` 이어도
      // `visibleOrdered` 전량), `revealMul` 삼항이 `batchAppear` 를 먼저 보므로
      // 그 채널의 갈래는 칩 클릭에서 한 번도 안 탄다. 표현식을 고쳐도 화면이
      // 안 바뀌는 이유가 이것이었다.
      // 이번 프레임 배치로 보이지 않는(접히거나 부모가 접힌) 키는 정리한다.
      // reduced-motion 은 즉시 1(스태거 없이 스냅).
      {
        const appearMap = batchAppearRef.current;
        const startMap = batchAppearStartRef.current;
        for (const id of [...appearMap.keys()]) {
          if (!batchAppearVisible.has(id)) {
            appearMap.delete(id);
            startMap.delete(id);
            continue;
          }
          if (reducedMotionRef.current) {
            appearMap.set(id, 1);
            startMap.delete(id);
            continue;
          }
          if (now < (startMap.get(id) ?? 0)) continue; // 스태거 시작 전 — 0 유지.
          const next = stepEmphasis(appearMap.get(id) ?? 0, true, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          appearMap.set(id, next);
          if (next >= 0.999) startMap.delete(id);
        }
      }

      // 펼침으로 **새로 보이게 된** 노드의 국소 재완화 (2026-07-31).
      //
      // `relaxScope`(월드 빌드 시점)는 아무것도 펼쳐지지 않은 상태를 기준으로
      // 잡히므로, 칩을 펼치면 그 자식이 **씨앗 자리** 그대로 등장한다. 한 부모의
      // 자식끼리는 phyllotaxis 간격이 충돌을 막지만(실측 겹침 0) **다른 부모의
      // 부채와는 겹친다**(3개 펼침 5건 · 6개 18건 · 12개 70건).
      //
      // 전체를 다시 완화하면 비용이 누적되고(24개 펼침 341ms) **이미 보고 있던
      // 노드가 움직인다**(최대 15 유닛). 그래서 새로 보이는 것만, 그 bbox 이웃만
      // 넣어 푼다 — 클릭당 items 가 107~134개로 **클릭 수와 무관하게 상수**다.
      //
      // 프레임 안에서 도는 이유: 접힘 집합이 프레임마다 계산되므로 여기가
      // "새로 보이게 됐다"를 아는 유일한 자리다. 펼침 1회당 1회만 돈다.
      {
        const prevClustered = clusteredIdsRef.current;
        const newlyVisible = new Set<string>();
        for (const id of prevClustered) if (!frameClusteredIds.has(id)) newlyVisible.add(id);
        if (newlyVisible.size > 0) {
          const alreadyPlaced = new Set<string>();
          for (const node of world.nodes) {
            if (!newlyVisible.has(node.id) && !frameClusteredIds.has(node.id)) {
              alreadyPlaced.add(node.id);
            }
          }
          // 홈 좌표(정준 배치)를 푼다 — 스프링이 돌아갈 자리가 여기다. 라이브
          // 좌표(x/y)는 아래에서 같은 델타만큼 옮겨 드래그/물리 상태를 보존한다.
          const homePoints = new Map(
            world.nodes.map((n) => [n.id, { id: n.id, x: n.homeX, y: n.homeY }]),
          );
          relaxNewlyVisible(
            homePoints,
            world.nodes.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId })),
            newlyVisible,
            alreadyPlaced,
            {
              radii: {
                project: tokens.radiusProject,
                domain: tokens.radiusDomain,
                capability: tokens.radiusCapability,
                element: tokens.radiusElement,
              },
            },
          );
          for (const node of world.nodes) {
            if (!newlyVisible.has(node.id)) continue;
            const next = homePoints.get(node.id);
            if (!next) continue;
            const dx = next.x - node.homeX;
            const dy = next.y - node.homeY;
            if (dx === 0 && dy === 0) continue;
            node.homeX = next.x;
            node.homeY = next.y;
            node.x += dx;
            node.y += dy;
          }
          recomputeWorldGeometry(world, tokens);
        }
      }

      // 다섯째 채널 램프 스텝 — 펼침으로 드러난(=접힘 집합 밖인) 자식은 1 로,
      // 다시 접힌 자식은 0 으로 수렴한다. 티어가 이미 열어 준 노드는 이 채널이
      // 필요 없으므로 대상에서 뺀다(램프 중복 없음).
      {
        const revealMap = expandRevealRef.current;
        const target = new Set<string>();
        for (const [parentId, childIds] of world.childrenByParent) {
          if (!effectiveExpanded.has(parentId)) continue;
          for (const id of childIds) if (!frameClusteredIds.has(id)) target.add(id);
        }
        const tracked = new Set<string>([...target, ...revealMap.keys()]);
        for (const id of tracked) {
          const prev = revealMap.get(id) ?? 0;
          const next = reducedMotionRef.current
            ? (target.has(id) ? 1 : 0)
            : stepEmphasis(prev, target.has(id), true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          if (!target.has(id) && next <= 0.02) revealMap.delete(id);
          else revealMap.set(id, next);
        }
      }

      clusterChipsRef.current = frameChips;
      // S3 — 이번 프레임의 NOT-DRAWN 집합을 히트테스트가 볼 수 있게 공개(밀도
      // 게이트 접힘 + 선택적 ego 숨김 이웃). 드로우와 히트가 같은 집합을 본다.
      clusteredIdsRef.current = frameClusteredIds;
      // S10 결함 3 — 드로우가 이번 프레임 티어 알파 계산에 쓴 깊이 오버라이드를
      // 히트테스트에도 그대로 공개(영역 비활성이면 null). draw/hit lockstep.
      realmTierKindsRef.current = realmTierKinds;

      // 발자국 트레일 — 이번 프레임의 방문 노드별 최근성 rank(현재 포커스 노드는
      // 선택 링이 이미 있으므로 제외). 배열이 짧아(≤30) 매 프레임 계산 비용 무시.
      // 노드별 방문 순번(1부터). 현재 포커스 노드는 선택 링이 이미 그 자리를
      // 가지므로 뺀다 — 이중 표기 방지 + 위계(선택 > 발자국) 보존.
      const footprintStepsById = buildFootprintSteps(visitedTrailRef.current);
      if (focusedNodeId !== null) footprintStepsById.delete(focusedNodeId);

      // 걸음이 늘었으면 도착 모션 시작 시각을 찍는다. 줄었으면(지우기) 램프도 버린다.
      const trailLen = visitedTrailRef.current.length;
      if (trailLen > footprintTrailLenRef.current) footprintAppearAtRef.current = now;
      footprintTrailLenRef.current = trailLen;
      const footprintNewestId = trailLen > 0 ? visitedTrailRef.current[trailLen - 1] : null;
      // 이동 램프(`--motion-base` 180ms)와 같은 단 — 표면이 자리를 잡는 일이다.
      const footprintAppear = reducedMotionRef.current
        ? 1
        : Math.min(1, Math.max(0, (now - footprintAppearAtRef.current) / 180));

      // 스포트라이트 on/off 지수 램프 — focusDimTau 재사용(신규 easing 0).
      // reduced-motion 은 즉착(정적 대비만으로 정보 성립 — 협의회 §④).
      spotlightRampRef.current = reducedMotionRef.current
        ? (spotlightIdsRef.current !== null ? 1 : 0)
        : stepFocusRamp(spotlightRampRef.current, spotlightIdsRef.current !== null, dt, tokens.focusDimTau);

      // 걸어온 길 렌즈 on/off 램프 — 같은 easing·같은 토큰 재사용.
      // reduced-motion 은 즉착(정적 대비만으로 정보 성립 — 스포트라이트와 같은 계약).
      trailLensRampRef.current = reducedMotionRef.current
        ? (trailLensActive ? 1 : 0)
        : stepFocusRamp(trailLensRampRef.current, trailLensActive, dt, tokens.focusDimTau);

      // 움직이는 배경 한 스텝 — 그리기 **전에** 자기 버퍼를 갱신한다.
      // `ambientFactor` 를 그대로 넘기므로 손을 놓으면 감속해 멎고, 0 이 되면
      // 이 호출은 조기 반환한다(유휴 래스터 비용 0).
      {
        const bg = animatedBgRef.current;
        if (bg) {
          const origin = worldToScreen(camera, width, height, 0, 0);
          bg.step({
            width,
            height,
            dpr,
            originX: origin.x,
            originY: origin.y,
            ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
            pointerX: bgPointerRef.current?.x ?? null,
            pointerY: bgPointerRef.current?.y ?? null,
            dtMs: dt * 1000,
            reducedMotion: reducedMotionRef.current,
          });
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawTopologyFrame({
        ctx,
        world,
        camera,
        farT,
        zoomRatio,
        now,
        viewportWidth: width,
        viewportHeight: height,
        gridPattern: gridPatternRef.current,
        dustPoints: dustPointsRef.current,
        tokens,
        focusedNodeId,
        hoveredNodeId,
        emphasizedNeighborId: panelEmphasisNodeId,
        hoveredEdge: hoveredEdgeRef.current,
        selectedEdge: selectedEdgeRef.current,
        emphasisById: emphasisRef.current,
        egoRevealById: egoRevealRef.current,
        focusRampById: focusRampRef.current,
        appearById: appearRef.current,
        chipRevealById: chipRevealRef.current,
        expandRevealById: expandRevealRef.current,
        batchAppearById: batchAppearRef.current,
        labelPresentById: labelPresentRef.current,
        colorFocusedNodeId: colorFocusRef.current?.focusedNodeId ?? null,
        colorSelectedEdge: colorFocusRef.current?.selectedEdge ?? null,
        reducedMotion: reducedMotionRef.current,
        pulses: pulsesRef.current,
        selectionPulse: selectionPulseRef.current,
        agentFocusNodeId: agentFocusNodeIdRef.current,
        clusteredIds: frameClusteredIds,
        clusterChips: frameChips,
        hoveredClusterId: hoveredClusterIdRef.current,
        wardingRing: realmWarding,
        realmTierKinds,
        realmDepthById,
        realmDepthParallax,
        realmDustParallax,
        realmOutsideReturnAlphaById,
        // S8 결함 6 — 영역 활성 시에만 우주 도트를 넘긴다(결계로 클립).
        realmCosmosPoints: realmWarding ? cosmosPointsRef.current : null,
        footprintStepsById,
        footprintPref: footprintPrefRef.current,
        walkedEdgeKeys: buildWalkedEdgeKeys(visitedTrailRef.current),
        footprintInk: footprintInkRef.current,
        footprintStepColor: footprintStepColorRef.current,
        footprintNewestId,
        footprintAppear,
        // 렌즈 keep-set — 팝오버가 열려 있을 때만 넘긴다(닫히면 null = 회귀 0).
        // 렌즈가 꺼져도 램프가 0 에 닿을 때까지 집합을 계속 넘긴다 — 그래야
        // 트레일 잉크와 배경 dim 이 «사라지는» 대신 «내려간다».
        trailLensIds:
          trailLensActive || trailLensRampRef.current > 0.01 ? visitedTrailSetRef.current : null,
        trailLensRamp: trailLensRampRef.current,
        spotlightIds: spotlightIdsRef.current,
        spotlightRamp: spotlightRampRef.current,
        tierReveal: tierRevealRef.current,
        glyphStyle: glyphStyleRef.current,
        backgroundVariant: canvasBackgroundRef.current,
        paintAnimatedBackground: animatedBgRef.current
          ? (target, w, h) => animatedBgRef.current?.paint(target, w, h)
          : null,
        depthDotPatterns: canvasBackgroundRef.current === "depth" ? depthDotPatternsRef.current : undefined,
        expand: expandPrefRef.current,
        clusterBarLabels: clusterBarLabelsRef.current,
      });
      // 이번 프레임이 어떤 렌즈 상태를 그렸는지 기록 — 유휴 게이트가 다음
      // 프레임에 "바뀌었나"를 이 값으로 판정한다.
      drawnTrailLensRef.current = trailLensActive;

      // 가이드 투어 스포트라이트 링 — 오버레이 DOM 원 대신 엔진이 프레임
      // 위에 직접 그린다 (2026-07-24 소유자 실보고: DOM 원이 노드와 미세
      // 오프셋/모양 불일치로 "딱 안 맞아" 보였다). 같은 worldToScreen ·
      // 같은 프레임이라 그려진 노드와의 정합이 구조적으로 보장된다. 스크림
      // 컷아웃(감광 구멍)은 계속 GuidedTourOverlay 프로브가 담당.
      {
        const anchorId = tourAnchorNodeIdRef.current;
        const node = anchorId ? world.nodeById.get(anchorId) : undefined;
        if (node) {
          const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value;
          const s = worldToScreen(camera, width, height, node.x, node.y);
          ctx.save();
          ctx.beginPath();
          ctx.arc(s.x, s.y, rr + 10, 0, Math.PI * 2);
          ctx.strokeStyle = tokens.selectionRingIndigo;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      handle = requestAnimationFrame(frame);
    };

    /**
     * **GPU 가 캔버스를 회수하면 지도가 백지가 된다** — 그리고 아무도 그 사실을
     * 모른다.
     *
     * 가속 캔버스의 백킹 저장소는 브라우저가 회수할 수 있다(GPU 프로세스 크래시,
     * 드라이버 리셋, 탭 백그라운드에서의 메모리 압박). 그러면 `contextlost` 가
     * 오고 **그리기가 조용히 무효가 된다** — 예외도, 콘솔 오류도 없다. rAF 루프는
     * 계속 도는데 화면만 비어 있으므로, 사용자에게는 "지도가 사라졌다"로 보이고
     * 우리에게는 아무 신호도 안 남는다.
     *
     * 명세가 주는 계약은 단순하다: `contextlost` 를 `preventDefault()` 로 막으면
     * 브라우저가 컨텍스트 복구를 시도하고 `contextrestored` 가 온다. 그때 다음
     * 프레임이 전부 다시 그리므로, 우리가 할 일은 **막고, 깨우는 것**뿐이다 —
     * 이 루프는 매 프레임 전체 재그리기라 별도 복원 절차가 필요 없다.
     * (`developer.chrome.com/blog/canvas2d` — "receive a callback and redraw".)
     */
    const onContextLost = (event: Event) => {
      event.preventDefault(); // 이걸 안 하면 브라우저가 복구를 시도하지 않는다
    };
    const onContextRestored = () => {
      // 유휴 게이트가 프레임을 건너뛰고 있을 수 있다 — 복구 직후를 "활동"으로
      // 표시해 다음 프레임이 확실히 그려지게 한다.
      lastActiveMsRef.current = performance.now();
      viewportRebuildPendingRef.current = true;
    };
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);

    handle = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
    };
  }, []);

  // refs below are only dereferenced inside the returned event-handler
  // closures (pointerdown/move/up/wheel), never synchronously during this
  // render — `createTopologyPointerHandlers` is a plain closure factory, not
  // a render-time read; the lint rule can't see into the imported function body.
  /* eslint-disable react-hooks/refs */
  const handlersRef = useRef<TopologyPointerHandlers | null>(null);
  const handlers = createTopologyPointerHandlers({
    wheelIntent,
    worldRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    dampingRef,
    cameraAngularFreqRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    camStartAtDownRef,
    canvasRectRef,
    canvasRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    userDrivenCameraRef,
    simRef,
    heatRef,
    nodeDragRef,
    dragAffectedSetRef,
    dragStartPosRef,
    overviewScaleRef,
    activeTouchesRef,
    pinchRef,
    hoveredEdgeRef,
    selectedEdgeRef,
    clusterChipsRef,
    expandPrefRef,
    clusterBarLabelsRef,
    clusteredIdsRef,
    hoveredClusterIdRef,
    realmParallaxRef,
    realmTierKindsRef,
    tierRevealRef,
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
    onContextMenuPane,
    onToggleCluster,
    onHoverCluster,
    // S2 파트 3a — `이웃 +N` 칩 클릭 → 다음 이웃 배치 점등(세션 임시). 클릭
    // 제스처가 방금 캔버스를 활성으로 유지했으므로(유휴 grace 창 안) 다음
    // 프레임이 새 배치로 다시 그린다 — 별도 wake 불필요.
    onExpandEgoNeighbors: () => {
      egoRevealBatchesRef.current += 1;
    },
    // 고팬아웃 배치-공개 — `+N 더보기` 칩 클릭 → 그 부모의 배치 +1(세션 임시,
    // URL 비영속). `이웃 +N` 과 동일 — 클릭 제스처가 방금 캔버스를 활성으로
    // 유지했으므로(유휴 grace 창) 다음 프레임이 새 배치를 DOI 순 stagger 로
    // 다시 그린다. 별도 wake 불필요.
    onExpandClusterBatch: (parentId: string) => {
      const map = clusterRevealBatchesRef.current;
      map.set(parentId, (map.get(parentId) ?? 1) + 1);
    },
  });
  /* eslint-enable react-hooks/refs */
  // 검사 훅(`edgeAt`)이 deps [] 인 effect 안에서 최신 핸들러를 보게 한다.
  // 렌더 중이 아니라 effect 에서 쓴다 — 렌더 중 ref 쓰기는 이 저장소의 lint 가
  // 막고, 막는 이유가 정당하다(렌더는 순수해야 한다).
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // FIX (QA first-light pass — console error sweep): a JSX `onWheel` prop
  // binds to React's delegated listener, which is registered `passive` by
  // default — calling `preventDefault()` inside it throws "Unable to
  // preventDefault inside passive event listener invocation" on every wheel
  // tick and doesn't actually stop the page from scrolling under the canvas.
  // Attaching the SAME handler natively with `{ passive: false }` fixes both.
  // `handleWheelRef` always points at the latest closure (refreshed every
  // render) so the effect below can stay mount-only (`[]`) without going
  // stale — `handlers` itself isn't memoized, so it isn't a safe effect dep.
  const handleWheelRef = useRef(handlers.handleWheel);
  useEffect(() => {
    handleWheelRef.current = handlers.handleWheel;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const listener = (e: WheelEvent) => handleWheelRef.current(e);
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  // S4 — 궤도 "전개" 버튼 클릭 → 현재 겨냥 slug 로 영역 진입. 위치는 rAF 가
  // 매 프레임 갱신하고, 클릭 대상 slug 는 `realmEnterTargetRef` 로 공유한다.
  useEffect(() => {
    const btn = realmEnterButtonRef?.current;
    if (!btn) return;
    const listener = (e: MouseEvent) => {
      e.stopPropagation();
      const slug = realmEnterTargetRef.current;
      if (slug) onEnterRealmRef.current?.(slug);
    };
    btn.addEventListener("click", listener);
    return () => btn.removeEventListener("click", listener);
  }, [realmEnterButtonRef]);

  /**
   * 앰비언트 휴면의 각성 신호 — 포인터/휠 입력이 들어온 시각을 남긴다.
   *
   * 반환 핸들러를 얇게 감싸는 이유: 입력 지점이 `createTopologyPointerHandlers`
   * 안에 흩어져 있어 거기마다 심으면 새 핸들러가 늘 때 조용히 빠진다(#65 계열).
   * **경계는 하나** — 이 훅이 밖으로 내주는 표면이다.
   */
  const noteInput = useCallback(() => {
    lastInputMsRef.current = performance.now();
    // 잠들어 있었다면 이 프레임부터 다시 그려야 한다. `idle-gate` 는 매 프레임
    // refs 를 재평가하므로 활동 시각만 밀어 주면 복귀가 보장된다.
    lastActiveMsRef.current = lastInputMsRef.current;
  }, []);

  /**
   * 막다른 길을 말해 주는 자리 — **침묵이 문제였다.**
   *
   * 소유자가 실제로 써 보고 *"방향키가 되긴 하는데 노드를 자유롭게 이동하진 못하네?"*
   * 라고 했다. 그 방향에 이어진 노드가 없을 때 **아무 일도 안 하도록** 만들어 둔
   * 것이 원인이다 — 「감싸 돌지 않는다」는 판단은 그대로 두고(반대편으로 뛰면
   * 사용자가 자기 위치를 잃는다), 대신 **왜 안 움직이는지 말한다.** 눌렀는데 반응이
   * 없으면 사용자는 「고장」과 「그 방향에는 없음」을 구별할 수 없다.
   *
   * **새 표면을 만들지 않는다** — 이 앱에는 이미 토스트가 있고 레이아웃 전체에
   * 마운트돼 있다. 지도 위에 안내 상자를 새로 세우면 위치·토큰·모션을 다 정해야
   * 하고, 그건 혼자 정할 규격이 아니다. 토스트는 스스로 사라지고
   * (소유자: *"조금 보여지다 자동으로 사라지게"*) 보조기술에도 읽힌다.
   *
   * ⚠️ **문구와 토스트는 이 위젯의 것이 아니다.** 여기서 `useTranslations` 를
   * 불렀다가 지도 컴포넌트 시험 5개가 깨졌다 — 그 시험은 프로바이더 없이 렌더한다.
   * 그게 옳다: 이 위젯은 이미 `canvasLabel` 처럼 **문구를 prop 으로 받는다**.
   * 그래서 사건만 밖으로 내보내고(`onWalkDeadEnd`), 무엇을 어떻게 보여 줄지는
   * 페이지가 정한다.
   */
  const onWalkDeadEndRef = useRef(onWalkDeadEnd);
  useEffect(() => {
    onWalkDeadEndRef.current = onWalkDeadEnd;
  });
  /** 마지막으로 알린 시각 — 방향키를 누르고 있을 때 같은 말을 쏟지 않게. */
  const deadEndAtRef = useRef<number | null>(null);

  const announceDeadEnd = useCallback(() => {
    const now = performance.now();
    if (!shouldAnnounceDeadEnd(deadEndAtRef.current, now)) return;
    deadEndAtRef.current = now;
    onWalkDeadEndRef.current?.();
  }, []);

  /**
   * 방향키로 **그래프 위를 걷는다** — 갈래 B (2026-08-09 소유자 확정).
   *
   * 방향키가 카메라를 미는 게 아니라 **이웃으로 옮겨 간다.** 어느 이웃인지
   * 정하는 규칙은 `../interaction/keyboard-walk` 의 순수 함수에 있고(부채꼴
   * ±60° · 투영 + 직교 벌점), 여기서는 그 결과를 이 캔버스의 상태에 잇는다.
   *
   * ## 왜 초점 링을 새로 만들지 않았나
   *
   * B 는 「초점이 움직이고 Enter 로 선택」이라고 그렸지만, **초점과 선택을
   * 시각적으로 가르려면 인디고 마크가 하나 더 필요하다** — 그리고 이 앱에서
   * 인디고는 이미 「선택됨」을 뜻한다. 같은 색이 두 뜻을 갖는 순간 도해가
   * 깨지고, 그건 혼자 정할 규격이 아니다(`design.md` 「규격을 바꾸려면 「체계」를
   * 부른다」). 그래서 방향키는 **선택을 옮긴다** — 클릭과 똑같은 뜻이고, 새 시각
   * 언어가 0개다. 초점과 선택을 가르는 안은 규격 결정으로 남겨 둔다.
   *
   * ## 접힌 노드는 걷지 않는다
   *
   * 밀도 게이트가 접어 둔 서브트리는 화면에 없다(칩으로 대체된다). 거기로
   * 옮기면 「눌렀는데 아무것도 안 보임」이 되므로 건너뛴다.
   */
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const direction = walkDirectionForKey(e.key);
    if (!direction) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

    const world = worldRef.current;
    const camera = cameraRef.current;
    if (!world || !camera) return;

    const clustered = clusteredIdsRef.current;
    const visible = (id: string) => !clustered.has(id);

    const currentId = focusedSlugRef.current;
    let nextId: string | null = null;

    if (currentId === null || !world.nodeById.has(currentId)) {
      // 초점이 없으면 **지금 보고 있는 것**에서 시작한다. 카메라 x/y 가 곧 화면
      // 중심의 월드 좌표다(`nodes()` 창구가 쓰는 것과 같은 식).
      nextId = pickInitialFocus(
        world.nodes.filter((n) => visible(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y })),
        { x: camera.x.value, y: camera.y.value },
      );
    } else {
      const from = world.nodeById.get(currentId);
      if (!from) return;
      /*
       * 갈 수 있는 곳 = **이어진 이웃 + 형제**.
       *
       * ⚠️ 처음에는 이웃(엣지)만 후보였고, 소유자가 실물에서 막혔다 —
       * *"1depth 에서는 자기들끼리 자유롭게 이동 가능하게는 해야할듯? 중앙에서
       * 자유롭게 이동이 안 되던데?"*. 지도 중앙의 프로젝트를 둘러싼 도메인 아홉은
       * **서로 엣지가 없다**(각자 프로젝트에만 붙어 있다). 그래서 상품에서 회원으로
       * 옆걸음이 안 됐고, 링처럼 둘러선 화면에서 그건 고장으로 읽힌다.
       *
       * **임의 공간 점프를 허용한 것이 아니다.** 형제는 「같은 부모」라는 타입 있는
       * 관계이고, 그것이 화면에서 링을 이루는 이유 자체다. 부모가 없는 뿌리끼리도
       * 형제로 본다(프로젝트가 둘 이상인 볼트).
       */
      const candidateIds = new Set<string>(world.neighborMap.get(currentId) ?? []);
      for (const node of world.nodes) {
        if (node.id === currentId) continue;
        if (node.parentId === from.parentId) candidateIds.add(node.id);
      }
      const candidates: { id: string; x: number; y: number }[] = [];
      for (const id of candidateIds) {
        if (!visible(id)) continue;
        const node = world.nodeById.get(id);
        if (node) candidates.push({ id: node.id, x: node.x, y: node.y });
      }
      if (candidates.length === 0) {
        // 갈 곳이 아예 없는 노드. 아무 일도 안 하는 대신 왜 그런지 말한다.
        e.preventDefault();
        announceDeadEnd();
        return;
      }
      nextId = pickNeighborInDirection({ id: from.id, x: from.x, y: from.y }, candidates, direction);
    }

    // 방향키는 우리 것이다 — 그 방향에 이웃이 없어도 페이지가 스크롤되면 안 된다.
    e.preventDefault();
    if (nextId === null) {
      announceDeadEnd();
      return;
    }

    const target = world.nodeById.get(nextId);
    if (!target) return;
    onSelect?.(nextId);

    /*
     * 카메라는 **따라만 온다** — 초점이 자유 영역 밖으로 나가려 할 때만. 매번
     * 데려오면 걷는 동안 지도가 계속 미끄러져 사용자가 자기 위치를 잃는다
     * (Shneiderman 의 overview-first 를 스스로 깨는 셈이다).
     *
     * **판정과 목표를 모두 「자유 영역」으로 한다** (2026-08-10 소유자 확정:
     * *"가려선 안되지 패널 뺀 공간 가운데로 맞춰줘"*). 종전에는 뷰포트 가운데를
     * 목표로 삼았는데, 노드를 고르면 오른쪽에 팝오버가 열리므로 **고른 것이 그것을
     * 설명하는 패널 뒤로 들어갈 수 있었다.** 실측(1512×982): 캔버스 x64 w1448,
     * 팝오버 x1128 w352 → 자유 영역 가운데는 화면 가운데보다 192px 왼쪽이다.
     *
     * 패널 폭을 상수로 박지 않고 **DOM 에서 재는** 이유: 값을 박으면 패널이 바뀌는
     * 날 조용히 어긋난다. 이 계산은 프레임마다가 아니라 **걸을 때 한 번** 돈다.
     */
    const { width, height } = viewportRef.current;
    const canvasEl = canvasRef.current;
    if (width > 0 && height > 0 && canvasEl) {
      const scale = camera.scale.value;
      const canvasBox = canvasEl.getBoundingClientRect();
      const canvasRect: Rect = {
        x: canvasBox.x,
        y: canvasBox.y,
        width: canvasBox.width,
        height: canvasBox.height,
      };
      const obstacles = collectCanvasObstacles(canvasEl, canvasRect);
      const free = computeFreeArea(canvasRect, obstacles);

      // 초점이 지금 자유 영역 안에 넉넉히 들어와 있나 (문서 좌표로 비교).
      const sx = canvasBox.x + (target.x - camera.x.value) * scale + width / 2;
      const sy = canvasBox.y + (target.y - camera.y.value) * scale + height / 2;
      const margin = Math.min(free.width, free.height) * 0.18;
      const outside =
        sx < free.x + margin ||
        sx > free.x + free.width - margin ||
        sy < free.y + margin ||
        sy > free.y + free.height - margin;
      if (outside) {
        /*
         * 목표는 **카메라 수학의 그 식**으로 낸다(`centerForInsets`) — 여기 따로
         * 적으면 그 식의 사본이 둘이 되고, 사본이 여럿이면 빠진 사본이 생기는 쪽이
         * 기본값이다(초점 다이브가 실제로 그 빠진 사본이었다).
         *
         * 자유 영역은 목표가 아니라 **「밖으로 나갔나」 판정**에만 남는다 — 인셋은
         * 밀 거리를 주지만 담고 있는 사각형을 주지 않으므로, 그 판정은 인셋으로
         * 표현할 수 없는 다른 질문이다.
         */
        const centered = centerForInsets(target.x, target.y, { ...measureCanvasInsets(canvasEl, canvasRect), top: 0, bottom: 0 }, scale);
        const cameraTarget = { tx: centered.tx, ty: centered.ty, tscale: scale };
        /*
         * ⚠️ **트윈만 세우면 안 된다** (게이트가 잡았다). 트윈이 끝나면 스프링이
         * `cameraTargetRef` 로 이어받으므로, 그것을 갱신하지 않으면 **옛 목표로
         * 되끌어간다** — 실측: 노드가 자유 영역 가운데에서 188px 밀려 화면 가운데에
         * 앉았다. 다른 프로그램 경로(포커스 다이브 · 칩 전개 · 핏뷰)가 둘을 함께
         * 세우는 이유가 이것이다.
         */
        cameraTargetRef.current = cameraTarget;
        userDrivenCameraRef.current = false;
        beginCameraTween(cameraTarget);
      }
    }
  }, [onSelect, beginCameraTween, announceDeadEnd]);

  const wrappedHandlers = useMemo(
    () => ({
      handleKeyDown: (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
        noteInput();
        handleKeyDown(e);
      },
      handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerDown(e);
      },
      handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerMove(e);
      },
      handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerUp(e);
      },
      handleWheel: (e: WheelEvent) => {
        noteInput();
        handlers.handleWheel(e);
      },
    }),
    [handlers, noteInput, handleKeyDown],
  );

  /**
   * 검사 훅 — `?e2e=1` 일 때만 붙는 자동화용 창구. **제품 API 가 아니다.**
   *
   * ## 왜 필요한가 (2026-07-31 사고)
   *
   * 노드 드래그 렉을 재현하려다 **여섯 번 연속 배경만 밀었다.** 밖에서 노드를
   * 조준할 방법이 «캔버스를 훑어 커서가 pointer 인 지점을 찾는 것» 뿐이었는데,
   * 그건 **호버 히트**일 뿐 **잡히는지**와 다르다 — 잡기는
   * `sim.hasNode(pressedNodeId)` 를 통과해야 성립하고, 실패하면 조용히 팬으로
   * 흘러간다. 게다가 노드 드래그와 팬이 커서를 **똑같이 `grabbing`** 으로
   * 바꾸므로(`topology-pointer-handlers.ts`) 밖에서는 사후 확인조차 불가능했다.
   * 그래서 매번 "안 느린데요" 라는 오답이 나왔고, 소유자가 화면을 보고
   * *"너는 노드가 아니라 그냥 배경을 흔들잖아"* 라고 짚어준 뒤에야 끝났다.
   *
   * > **밖에서 구분할 수 없는 상태는 밖에서 검사할 수 없다.**
   *
   * 그래서 둘을 노출한다: 노드의 **화면 좌표 + 잡히는지**(사전 조준), 그리고
   * 지금 끌고 있는 것이 **노드인지 배경인지**(사후 확인). 둘 다 refs 를 그때
   * 읽는 게터라 프레임 비용은 0 이다.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    const hook = {
      /** 화면에 그려진 노드 — 좌표는 **CSS 픽셀**(마우스 좌표계)이다. */
      nodes: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const tokens = readTopologyV2TokensOrNull();
        const sim = simRef.current;
        const clustered = clusteredIdsRef.current;
        return world.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
          // screenToWorld 의 역함수 — 같은 카메라를 쓰므로 어긋날 수 없다.
          x: (n.x - camera.x.value) * camera.scale.value + width / 2,
          y: (n.y - camera.y.value) * camera.scale.value + height / 2,
          /** ★ 이걸 안 봐서 여섯 번 틀렸다 — 시뮬에 없으면 끌어도 팬이 된다. */
          draggable: sim?.hasNode(n.id) ?? false,
          /** 접힌 서브트리는 칩으로 대체돼 화면에 없다. */
          hidden: clustered?.has(n.id) ?? false,
          /**
           * ★ 그래프 가독성 계기용 — 겹침은 반지름 없이 못 센다.
           * 그리는 쪽과 **같은 식**을 쓴다(`topology-frame-draw.ts` 의
           * `radiusForKind × magnitudeScale`, 화면 반지름은 여기에 카메라 배율).
           * 식이 갈리면 계기가 화면이 아니라 자기 상상을 재게 된다.
           */
          radius: tokens ? radiusForKind(n.kind, tokens) * n.magnitudeScale * camera.scale.value : 0,
        }));
      },
      /**
       * 화면에 그려진 **엣지** — 좌표는 노드와 같은 CSS 픽셀계다.
       *
       * 왜 이걸 노출하나 (2026-08-03): 이 앱의 주 표면이 노드-링크 그래프인데
       * **엣지 교차를 한 번도 세 본 적이 없었다.** 노드 규격(형태·반지름·parity)
       * 에는 게이트가 있고 지도가 그래프로서 읽히는지에는 수치가 0이었다.
       *
       * Purchase(1997, Graph Drawing) 실험이 우선순위를 정해 준다 — **엣지 교차를
       * 줄이는 것이 인간 이해도에 압도적으로 가장 중요하고**, 각도 해상도 최대화와
       * 격자 스냅은 통계적으로 유의하지 않았다. 그래서 교차와 겹침만 노출한다.
       *
       * `hidden` 인 노드에 붙은 엣지는 화면에 없으므로 제외한다 — 안 보이는 선의
       * 교차를 세면 수치가 화면을 설명하지 못한다.
       */
      edges: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const clustered = clusteredIdsRef.current;
        const toScreenX = (x: number) => (x - camera.x.value) * camera.scale.value + width / 2;
        const toScreenY = (y: number) => (y - camera.y.value) * camera.scale.value + height / 2;
        return world.edges
          .filter((e) => !clustered?.has(e.sourceId) && !clustered?.has(e.targetId))
          .map((e) => ({
            sourceId: e.sourceId,
            targetId: e.targetId,
            kind: e.kind,
            ax: toScreenX(e.ax),
            ay: toScreenY(e.ay),
            bx: toScreenX(e.bx),
            by: toScreenY(e.by),
            /**
             * ★ 현선이 아니라 **그려지는 곡선**을 재기 위해서다. 드로우 경로는
             * `quadraticCurveTo(control, b)` 인데(`topology-frame-draw.ts`),
             * 계기가 끝점만 이으면 화면에 없는 교차를 세고 화면에 있는 교차를
             * 놓친다 — 즉 지도가 아니라 자기 근사치를 재게 된다.
             */
            controlX: toScreenX(e.controlX),
            controlY: toScreenY(e.controlY),
          }));
      },
      /**
       * `(x, y)` 에서 **앱이 고를 엣지** — 히트 없으면 null.
       *
       * 왜 이게 있어야 하나 (2026-08-03): 노드는 `nodes()` 로 좌표를 얻어 밖에서
       * 몰 수 있는데 **엣지는 몰 수 없었다.** 실측 — 곡선 중점 101지점 × 오프셋
       * 3종을 클릭해도 `selection().edge` 가 계속 null 이었다(임계 7px, 노드 몸통
       * 안은 제외). 그래서 **엣지가 걸린 어떤 변경도 자동 검증이 불가능**했고,
       * 엣지 패널에 등장/퇴장을 붙이려다 그 벽에 막혀 되돌렸다.
       *
       * 좌표를 새로 계산하지 않고 **포인터 핸들러와 같은 함수**를 부른다 —
       * 계기가 앱과 다른 식을 쓰면 화면이 아니라 자기 상상을 재게 된다.
       */
      edgeAt: (x: number, y: number, thresholdPx?: number) => {
        const e = handlersRef.current?.probeEdgeAt(x, y, thresholdPx);
        return e ? { sourceId: e.sourceId, targetId: e.targetId, kind: e.kind } : null;
      },
      /** 지금 무엇을 끌고 있나 — 「노드」와 「배경」이 화면에서 같아 보이므로. */
      interaction: () => {
        const drag = nodeDragRef.current;
        if (drag) return { kind: "node" as const, nodeId: drag.nodeId };
        if (pointerMachineRef.current.phase === "dragging") return { kind: "pan" as const, nodeId: null };
        return { kind: "idle" as const, nodeId: null };
      },
      /** 캔버스 백킹 크기 — 상호작용 중 해상도 캡이 실제로 걸렸는지 확인용. */
      backing: () => {
        const c = canvasRef.current;
        return c ? { width: c.width, height: c.height, dpr: window.devicePixelRatio } : null;
      },
      /** 카메라 — 「지도가 어디를 보고 있나」. 딥링크·다이브·핏뷰 검증용. */
      camera: () => {
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!camera) return null;
        return { x: camera.x.value, y: camera.y.value, scale: camera.scale.value, width, height };
      },
      /** 지금 무엇이 골라져 있나 — 노드 하나 또는 엣지 한 쌍. */
      selection: () => ({
        nodeId: focusedSlugRef.current,
        edge: selectedEdgeRef.current,
      }),
      /**
       * 밀도 게이트 칩 — **「+24」가 진짜 24개를 드러내는지** 검증하는 자리다.
       * 칩이 «24개 있다» 고 주장하는데 그리는 것은 1개였던 전례가 있다(티어
       * 게이트가 칩 전개를 안 봐줬다). 주장(`count`)과 실제(`shownChildren`)를
       * 나란히 내보내야 그 어긋남이 밖에서 잡힌다.
       */
      chips: () => {
        const world = worldRef.current;
        const clustered = clusteredIdsRef.current;
        return clusterChipsRef.current.map((chip) => {
          const children = world?.childrenByParent.get(chip.parentId) ?? [];
          return {
            parentId: chip.parentId,
            claimedCount: chip.count,
            expanded: chip.expanded,
            /** 접히지 않은(=그려질 수 있는) 직속 자식 수. */
            shownChildren: children.filter((id) => !clustered.has(id)).length,
          };
        });
      },
    };
    (window as unknown as { __atlasMap?: typeof hook }).__atlasMap = hook;
    return () => {
      delete (window as unknown as { __atlasMap?: typeof hook }).__atlasMap;
    };
  }, []);

  return { canvasRef, containerRef, ...handlers, ...wrappedHandlers };
}
