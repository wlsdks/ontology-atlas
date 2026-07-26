"use client";

/**
 * `TopologyMapV2`'s engine hook — owns the canvas/rAF/pointer wiring so the
 * component itself stays a thin JSX shell (`docs/TOPOLOGY-V2-DESIGN.md` §4
 * P2-P4). Per-frame drawing is delegated to `topology-frame-draw.ts`; layout/
 * adjacency construction to `topology-world.ts`; camera-space conversions to
 * `topology-camera-math.ts`; pointer/wheel handlers to
 * `topology-pointer-handlers.ts` (this file only owns the refs they close over).
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
import { cameraTransitionDurationMs, easeCameraKeyframe, type CameraKeyframe, type CameraTween } from "../model/camera-easing";
import { stepTugAxis, tugFactorForHop, tugFalloffForDistance } from "../interaction/drag-tug";
import { isCameraUnsettled, isCanvasActive, shouldSkipFrame } from "../model/idle-gate";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, type TierRevealConfig, type ZoomTier } from "../model/tier-visibility";
import { relaxNodeSeparation, type SeparationNode } from "../model/separation";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import { initHomeSpring, isHomeSpringConverged, stepHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { buildGridPattern } from "../render/grid";
import { buildConstellationPattern, buildContourPattern, readCanvasBgTokens } from "../render/background-patterns";
import { buildDustPoints, buildRealmCosmosPoints, computeStarDustCount, type DustPoint } from "../render/starfield";
import type { CanvasBackground, GlyphSet } from "@/shared/lib/appearance-preferences";
import { computeClusterFitTarget, computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale, hasAnyNodeOnScreen, worldToScreen } from "./topology-camera-math";
import { drawTopologyFrame } from "./topology-frame-draw";
import { computeTopologyClusterState } from "./topology-cluster-state";
import type { ClusterChip } from "../model/density-gate";
import { clusterMoreChipId, EGO_NEIGHBOR_CHIP_ID, EGO_NEIGHBOR_LIMIT, parseClusterMoreChipId, rankEgoNeighborsByDOI, scheduleRipple, selectiveEgoNeighbors, stepEmphasis, stepFocusRamp, type EgoNeighborRankEntry } from "../model/focus-state";
import { buildFootprintRanks } from "../model/footprint-ring";
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
  fitViewToken: number;
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
   * 캔버스 배경 세트 (Phase 5 #20) — `"dot"`(기본, blueprint grid) / `"constellation"`
   * (성좌) / `"contour"`(등고선). 생략 시 `"dot"`.
   */
  canvasBackground?: CanvasBackground;
}

const EMPTY_EXPANDED_SET: ReadonlySet<string> = new Set();
const EMPTY_TRAIL: readonly string[] = [];

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, emphasizedNeighborSlug = null, fitViewToken, relayoutToken, revealToken = 0, onSelectEdge, onHoverEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, agentFocusNodeId = null, spotlightIds = null, selectedEdge = null, expandedParents = EMPTY_EXPANDED_SET, onToggleCluster, onHoverCluster, realmRootId = null, onEnterRealm, realmEnterButtonRef, realmCaption = null, visitedTrail = EMPTY_TRAIL, trailLensActiveRef, trailHoverNodeIdRef, tierReveal = DEFAULT_TIER_REVEAL, tourAnchorNodeId = null, tourAnchorRef, glyphSet = "geometric", canvasBackground = "dot" } = args;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 성좌/등고선 배경 타일용 오프스크린 캔버스(패턴 1회 빌드). */
  const constellationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contourCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });
  const worldRef = useRef<TopologyWorld | null>(null);
  const dustPointsRef = useRef<DustPoint[]>([]);
  /** S8 결함 6 — 영역 활성 중 결계 안 우주 도트(뷰포트당 1회 빌드, resize 갱신). */
  const cosmosPointsRef = useRef<DustPoint[]>([]);
  const gridPatternRef = useRef<CanvasPattern | null>(null);
  const constellationPatternRef = useRef<CanvasPattern | null>(null);
  const contourPatternRef = useRef<CanvasPattern | null>(null);
  // Phase 5 #20/#21 — 개인화 설정 prop 을 매 프레임 읽을 수 있게 ref 미러
  // (tierReveal 선례). 설정 변경 시 아래 effect 가 갱신한다.
  const glyphStyleRef = useRef<"fill" | "line">(glyphSet === "line" ? "line" : "fill");
  const canvasBackgroundRef = useRef<CanvasBackground>(canvasBackground);

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

  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });
  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
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
  /** A2 — 직전 프레임 카메라 값 (움직임 감지용). */
  const prevCameraSampleRef = useRef<{ x: number; y: number; s: number } | null>(null);
  /** W6 agent visibility — mirrors `agentFocusNodeId` prop into a ref for the rAF closure, same pattern as `focusedSlugRef`. */
  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);
  /** 가이드 투어 — `tourAnchorNodeId` prop 미러(같은 패턴). */
  const tourAnchorNodeIdRef = useRef<string | null>(tourAnchorNodeId);
  /** 스포트라이트 — prop 미러(같은 패턴) + on/off 지수 램프(0..1, 프레임 바디가 step). */
  const spotlightIdsRef = useRef<ReadonlySet<string> | null>(spotlightIds);
  const spotlightRampRef = useRef(0);
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
  // Phase 5 #20 — 캔버스 배경 변경 시 다음 프레임부터 새 배경(패턴은 이미 빌드됨).
  useEffect(() => {
    canvasBackgroundRef.current = canvasBackground;
  }, [canvasBackground]);

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
    let batchRestrict: Set<string> | null = null;
    if (gatedChildren.length > EGO_NEIGHBOR_LIMIT) {
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
      batchRestrict = new Set<string>([newlyExpanded, ...ranked.slice(0, EGO_NEIGHBOR_LIMIT)]);
    }
    const target = computeClusterFitTarget(world, tokens, width, height, newlyExpanded, overviewEntryScale, batchRestrict);
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
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
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    hasInitializedRef.current = true;
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
    const world = buildTopologyWorld(nodes, edges, tokens);
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
    trySnapInitialCamera(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // --- resize (mechanical) + grid pattern/dust (viewport-dependent, built once/on resize) ---
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applyResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const backingWidth = Math.max(1, Math.round(rect.width * dpr));
      const backingHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      viewportRef.current = { width: rect.width, height: rect.height, dpr };
      // Keep the cached pointer rect fresh whenever layout changes (see
      // `canvasRectRef` in `topology-pointer-handlers.ts`).
      canvasRectRef.current = { left: rect.left, top: rect.top };

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
      // Phase 5 #20 — 성좌/등고선 배경 타일은 뷰포트 크기와 무관(고정 타일)이라
      // 1회만 빌드한다. `--canvas-bg-*` 토큰은 blueprint grid 와 별개 패밀리라
      // strict topology-v2 리더가 아닌 자체 리더(미선언 시 문서화된 기본값)로 읽는다.
      if (!constellationCanvasRef.current) constellationCanvasRef.current = document.createElement("canvas");
      if (!contourCanvasRef.current) contourCanvasRef.current = document.createElement("canvas");
      if (!constellationPatternRef.current || !contourPatternRef.current) {
        const rootStyle = getComputedStyle(document.documentElement);
        const bgTokens = readCanvasBgTokens((name) => rootStyle.getPropertyValue(name));
        constellationPatternRef.current = buildConstellationPattern(constellationCanvasRef.current, bgTokens);
        contourPatternRef.current = buildContourPattern(contourCanvasRef.current, bgTokens);
      }
      dustPointsRef.current = buildDustPoints(rect.width, rect.height, computeStarDustCount(rect.width, rect.height, tokens.dustAreaPerPoint), tokens.dustParallaxMin, tokens.dustParallaxMax);
      // S8 결함 6 — 우주 도트는 dust 의 2배 밀도(레이어 2장). dust 와 같은
      // areaPerPoint 토큰 기준으로 카운트를 잡고 2배로.
      cosmosPointsRef.current = buildRealmCosmosPoints(
        rect.width,
        rect.height,
        computeStarDustCount(rect.width, rect.height, tokens.dustAreaPerPoint) * 2,
      );
      trySnapInitialCamera(tokens);
      rescueCameraIfEverythingOffscreen(tokens);
    };

    applyResize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", applyResize);
      return () => window.removeEventListener("resize", applyResize);
    }
    const observer = new ResizeObserver(applyResize);
    observer.observe(container);

    // #71 — `ResizeObserver` 는 **크기** 변화만 본다. 창을 다른 모니터로 옮기면
    // CSS 크기는 그대로인데 `devicePixelRatio` 만 바뀌고, 그러면 캔버스 백킹
    // 크기가 옛 DPR 로 남아 그려지는 내용이 어긋난다. DPR 변화를 따로 듣는다.
    // `matchMedia(resolution)` 은 현재 DPR 에서 벗어나는 순간 한 번 발화하므로
    // 매번 새 질의로 다시 건다.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      applyResize();
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
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens, world.nodes.length);
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // eases via the cubic transition tween (reduced-motion → spring/snap), not
    // whatever a preceding wheel gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(overviewTarget);
  }, [relayoutToken, fitViewToken, beginCameraTween]);

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
      target = computeFocusCameraTarget(world, tokens, width, height, focusedSlug, overviewEntryScale, realmMembers);
    }
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
    // Dive-zoom fix — focus dive AND deselect-return are both PROGRAMMATIC
    // camera moves (this effect fires for both directions of `focusedSlug`
    // changing), so both ease via the cubic transition tween (reduced-motion →
    // spring/snap).
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(target);
  }, [focusedSlug, beginCameraTween]);

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let handle = 0;
    let cancelled = false;

    const frame = (now: number) => {
      if (cancelled) return;
      const tokens = readTopologyV2TokensOrNull();
      const world = worldRef.current;
      const { width, height, dpr } = viewportRef.current;
      if (!tokens || !world || width <= 0 || height <= 0) {
        handle = requestAnimationFrame(frame);
        return;
      }

      const dt = lastFrameTimeRef.current === 0 ? 0 : Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
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
          // 지시 "상시성"). 호버 펄스가 활성이어도 깨워 둔다. 문서 hidden 시엔
          // rAF 자체가 브라우저에 의해 정지돼 배터리를 지킨다.
          egoTailAnimating:
            (!reducedMotionRef.current && hasDependsEdgesRef.current && tokens.edgePulseSpeed > 0) ||
            // Design Guardian 처방 E — 포커스 중 인시던트 contains 코멧도 상시
            // 흐름이라 유휴 게이트가 얼면 안 된다(depends 와 같은 idle-gate 결).
            (!reducedMotionRef.current && focusedSlugRef.current !== null && hasContainsEdgesRef.current) ||
            pulsesRef.current.length > 0,
          // 렌즈 브러싱도 진행 중인 상호작용 — 유휴로 접으면 호버 링이 얼거나
          // 뜨지 않는다(캔버스 호버와 같은 대우).
          emphasisTarget:
            hoveredNodeIdRef.current !== null ||
            panelEmphasisNodeIdRef.current !== null ||
            hoveredClusterIdRef.current !== null ||
            ((trailLensPropRef.current?.current ?? false) && (trailBrushPropRef.current?.current ?? null) !== null),
          // 렌즈 on/off 전이 — 마지막으로 그린 상태와 다르면 한 프레임 깨워
          // 새 상태를 그린다(스포트라이트 램프 정착과 같은 계약).
          trailLensSettling: (trailLensPropRef.current?.current ?? false) !== drawnTrailLensRef.current,
          breathing: !reducedMotionRef.current && world.nodes.some((n) => n.fresh),
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
        const restrictToIds = affected
          ? new Set<string>([affected.draggedId, ...affected.oneHop, ...affected.twoHop])
          : null;
        sim.tick(forceIterationsForDt(dt), restrictToIds);
        applyForcePositions(world, sim.positions());

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
          const sepNodes: SeparationNode[] = world.nodes.map((n) => ({
            id: n.id,
            x: n.x,
            y: n.y,
            r: radiusForKind(n.kind, tokens) * n.magnitudeScale,
          }));
          relaxNodeSeparation(sepNodes, {
            ratio: tokens.nodeMinSeparationRatio,
            iterations: 2,
            pinnedId: nodeDragRef.current?.nodeId ?? null,
          });
          for (let i = 0; i < sepNodes.length; i += 1) {
            world.nodes[i].x = sepNodes[i].x;
            world.nodes[i].y = sepNodes[i].y;
          }
        }
        recomputeWorldGeometry(world, tokens);
        // A4 — heat is a TIME budget (ms), not a frame count, so the release
        // settle lasts `--topology-v2-node-release-settle-ms` on every display.
        if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
        if (!pinned && heatRef.current <= 0) {
          // Settle burst finished — release the affected-set restriction and
          // drop any residual (by-now-decayed-near-0) tug offsets.
          dragAffectedSetRef.current = null;
          dragTugOffsetsRef.current.clear();
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
        focusedNodeId,
        pairFocusActive: selectedEdgeRef.current !== null,
        hoveredNodeId,
        panelEmphasisNodeId,
        isDragging: pointerMachineRef.current.phase === "dragging",
        reducedMotion: reducedMotionRef.current,
        freezeCamera,
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
        if (focusId && neighbors && neighbors.size > EGO_NEIGHBOR_LIMIT) {
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
          const sel = selectiveEgoNeighbors(ranked, egoRevealBatchesRef.current);
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
          const shown = Math.max(1, clusterRevealBatchesRef.current.get(parentId) ?? 1) * EGO_NEIGHBOR_LIMIT;
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

      // --- S4 궤도 "전개" 버튼 위치 — 포커스 노드 링 바깥(우상단 45°)에 앵커,
      // 매 프레임 카메라 추종. 영역 안이거나 자식 없는 노드면 소멸. ---
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
            const off = rr + 14;
            const bx = s.x + off * Math.cos(-Math.PI / 4);
            const by = s.y + off * Math.sin(-Math.PI / 4);
            btn.style.transform = `translate(-50%, -50%) translate(${bx}px, ${by}px)`;
          }
          if (eligible) {
            realmEnterTargetRef.current = fid;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
          } else {
            realmEnterTargetRef.current = null;
            btn.style.opacity = "0";
            btn.style.pointerEvents = "none";
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

      // 고팬아웃 배치-공개 — 배치 자식의 등장 램프 스텝. 시작 시각(스태거) 이후
      // egoRevealRiseTau 로 0→1 수렴(등장은 카메라 착지 리듬과 동일 τ 재사용).
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
          const next = stepEmphasis(appearMap.get(id) ?? 0, true, true, dt, tokens.egoRevealRiseTau, tokens.egoRevealRiseTau);
          appearMap.set(id, next);
          if (next >= 0.999) startMap.delete(id);
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
      const footprintRanksById = buildFootprintRanks(visitedTrailRef.current, focusedNodeId);

      // 스포트라이트 on/off 지수 램프 — focusDimTau 재사용(신규 easing 0).
      // reduced-motion 은 즉착(정적 대비만으로 정보 성립 — 협의회 §④).
      spotlightRampRef.current = reducedMotionRef.current
        ? (spotlightIdsRef.current !== null ? 1 : 0)
        : stepFocusRamp(spotlightRampRef.current, spotlightIdsRef.current !== null, dt, tokens.focusDimTau);

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
        footprintRanksById,
        // 렌즈 keep-set — 팝오버가 열려 있을 때만 넘긴다(닫히면 null = 회귀 0).
        trailLensIds: trailLensActive ? visitedTrailSetRef.current : null,
        spotlightIds: spotlightIdsRef.current,
        spotlightRamp: spotlightRampRef.current,
        tierReveal: tierRevealRef.current,
        glyphStyle: glyphStyleRef.current,
        backgroundVariant: canvasBackgroundRef.current,
        constellationPattern: constellationPatternRef.current,
        contourPattern: contourPatternRef.current,
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

    handle = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, []);

  // refs below are only dereferenced inside the returned event-handler
  // closures (pointerdown/move/up/wheel), never synchronously during this
  // render — `createTopologyPointerHandlers` is a plain closure factory, not
  // a render-time read; the lint rule can't see into the imported function body.
  /* eslint-disable react-hooks/refs */
  const handlers = createTopologyPointerHandlers({
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
    pulsesRef,
    reducedMotionRef,
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

  return { canvasRef, containerRef, ...handlers };
}
