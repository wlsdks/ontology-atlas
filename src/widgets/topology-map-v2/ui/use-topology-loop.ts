"use client";

/**
 * `TopologyMapV2`'s engine hook — owns the canvas/rAF/pointer wiring so the
 * component itself stays a thin JSX shell (`docs/TOPOLOGY-V2-DESIGN.md` §4
 * P2-P4). Per-frame drawing is delegated to `topology-frame-draw.ts`; layout/
 * adjacency construction to `topology-world.ts`; camera-space conversions to
 * `topology-camera-math.ts`; pointer/wheel handlers to
 * `topology-pointer-handlers.ts` (this file only owns the refs they close over).
 */

import { useEffect, useRef, type RefObject } from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
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
import { computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import { drawTopologyFrame } from "./topology-frame-draw";
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
}

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, emphasizedNeighborSlug = null, fitViewToken, relayoutToken, revealToken = 0, onSelectEdge, onHoverEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, agentFocusNodeId = null, livePhysics = false, selectedEdge = null } = args;

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

  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });
  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
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

  useEffect(() => {
    onZoomTierChangeRef.current = onZoomTierChange;
  }, [onZoomTierChange]);

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
    cameraTargetRef.current = computeOverviewCameraTarget(world.spineBounds, width, height, tokens);
    overviewScaleRef.current = computeOverviewFitScale(world.spineBounds, width, height, tokens);
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // uses the cinematic transition spring, not whatever a preceding wheel
    // gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
  }, [relayoutToken, fitViewToken]);

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
    // changing), so both use the cinematic transition spring.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
  }, [focusedSlug]);

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
          emphasisTarget: hoveredNodeIdRef.current !== null || panelEmphasisNodeIdRef.current !== null,
          breathing: !reducedMotionRef.current && world.nodes.some((n) => n.fresh),
          cameraMoving,
        });
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

      const focusedNodeId = focusedSlugRef.current;
      const hoveredNodeId = focusedNodeId ? null : hoveredNodeIdRef.current;
      // Panel-row emphasis only bites while a node is focused (that's the only
      // time the "연결된 노드" list exists) — otherwise hover owns the ripple.
      const panelEmphasisNodeId = focusedNodeId ? panelEmphasisNodeIdRef.current : null;

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
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
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

  return { canvasRef, containerRef, ...handlers };
}
