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
import { classifyZoomTier, type ZoomTier } from "../model/tier-visibility";
import { relaxNodeSeparation, type SeparationNode } from "../model/separation";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import { initHomeSpring, isHomeSpringConverged, stepHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { buildGridPattern } from "../render/grid";
import { buildDustPoints, computeStarDustCount, type DustPoint } from "../render/starfield";
import { computeClusterFitTarget, computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale, worldToScreen } from "./topology-camera-math";
import { drawTopologyFrame } from "./topology-frame-draw";
import { computeTopologyClusterState } from "./topology-cluster-state";
import type { ClusterChip } from "../model/density-gate";
import { EGO_NEIGHBOR_CHIP_ID, EGO_NEIGHBOR_LIMIT, rankEgoNeighborsByDOI, selectiveEgoNeighbors, type EgoNeighborRankEntry } from "../model/focus-state";
import {
  INITIAL_REALM_TRANSITION_STATE,
  REALM_INSIDE_FLIP_MS,
  REALM_OUTSIDE_FLING_MS,
  isRealmOutsideCulled,
  realmInsidePosition,
  realmOutsidePosition,
  realmTransitionReducer,
  realmWardingDrawProgress,
  type RealmTransitionState,
} from "../model/realm-transition";
import { buildRealmRuntimeData, fallbackAngleFor, realmCameraTarget, type RealmRuntimeData } from "./topology-realm-runtime";
import { createTopologyPointerHandlers, type TopologyPointerHandlers } from "./topology-pointer-handlers";
import { stepTopologyPhysics } from "./topology-physics-step";
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
   * M-9 — "그래프"(살아있는 그래프) 토글. true 면 force 시뮬을 상시 웜
   * 상태로 유지해 레이아웃이 유기적으로 계속 이완한다 (옵시디언식 촉각).
   * 유휴 게이트는 simWarm 경유로 자동 활동 인정. false 로 돌아가면 heat
   * 가 자연 감쇠해 마지막 이완 위치에서 정지한다.
   */
  livePhysics?: boolean;
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
    info: { parentId: string; count: number; expanded: boolean; position: { x: number; y: number } } | null,
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
}

const EMPTY_EXPANDED_SET: ReadonlySet<string> = new Set();

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, emphasizedNeighborSlug = null, fitViewToken, relayoutToken, revealToken = 0, onSelectEdge, onHoverEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, agentFocusNodeId = null, livePhysics = false, selectedEdge = null, expandedParents = EMPTY_EXPANDED_SET, onToggleCluster, onHoverCluster, realmRootId = null, onEnterRealm, realmEnterButtonRef } = args;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });
  const worldRef = useRef<TopologyWorld | null>(null);
  const dustPointsRef = useRef<DustPoint[]>([]);
  const gridPatternRef = useRef<CanvasPattern | null>(null);

  // Live force simulation (`model/force-layout.ts`) — seeded off the concentric
  // layout, ticked while warm (`heatRef > 0`) or while a node is pinned.
  const simRef = useRef<ForceSimulation | null>(null);
  const heatRef = useRef(0);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  /** C1 B1/B2 — the active (or just-released, through its settle burst) drag's tug/settle-restriction set. */
  const dragAffectedSetRef = useRef<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string> } | null>(null);
  /** C1 B1 — the dragged node's world position at grab time (for computing this drag's total displacement Δ). */
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  /** C1 B1 — each tug-affected neighbor's current eased offset (world units), added on top of its natural position. */
  const dragTugOffsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** C1 B3 — active auto-arrange homing springs, keyed by node id; empty/absent when no relayout is in flight. */
  const homeSpringsRef = useRef<Map<string, HomeSpringState>>(new Map());
  const homingActiveRef = useRef(false);

  // --- S4 "영역 전개" 상태 ---
  /** 전환 상태기계 (idle/entering/active/exiting). */
  const realmTransitionRef = useRef<RealmTransitionState>(INITIAL_REALM_TRANSITION_STATE);
  /** 현재 영역의 전환 시작 데이터(서브트리·재배치 좌표·결계·이탈 출발점). */
  const realmDataRef = useRef<RealmRuntimeData | null>(null);
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
  const emphasisRef = useRef<Map<string, number>>(new Map());
  /** C1 A2 — ego tier-reveal ramp, stepped in `stepTopologyPhysics`, consumed by `drawTopologyFrame`. */
  const egoRevealRef = useRef<Map<string, number>>(new Map());
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
  /** A2 — 마지막 활동 시각. 활동 플래그가 참인 프레임마다 갱신. */
  const lastActiveMsRef = useRef(0);
  /** A2 — 직전 프레임 카메라 값 (움직임 감지용). */
  const prevCameraSampleRef = useRef<{ x: number; y: number; s: number } | null>(null);
  /** W6 agent visibility — mirrors `agentFocusNodeId` prop into a ref for the rAF closure, same pattern as `focusedSlugRef`. */
  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);
  /** M-9 — mirrors `livePhysics` into a ref for the rAF closure. */
  const livePhysicsRef = useRef<boolean>(false);
  /** M-5 — mirror the tier-change callback into a ref for the rAF closure, and
   * track the last emitted tier so the callback fires only on transitions. */
  const onZoomTierChangeRef = useRef<typeof onZoomTierChange>(onZoomTierChange);
  const lastZoomTierRef = useRef<ZoomTier | null>(null);

  /**
   * S3 마감 폴리시 (fable 설계) — begin a cubic ease-in-out camera transition
   * from the live camera to `target` (van Wijk 정신, 거리 비례 duration). The
   * rAF loop drives it via `easeCameraKeyframe`. Under `prefers-reduced-motion`
   * it no-ops (clears any tween) so the physics-step reduced snap owns the jump.
   * Stable identity (refs only) so listing it in the programmatic-move effects'
   * deps never re-fires them.
   */
  const beginCameraTween = useCallback((target: CameraTarget) => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    cameraTweenRef.current = { start, target: tgt, startMs: performance.now(), durationMs: cameraTransitionDurationMs(start, tgt) };
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
    focusedSlugRef.current = focusedSlug;
  }, [focusedSlug]);

  useEffect(() => {
    agentFocusNodeIdRef.current = agentFocusNodeId;
  }, [agentFocusNodeId]);

  useEffect(() => {
    livePhysicsRef.current = livePhysics;
  }, [livePhysics]);

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
    const target = computeClusterFitTarget(world, tokens, width, height, newlyExpanded, overviewEntryScale);
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

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
    const target = computeOverviewCameraTarget(world.spineBounds, width, height, tokens);
    cameraRef.current = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    cameraTargetRef.current = target;
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens);
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
      dustPointsRef.current = buildDustPoints(rect.width, rect.height, computeStarDustCount(rect.width, rect.height, tokens.dustAreaPerPoint), tokens.dustParallaxMin, tokens.dustParallaxMax);
      trySnapInitialCamera(tokens);
    };

    applyResize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", applyResize);
      return () => window.removeEventListener("resize", applyResize);
    }
    const observer = new ResizeObserver(applyResize);
    observer.observe(container);
    return () => observer.disconnect();
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
    // Panel-aware: spring back to the overview centered in the VISIBLE area, not
    // behind the left ReaderLens panel (Design Guardian 카메라 반려). Fits the
    // SPINE bbox (not the full 295-node bounds) so "fit view" reframes the same
    // legible 8-node spine as the initial entry — and keeps `overviewScaleRef`
    // on the same spine bounds so the zoom-ratio/altitude anchor stays at ratio 1.
    const overviewTarget = computeOverviewCameraTarget(world.spineBounds, width, height, tokens);
    cameraTargetRef.current = overviewTarget;
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens);
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
    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );

    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
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
    const target = computeFocusCameraTarget(world, tokens, width, height, focusedSlug, overviewEntryScale);
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

    if (realmRootId !== null) {
      // --- 진입 ---
      const data = buildRealmRuntimeData(world, realmRootId, tokens);
      if (!data) return;
      realmDataRef.current = data;
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "enter",
        rootId: realmRootId,
        now,
        reducedMotion: reduced,
      });
      // 호밍은 진입 중 realm 이 좌표를 소유하므로 끈다.
      homingActiveRef.current = false;
      homeSpringsRef.current.clear();
      // 카메라: 결계 원 fit 으로 돌리 인 (기존 큐빅 트윈 재사용).
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        const target = realmCameraTarget(data, tokens, width, height);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraTargetRef.current = target;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        beginCameraTween(target);
      }
    } else {
      // --- 이탈: 전 노드 홈 스프링 복귀 + 카메라 overview fit ---
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "exit",
        now,
        reducedMotion: reduced,
      });
      simRef.current = createForceSimulation(
        world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) springs.set(node.id, initHomeSpring(node.x, node.y));
      homeSpringsRef.current = springs;
      homingActiveRef.current = true;
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        const target = computeOverviewCameraTarget(world.spineBounds, width, height, tokens);
        cameraTargetRef.current = target;
        overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        beginCameraTween(target);
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
          // M-9 — 살아있는 그래프 토글은 그 자체가 활동이다 (heat 충전이
          // 게이트 뒤에 있어 스킵 중엔 못 돌므로 플래그로 직접 각성).
          simWarm: heatRef.current > 0 || nodeDragRef.current !== null || livePhysicsRef.current,
          homing: homingActiveRef.current,
          selectionPulseActive: selectionPulseRef.current !== null &&
            now - selectionPulseRef.current.startAtMs < tokens.selectPulseDurationMs,
          egoTailAnimating: focusedSlugRef.current !== null && tokens.edgePulseSpeedEgo > 0,
          emphasisTarget: hoveredNodeIdRef.current !== null || panelEmphasisNodeIdRef.current !== null || hoveredClusterIdRef.current !== null,
          breathing: !reducedMotionRef.current && world.nodes.some((n) => n.fresh),
          cameraMoving,
        }) || realmTransitionRef.current.phase === "entering";
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
      // M-9 — 살아있는 그래프: 토글이 켜져 있는 동안 시뮬 heat 를 매 프레임
      // 채워 물리 tick 이 계속 돈다 (유휴 게이트는 simWarm 으로 자동 각성).
      if (livePhysicsRef.current) heatRef.current = Math.max(heatRef.current, 16.7);
      // C1 B3: a user grab interrupts any in-flight auto-arrange homing —
      // the drag wins, rather than the two fighting over the node's position.
      if (pinned && homingActiveRef.current) {
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
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
        if (reducedMotionRef.current) {
          for (const node of world.nodes) {
            if (!homeSpringsRef.current.has(node.id)) continue;
            node.x = node.homeX;
            node.y = node.homeY;
          }
          recomputeWorldGeometry(world, tokens);
          homingActiveRef.current = false;
          homeSpringsRef.current.clear();
        } else {
          let allConverged = true;
          for (const node of world.nodes) {
            const spring = homeSpringsRef.current.get(node.id);
            if (!spring) continue;
            // A5 — homing has its own ω (7.5): a relayout is a layout
            // CORRECTION and should end decisively, unlike the camera's
            // cinematic transition spring (4.7) this used to borrow.
            const nextSpring = stepHomeSpring(spring, node.homeX, node.homeY, dt, tokens.nodeHomeSpringAngFreq, tokens.cameraDampingDefault);
            homeSpringsRef.current.set(node.id, nextSpring);
            node.x = nextSpring.x.value;
            node.y = nextSpring.y.value;
            if (!isHomeSpringConverged(nextSpring, node.homeX, node.homeY, HOME_CONVERGE_EPSILON)) allConverged = false;
          }
          recomputeWorldGeometry(world, tokens);
          if (allConverged) {
            homingActiveRef.current = false;
            homeSpringsRef.current.clear();
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
        if (data && (rt.phase === "entering" || rt.phase === "active")) {
          const elapsed = now - rt.startMs;
          const flipDur = reducedMotionRef.current ? 0 : REALM_INSIDE_FLIP_MS;
          const flingDur = reducedMotionRef.current ? 0 : REALM_OUTSIDE_FLING_MS;
          const outsideCulled = isRealmOutsideCulled(rt, now);
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              if (rt.phase === "active") {
                node.x = target.x;
                node.y = target.y;
              } else {
                const from = data.insideFrom.get(node.id) ?? target;
                const p = realmInsidePosition(from, target, elapsed, flipDur);
                node.x = p.x;
                node.y = p.y;
              }
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
        } else if (rt.phase === "idle" && realmDataRef.current !== null) {
          // 이탈 완료 — 호밍이 이미 홈으로 되돌렸으니 realm 데이터 정리.
          realmDataRef.current = null;
        }
      }

      const focusedNodeId = focusedSlugRef.current;
      const hoveredNodeId = focusedNodeId ? null : hoveredNodeIdRef.current;
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
        hoveredNodeId,
        panelEmphasisNodeId,
        isDragging: pointerMachineRef.current.phase === "dragging",
        reducedMotion: reducedMotionRef.current,
        freezeCamera,
        emphasisById: emphasisRef.current,
        rippleStartById: rippleStartRef.current,
        egoRevealById: egoRevealRef.current,
      });
      cameraRef.current = camera;

      // M-5 — emit the semantic-zoom tier only when it changes (spine →
      // circuit → element), so the corner readout's orientation hint tracks
      // what's actually drawn. Same reveal bands as the draw pass (default
      // config), so the label and the visible nodes can't contradict.
      const nextZoomTier = classifyZoomTier(zoomRatio);
      if (nextZoomTier !== lastZoomTierRef.current) {
        lastZoomTierRef.current = nextZoomTier;
        onZoomTierChangeRef.current?.(nextZoomTier);
      }

      // 밀도 게이트 (fable 설계) — 이번 프레임의 접힘/칩 상태를 라이브 위치로
      // 계산한다(부모가 드래그/살아있는 그래프로 움직이면 칩 anchor 도 따라감).
      // 판정 로직은 순수 모델(`density-gate.ts`), 여긴 좌표 주입만.
      const clusterState = computeTopologyClusterState(world, expandedParentsRef.current);

      // S2 파트 3a — 선택적 ego: 포커스 노드의 이웃이 limit 을 넘으면 DOI 상위
      // (revealedBatches × limit)만 남기고 나머지는 접는다(clusteredIds 에 합류 →
      // 노드·엣지·라벨이 기존 스킵 경로로 함께 숨는다). `이웃 +N` 칩은 같은
      // 렌더/히트 경로를 타는 ClusterChip(ego:true)로 얹는다. 세션 임시 상태.
      let frameClusteredIds: ReadonlySet<string> = clusterState.clusteredIds;
      let frameChips: readonly ClusterChip[] = clusterState.chips;
      {
        const focusId = focusedSlugRef.current;
        const neighbors = focusId ? world.neighborMap.get(focusId) : undefined;
        if (focusId && neighbors && neighbors.size > EGO_NEIGHBOR_LIMIT) {
          const entries: EgoNeighborRankEntry[] = [];
          for (const id of neighbors) {
            const n = world.nodeById.get(id);
            entries.push({ id, kind: n?.kind ?? "element", degree: world.neighborMap.get(id)?.size ?? 0 });
          }
          const ranked = rankEgoNeighborsByDOI(entries);
          const sel = selectiveEgoNeighbors(ranked, egoRevealBatchesRef.current);
          if (sel.hiddenCount > 0) {
            frameClusteredIds = new Set<string>([...clusterState.clusteredIds, ...sel.hiddenNeighbors]);
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
      // --- S4 "영역 전개" — 밖 노드 하드 컬(fling 완료 후) + 결계 링 파라미터 ---
      const realmState = realmTransitionRef.current;
      const realmData = realmDataRef.current;
      let realmWarding: { centerX: number; centerY: number; radius: number; drawProgress: number } | null = null;
      let realmMemberIds: ReadonlySet<string> | null = null;
      if (realmData && (realmState.phase === "entering" || realmState.phase === "active")) {
        realmMemberIds = realmData.memberIds;
        if (isRealmOutsideCulled(realmState, now)) {
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...realmData.outsideIds]);
        }
        realmWarding = {
          centerX: realmData.wardingCenter.x,
          centerY: realmData.wardingCenter.y,
          radius: realmData.wardingRadius,
          drawProgress: realmWardingDrawProgress(now - realmState.startMs),
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
          if (fid && node && hasChildren && !engaged && onEnterRealmRef.current) {
            const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value;
            const s = worldToScreen(camera, width, height, node.x, node.y);
            const off = rr + 14;
            const bx = s.x + off * Math.cos(-Math.PI / 4);
            const by = s.y + off * Math.sin(-Math.PI / 4);
            realmEnterTargetRef.current = fid;
            btn.style.display = "flex";
            btn.style.transform = `translate(-50%, -50%) translate(${bx}px, ${by}px)`;
          } else {
            realmEnterTargetRef.current = null;
            btn.style.display = "none";
          }
        }
      }

      clusterChipsRef.current = frameChips;
      // S3 — 이번 프레임의 NOT-DRAWN 집합을 히트테스트가 볼 수 있게 공개(밀도
      // 게이트 접힘 + 선택적 ego 숨김 이웃). 드로우와 히트가 같은 집합을 본다.
      clusteredIdsRef.current = frameClusteredIds;

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
        reducedMotion: reducedMotionRef.current,
        selectionPulse: selectionPulseRef.current,
        agentFocusNodeId: agentFocusNodeIdRef.current,
        clusteredIds: frameClusteredIds,
        clusterChips: frameChips,
        hoveredClusterId: hoveredClusterIdRef.current,
        wardingRing: realmWarding,
        realmMemberIds,
      });

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
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    simRef,
    heatRef,
    nodeDragRef,
    dragAffectedSetRef,
    dragStartPosRef,
    overviewScaleRef,
    hoveredEdgeRef,
    selectedEdgeRef,
    clusterChipsRef,
    clusteredIdsRef,
    hoveredClusterIdRef,
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
