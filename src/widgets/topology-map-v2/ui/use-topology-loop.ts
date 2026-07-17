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
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import type { NodeDragState } from "./topology-pointer-handlers";
import { buildGridPattern } from "../render/grid";
import { buildDustPoints, computeStarDustCount, type DustPoint } from "../render/starfield";
import { computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import { drawTopologyFrame } from "./topology-frame-draw";
import { createTopologyPointerHandlers, type TopologyPointerHandlers } from "./topology-pointer-handlers";
import { stepTopologyPhysics } from "./topology-physics-step";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyMapV2Props } from "./TopologyMapV2";
import { applyForcePositions, buildTopologyWorld, recomputeWorldGeometry, type TopologyWorld } from "./topology-world";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/**
 * FA2 iterations to run per warm frame — a bounded synchronous tick budget
 * (`model/force-layout.ts` integration note). The sim is warm ONLY while a
 * node is being pin-dragged (or its brief release settle) — never on load. The
 * static default is the deterministic de-piled concentric grid built in
 * `model/layout.ts`; running FA2 on mount turned that clean circuit into a
 * generic force hairball, which was the guardian's 충실도 반려 reason.
 */
const FORCE_ITERATIONS_PER_FRAME = 1;

export interface UseTopologyLoopArgs {
  nodes: TopologyMapV2Props["nodes"];
  edges: TopologyMapV2Props["edges"];
  focusedSlug: string | null;
  fitViewToken: number;
  relayoutToken: number;
  onSelect?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
}

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, fitViewToken, relayoutToken, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange } = args;

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

  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });
  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
  const dampingRef = useRef(1.0);
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

  const pointerMachineRef = useRef<PointerMachineState>(INITIAL_POINTER_MACHINE_STATE);
  const dragHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const camStartAtDownRef = useRef({ x: 0, y: 0 });
  const canvasRectRef = useRef<{ left: number; top: number } | null>(null);

  const focusedSlugRef = useRef<string | null>(focusedSlug);
  const lastFocusedSlugRef = useRef<string | null>(focusedSlug);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const emphasisRef = useRef<Map<string, number>>(new Map());
  const rippleStartRef = useRef<Map<string, number>>(new Map());
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    focusedSlugRef.current = focusedSlug;
  }, [focusedSlug]);

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
    hasInitializedRef.current = true;
  };

  // --- world (layout + adjacency) — rebuilt whenever the graph itself changes ---
  useEffect(() => {
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
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
      dustPointsRef.current = buildDustPoints(rect.width, rect.height, computeStarDustCount(rect.width, rect.height, tokens.dustAreaPerPoint));
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
  }, [relayoutToken, fitViewToken]);

  // --- focused slug change — spring-dive to the ego bbox, or back to overview when cleared ---
  useEffect(() => {
    if (lastFocusedSlugRef.current === focusedSlug) return;
    lastFocusedSlugRef.current = focusedSlug;

    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0) return;

    const target = computeFocusCameraTarget(world, tokens, width, height, focusedSlug);
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
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

      // --- force simulation: tick ONLY while a node is pin-dragged (or its
      // brief release settle). Never on load — the static default is the
      // deterministic grid, and the camera is NOT auto-reframed here (that
      // reframing only existed to chase the removed load settle). ---
      const sim = simRef.current;
      const pinned = nodeDragRef.current !== null;
      if (sim && (heatRef.current > 0 || pinned)) {
        sim.tick(FORCE_ITERATIONS_PER_FRAME);
        applyForcePositions(world, sim.positions());
        recomputeWorldGeometry(world, tokens);
        if (!pinned && heatRef.current > 0) heatRef.current -= 1;
      }

      const focusedNodeId = focusedSlugRef.current;
      const hoveredNodeId = focusedNodeId ? null : hoveredNodeIdRef.current;

      const { camera, farT, zoomRatio } = stepTopologyPhysics({
        world,
        camera: cameraRef.current,
        target: cameraTargetRef.current,
        damping: dampingRef.current,
        overviewScale: overviewScaleRef.current,
        tokens,
        dt,
        now,
        focusedNodeId,
        hoveredNodeId,
        isDragging: pointerMachineRef.current.phase === "dragging",
        emphasisById: emphasisRef.current,
        rippleStartById: rippleStartRef.current,
      });
      cameraRef.current = camera;

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
        emphasisById: emphasisRef.current,
        reducedMotion: reducedMotionRef.current,
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
    overviewScaleRef,
    onSelect,
    onPaneClick,
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
