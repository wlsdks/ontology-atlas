"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { MOTION } from "@/shared/motion";

import type { LibraryGraph, LibraryGraphNode } from "../model/build-library-graph";
import { easeMotion, type LayoutPoint } from "../model/library-graph-layout";
import {
  createLibrarySimulation,
  hasPinnedNode,
  isLibrarySimulationRunning,
  applyAmbientDrift,
  libraryPositions,
  libraryMarkRadii,
  librarySimulationBounds,
  pinLibraryNode,
  reheatLibrarySimulation,
  releaseLibraryNode,
  resizeLibrarySimulation,
  settleLibrarySimulation,
  stepLibrarySimulation,
  syncLibrarySimulation,
  type LibrarySimulation,
} from "../model/library-force-simulation";
import {
  fitView,
  isWheelZoomIntent,
  panView,
  scaleBounds,
  screenToWorld,
  wheelPixelDelta,
  wheelZoomFactor,
  worldToScreen,
  zoomViewAbout,
  type LibraryGraphView,
} from "../model/library-graph-view";
import { drawLibraryGraph, hitTestLibraryGraph } from "../render/draw-library-graph";
import { readLibraryGraphInk, type LibraryGraphInk } from "../render/library-graph-ink";

/**
 * **The engine behind the library canvas** — the clock, the pointer, and the paint.
 *
 * It lives beside `LibraryGraph.tsx` rather than inside it for the reason the map splits
 * `use-topology-loop` out of `TopologyMapV2`: the component is the screen's contract with
 * the Library — its props, its caption row, its legend and its accessibility description —
 * while everything here is a loop that must not re-run when that contract is edited. The
 * split also keeps the two files apart in a diff.
 *
 * ## Everything reads through refs, and that is deliberate
 *
 * A frame at 60fps cannot afford a React render, so the simulation, the view, the pointer
 * state and the pointed-at node all live in refs and the loop reads them. React state is
 * kept for exactly the three things the DOM has to say out loud: what is hovered (the live
 * region announces it), what has focus, and the picture's aspect (a canvas has no DOM, so a
 * claim about what it drew is otherwise unfalsifiable).
 *
 * ## The five gestures
 *
 * | Gesture | What happens |
 * |---|---|
 * | press and move on a mark | the node follows the pointer, pinned, while the springs pull its neighbours after it; released with a short capped inertia |
 * | press and move on empty canvas | the view pans, 1:1, against the previous sample |
 * | wheel | zoom about the pointer, bounded to half and four times the fit |
 * | two fingers | pinch zoom about the midpoint, same bounds |
 * | double-click empty canvas | fit, animated |
 *
 * Which of the first two a gesture *is* is decided **once, at pointerdown**, and never
 * re-decided: the map recorded that deciding per move flips the gesture's identity the
 * moment a hand grazes a mark's edge.
 */

/**
 * Distance the pointer must travel before a press becomes a drag.
 *
 * 7px is the map's measured value (`--topology-v2-hysteresis-px`). It is a literal here
 * rather than a read of that token because the token is scoped to the topology surface and
 * borrowing it would make this canvas a second consumer of a value the map is free to tune
 * for its own reasons; the number is the same because a person's hand is the same.
 */
const DRAG_THRESHOLD_PX = 7;

/** Padding the fit reserves for the names that stand under the outermost marks. */
export const FIT_PADDING = 34;

/** How fast an auto-fitting view catches up with the settling picture, per frame. */
const AUTO_FIT_FOLLOW = 0.16;

/** Trailing window over which a release's speed is measured, in milliseconds. */
const RELEASE_WINDOW_MS = 80;

/**
 * Frames between repaints once nothing is left but the ambient drift.
 *
 * **The drift is the only motion this canvas has that never ends**, so it is the only one
 * that can spend a battery. At a 7.2s period and a third of a pixel of travel there is
 * nothing to see above about 15fps, and painting every fourth frame is what keeps an idle
 * Library from holding the raster pipeline the way the map's idle canvas was measured to
 * (6,027 ms of main-thread work in a 6,000 ms window, of which 36 ms was script — the cost
 * was never the physics, it was the paint).
 */
const AMBIENT_FRAME_STRIDE = 4;

/** Touch reach around a mark, in CSS px. Half of `--touch-target-min` (44) is the floor. */
const COARSE_HIT_REACH = 18;

type PointerPhase = "idle" | "pressed" | "dragging";

interface PointerState {
  phase: PointerPhase;
  pointerId: number | null;
  down: LayoutPoint | null;
  last: LayoutPoint | null;
  /** What was under the pointer when it went down. Cleared the moment a drag starts. */
  pressedNodeId: string | null;
  /** Non-null while a mark is being carried; the offset keeps the grab point under the hand. */
  drag: { nodeId: string; offset: LayoutPoint } | null;
  history: Array<{ x: number; y: number; t: number }>;
}

export interface LibraryGraphEngine {
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
  onDoubleClick: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  /** Frames the whole picture again. The corner control and a double-click both call it. */
  fitToView: () => void;
  /** The settled picture's width over its height, for `data-picture-aspect`. */
  pictureAspect: number | null;
}

export function useLibraryGraphEngine({
  graph,
  canvasRef,
  reducedMotion,
  selectedId,
  hoveredId,
  focusedId,
  activeLabel,
  standingLabels,
  onHover,
  onActivate,
}: {
  graph: LibraryGraph;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  reducedMotion: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  focusedId: string | null;
  activeLabel: string | null;
  standingLabels: boolean;
  onHover: (id: string | null) => void;
  onActivate: (node: LibraryGraphNode) => void;
}): LibraryGraphEngine {
  const simRef = useRef<LibrarySimulation | null>(null);
  const viewRef = useRef<LibraryGraphView>({ scale: 1, x: 0, y: 0 });
  /**
   * Whether the view is still following the picture, and whether it has caught up.
   *
   * One object rather than two refs: `converged` is only ever meaningful while `on` is
   * true, and the loop reads both in the same breath.
   */
  const autoFitRef = useRef({ on: true, converged: false });
  const inkRef = useRef<LibraryGraphInk | null>(null);
  /** Screen-space positions of the last painted frame — what the pointer is tested against. */
  const screenRef = useRef<Map<string, LayoutPoint>>(new Map());
  const radiiRef = useRef<Map<string, number>>(new Map());
  const boxRef = useRef({ width: 0, height: 0, dpr: 1 });
  const pendingBoxRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const rectRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const frameRef = useRef(0);
  const lastPaintRef = useRef(0);
  const ambientFrameRef = useRef(0);
  /** Nodes whose files are gone, still fading out from where they were. */
  const ghostsRef = useRef<Map<string, { node: LibraryGraphNode; x: number; y: number; since: number }>>(new Map());
  const dimRef = useRef({ value: 0, target: 0 });
  const pointerRef = useRef<PointerState>({
    phase: "idle",
    pointerId: null,
    down: null,
    last: null,
    pressedNodeId: null,
    drag: null,
    history: [],
  });
  const touchesRef = useRef<Map<number, LayoutPoint>>(new Map());
  const pinchRef = useRef<{ distance: number; mid: LayoutPoint } | null>(null);
  /** The first tap on a coarse pointer names the dot; the second opens it. */
  const coarseTapRef = useRef<string | null>(null);

  /*
   * **Everything the loop reads lives in a ref, and the refs are filled in an effect.**
   *
   * A frame at 60fps cannot afford a React render, so the loop never reads a prop
   * directly. Writing these during render would be the shorter spelling and is a genuine
   * hazard React's own lint names: under a re-render that is thrown away, a ref written on
   * the way through keeps the discarded value. An effect runs after the commit that
   * actually happened, and still before the next paint.
   */
  const graphRef = useRef(graph);
  const stateRef = useRef({ selectedId, hoveredId, focusedId, activeLabel, standingLabels, reducedMotion });
  const onHoverRef = useRef(onHover);
  useEffect(() => {
    graphRef.current = graph;
    stateRef.current = { selectedId, hoveredId, focusedId, activeLabel, standingLabels, reducedMotion };
    onHoverRef.current = onHover;
  });

  const [pictureAspect, setPictureAspect] = useState<number | null>(null);

  // ── The neighbourhood that keeps its ink while everything else dims. ──
  const neighboursRef = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const map = new Map<string, Set<string>>();
    for (const node of graph.nodes) map.set(node.id, new Set([node.id]));
    for (const edge of graph.edges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    neighboursRef.current = map;
  }, [graph]);

  /**
   * The two clocks this canvas keeps, in milliseconds.
   *
   * Parsed from CSS rather than transcribed — a copied motion value drifts, which is the
   * 2026-07-28 finding `src/shared/motion/tokens.ts` was written after. The fallback is
   * **that same gated mirror**, never a fresh literal, so a canvas that somehow cannot
   * read the cascade still animates on the ramp instead of on a number nothing watches.
   */
  const motionRef = useRef({ fast: MOTION.fast.duration * 1000, base: MOTION.base.duration * 1000 });

  // ── One paint. ──
  const paint = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      const sim = simRef.current;
      if (!canvas || !sim) return;
      /*
       * The ink is resolved from the canvas element itself and cached. A throw here would
       * mean the application's own palette is missing from `app/globals.css`, in which case
       * every other surface is already broken — so it is left to propagate rather than
       * absorbed into a silent default that renders in no colour.
       */
      inkRef.current ??= readLibraryGraphInk(canvas);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      /*
       * **The backing store is resized here, in the frame, never in the ResizeObserver.**
       * Writing `canvas.width` clears the bitmap, and an observer callback runs after rAF
       * and before paint — so resizing there ships an empty canvas for one frame. The map
       * measured 183–200 ms of blank canvas during a panel transition before it moved this.
       */
      const pending = pendingBoxRef.current;
      if (pending) {
        boxRef.current = pending;
        pendingBoxRef.current = null;
      }
      const { width, height, dpr } = boxRef.current;
      if (width === 0 || height === 0) return;
      const backingWidth = Math.max(1, Math.round(width * dpr));
      const backingHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const box = { width, height };
      const bounds = librarySimulationBounds(sim);
      if (autoFitRef.current.on) {
        const target = fitView(bounds, box, FIT_PADDING);
        const current = viewRef.current;
        // Instant under reduced motion, and instant on the first frame, where there is
        // nothing to travel from.
        const follow = stateRef.current.reducedMotion || current.scale === 1 ? 1 : AUTO_FIT_FOLLOW;
        viewRef.current = {
          scale: current.scale + (target.scale - current.scale) * follow,
          x: current.x + (target.x - current.x) * follow,
          y: current.y + (target.y - current.y) * follow,
        };
        /*
         * ⚠️ **Auto-fit stays armed after it arrives, so it cannot be what keeps the loop
         * awake.** It follows the picture for as long as nobody has taken the camera, which
         * is most of the widget's life; treating "armed" as "still moving" would have meant
         * a canvas that repaints every frame forever, which is exactly the cost the ambient
         * stride exists to avoid. What counts as motion is the **distance left to travel**.
         */
        const next = viewRef.current;
        const drift =
          Math.abs(next.scale - target.scale) / Math.max(1e-6, target.scale) +
          (Math.abs(next.x - target.x) + Math.abs(next.y - target.y)) / Math.max(1, box.width);
        autoFitRef.current.converged = drift < 0.002;
      }
      const view = viewRef.current;

      const world = libraryPositions(sim);
      const screen = new Map<string, LayoutPoint>();
      for (const [id, point] of world) screen.set(id, worldToScreen(point, view, box));
      // The drift is added **after** the view transform, so its bound is a third of a
      // pixel at every zoom rather than a third of a world unit the zoom can multiply.
      if (!stateRef.current.reducedMotion) applyAmbientDrift(sim, screen, now);

      // ── The dim ramp, one `--motion-fast` from end to end. ──
      const elapsed = lastPaintRef.current === 0 ? 0 : now - lastPaintRef.current;
      lastPaintRef.current = now;
      const dimState = dimRef.current;
      if (stateRef.current.reducedMotion) {
        dimState.value = dimState.target;
      } else if (dimState.value !== dimState.target) {
        const step = elapsed / Math.max(1, motionRef.current.fast);
        dimState.value =
          dimState.target > dimState.value
            ? Math.min(dimState.target, dimState.value + step)
            : Math.max(dimState.target, dimState.value - step);
      }

      // ── Arrivals and departures. ──
      const opacity = new Map<string, number>();
      for (const node of sim.nodes) if (node.entered < 1) opacity.set(node.id, easeMotion(node.entered));
      const nodes: LibraryGraphNode[] = [...graphRef.current.nodes];
      const ghosts = ghostsRef.current;
      if (ghosts.size > 0) {
        for (const [id, ghost] of ghosts) {
          const gone = (now - ghost.since) / Math.max(1, motionRef.current.base);
          if (gone >= 1 || stateRef.current.reducedMotion) {
            ghosts.delete(id);
            continue;
          }
          nodes.push(ghost.node);
          screen.set(id, worldToScreen({ x: ghost.x, y: ghost.y }, view, box));
          opacity.set(id, 1 - easeMotion(gone));
        }
      }

      screenRef.current = screen;
      const active = stateRef.current.hoveredId ?? stateRef.current.focusedId;
      const focus = active ? neighboursRef.current.get(active) ?? new Set([active]) : null;

      drawLibraryGraph(context, {
        nodes,
        edges: graphRef.current.edges,
        positions: screen,
        width,
        height,
        ink: inkRef.current,
        selectedId: stateRef.current.selectedId,
        hoveredId: stateRef.current.hoveredId,
        focusedId: stateRef.current.focusedId,
        activeLabel: stateRef.current.activeLabel,
        standingLabels: stateRef.current.standingLabels,
        radii: radiiRef.current,
        opacity,
        dim: dimState.value,
        focus,
      });

      /*
       * Machine-readable state for a surface that has no DOM. `data-view-scale` is what an
       * e2e spec reads to say a wheel zoomed rather than panned, and `data-interaction` is
       * what tells it a gesture grabbed a **node** — the map lost six measurement rounds to
       * drag specs that were silently measuring a background pan.
       */
      const scaleText = view.scale.toFixed(4);
      if (canvas.dataset.viewScale !== scaleText) canvas.dataset.viewScale = scaleText;
      const interaction =
        pointerRef.current.drag !== null
          ? "node"
          : pointerRef.current.phase === "dragging"
            ? "pan"
            : "idle";
      if (canvas.dataset.interaction !== interaction) canvas.dataset.interaction = interaction;
    },
    [canvasRef],
  );

  // ── The loop. ──
  const runningRef = useRef(false);
  const wasSettlingRef = useRef(true);
  const stepRef = useRef<(now: number) => void>(() => undefined);

  /** Publishes the settled picture's own aspect for `data-picture-aspect`. */
  const publishAspect = useCallback(() => {
    const sim = simRef.current;
    const bounds = sim ? librarySimulationBounds(sim) : null;
    if (!bounds) return;
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    if (!(spanX > 0) || !(spanY > 0)) return;
    setPictureAspect((current) =>
      current !== null && Math.abs(current - spanX / spanY) < 0.005 ? current : spanX / spanY,
    );
  }, []);
  const wake = useCallback(() => {
    if (runningRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    runningRef.current = true;
    lastPaintRef.current = 0;
    frameRef.current = requestAnimationFrame((now) => stepRef.current(now));
  }, []);

  useEffect(() => {
    stepRef.current = (now: number) => {
      const sim = simRef.current;
      if (!sim) {
        runningRef.current = false;
        return;
      }
      const reduced = stateRef.current.reducedMotion;
      const busy = isLibrarySimulationRunning(sim) || hasPinnedNode(sim);
      if (busy) {
        /*
         * ⚠️ **Reduced motion settles here, not only where the simulation is created.**
         * `usePrefersReducedMotion` reports `false` on the first client render by design —
         * a `matchMedia` read in a `useState` initializer once cost a hydration failure
         * over 59 character spans — so the preference arrives *after* the picture already
         * exists, and a resize or a folder change can re-heat it later. Settling only at
         * creation left a reduced-motion visitor with a picture frozen half-way through
         * arriving, and a loop that repainted every frame forever because its alpha could
         * never decay (measured 2026-09-07: alpha pinned at 0.2).
         *
         * A held mark is the exception: a drag is the person's own hand, which WCAG 2.2
         * §2.3.3 exempts, and settling 400 ticks inside one frame would not be a
         * reduced-motion equivalent so much as a dropped frame.
         */
        if (!reduced) stepLibrarySimulation(sim);
        else if (hasPinnedNode(sim)) stepLibrarySimulation(sim);
        else settleLibrarySimulation(sim);
      }
      const settling =
        busy ||
        dimRef.current.value !== dimRef.current.target ||
        ghostsRef.current.size > 0 ||
        (autoFitRef.current.on && !autoFitRef.current.converged) ||
        pendingBoxRef.current !== null ||
        sim.nodes.some((node) => node.entered < 1);

      /*
       * ⚠️ **The ambient drift is the one motion here with no end**, so once the picture is
       * otherwise still the loop stops painting every frame and paints every fourth. The
       * physics is not being stepped at all at that point — the drift is a display offset —
       * so the only thing this stride saves is raster, which is the only thing it costs.
       */
      if (settling) {
        ambientFrameRef.current = 0;
        wasSettlingRef.current = true;
        paint(now);
      } else if (reduced) {
        // Reduced motion has no drift and nothing else is moving: stop entirely.
        paint(now);
        if (wasSettlingRef.current) {
          wasSettlingRef.current = false;
          publishAspect();
        }
        runningRef.current = false;
        return;
      } else {
        /*
         * **The aspect is published when the picture stops, never while it is arriving.**
         * Read at creation it is the seed spiral's — a near-circle, 0.93 on the folder
         * measured here, against a settled 1.7 — and a witness that reports the shape of
         * something the person never saw is worse than no witness at all.
         */
        if (wasSettlingRef.current) {
          wasSettlingRef.current = false;
          publishAspect();
        }
        ambientFrameRef.current += 1;
        if (ambientFrameRef.current >= AMBIENT_FRAME_STRIDE) {
          ambientFrameRef.current = 0;
          paint(now);
        }
      }
      frameRef.current = requestAnimationFrame((next) => stepRef.current(next));
    };
  }, [paint, publishAspect]);

  /** The picture stops entirely behind a hidden tab, and comes back when it is looked at. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(frameRef.current);
        runningRef.current = false;
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [wake]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  /** The last shape of every node, so a removed one can still be drawn while it fades. */
  const lastKnownRef = useRef<Map<string, LibraryGraphNode>>(new Map());

  // ── The simulation: created once the canvas has a box, then kept in step with the folder. ──
  const syncSimulation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const graph = graphRef.current;
    const reducedMotion = stateRef.current.reducedMotion;
    const style = getComputedStyle(canvas);
    motionRef.current = {
      fast: readMs(style, "--motion-fast", MOTION.fast.duration * 1000),
      base: readMs(style, "--motion-base", MOTION.base.duration * 1000),
    };
    radiiRef.current = libraryMarkRadii(graph);

    const box = pendingBoxRef.current ?? boxRef.current;
    const existing = simRef.current;
    if (!existing) {
      if (box.width === 0 || box.height === 0) return;
      const sim = createLibrarySimulation({ graph, box });
      simRef.current = sim;
      /*
       * **Reduced motion settles before the first frame and never ticks.** It is not the
       * animation slowed down; it is the same picture, arrived at synchronously, which is
       * exactly what the one-shot layout used to give everybody.
       */
      if (reducedMotion) settleLibrarySimulation(sim);
      autoFitRef.current = { on: true, converged: false };
    } else {
      const changed = syncLibrarySimulation(existing, graph);
      const now = typeof performance === "undefined" ? 0 : performance.now();
      for (const gone of changed.removed) {
        const node = ghostsRef.current.get(gone.id)?.node ?? lastKnownRef.current.get(gone.id);
        if (node) ghostsRef.current.set(gone.id, { node, x: gone.x, y: gone.y, since: now });
      }
    }
    lastKnownRef.current = new Map(graph.nodes.map((node) => [node.id, node]));

    // The aspect is not published here: at creation the picture is still the seed spiral.
    // The loop publishes it the moment the simulation comes to rest.
    wasSettlingRef.current = true;
    wake();
  }, [canvasRef, wake]);

  /**
   * The loop and the observer both need this without depending on the identity React gives
   * it, so it is mirrored into a ref — the same shape `stepRef` above uses.
   */
  const syncSimulationRef = useRef(syncSimulation);
  useEffect(() => {
    syncSimulationRef.current = syncSimulation;
  }, [syncSimulation]);

  useEffect(() => {
    syncSimulation();
  }, [graph, reducedMotion, syncSimulation]);

  // ── Measure the box; the frame commits it. ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      pendingBoxRef.current = { width: rect.width, height: rect.height, dpr };
      rectRef.current = { left: rect.left, top: rect.top };
      const sim = simRef.current;
      if (sim) resizeLibrarySimulation(sim, { width: rect.width, height: rect.height });
      // The first measurement is also what makes the simulation possible: it runs in the
      // canvas's own pixels, so before there is a box there is nothing to create.
      else if (rect.width > 0 && rect.height > 0) syncSimulationRef.current();
      wake();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
  }, [canvasRef, wake]);


  // Selection, hover, focus and the label are read from a ref by the loop, but a change to
  // any of them has to reach the screen even when nothing else is moving.
  useEffect(() => {
    dimRef.current.target = hoveredId ?? focusedId ? 1 : 0;
    wake();
  }, [activeLabel, focusedId, hoveredId, selectedId, standingLabels, wake]);

  // ── Pointer geometry. ──
  const pointOf = (event: { clientX: number; clientY: number }): LayoutPoint => ({
    x: event.clientX - rectRef.current.left,
    y: event.clientY - rectRef.current.top,
  });

  const coarsePointer = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: coarse)").matches;

  const hitTest = useCallback(
    (point: LayoutPoint): LibraryGraphNode | null =>
      hitTestLibraryGraph(
        { nodes: graphRef.current.nodes, positions: screenRef.current, radii: radiiRef.current },
        point,
        coarsePointer() ? COARSE_HIT_REACH : undefined,
      ),
    [],
  );

  const fitToView = useCallback(() => {
    autoFitRef.current = { on: true, converged: false };
    wake();
  }, [wake]);

  /** Any deliberate gesture takes the camera off the leash; only `fitToView` puts it back. */
  const takeCamera = (): void => {
    autoFitRef.current = { on: false, converged: true };
  };

  /**
   * Ends whatever was happening, and — when the pointer never travelled — treats the press
   * as a choice.
   */
  const finishGesture = useCallback(
    (timeStamp: number, commit?: LayoutPoint) => {
      const state = pointerRef.current;
      const sim = simRef.current;
      if (state.drag && sim) {
        releaseLibraryNode(sim, state.drag.nodeId, releaseVelocity(state.history, timeStamp, viewRef.current.scale));
        reheatLibrarySimulation(sim);
      }
      const pressed = state.pressedNodeId;
      pointerRef.current = {
        phase: "idle",
        pointerId: null,
        down: null,
        last: null,
        pressedNodeId: null,
        drag: null,
        history: [],
      };
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "";
      if (commit && pressed) {
        const node = graphRef.current.nodes.find((candidate) => candidate.id === pressed);
        if (node) {
          /*
           * A coarse pointer never hovered, so the first tap would otherwise be the commit
           * on a 10px target — including the one commit that leaves this screen. The first
           * tap names the dot; the second one opens it.
           */
          if (coarsePointer() && coarseTapRef.current !== node.id) {
            coarseTapRef.current = node.id;
            onHoverRef.current(node.id);
          } else {
            coarseTapRef.current = null;
            onActivate(node);
          }
        }
      }
      wake();
    },
    [canvasRef, onActivate, wake],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        rectRef.current = { left: rect.left, top: rect.top };
      }
      const point = pointOf(event);
      if (event.pointerType === "touch") {
        touchesRef.current.set(event.pointerId, point);
        if (touchesRef.current.size === 2) {
          // Two fingers are never a click and never a drag: whatever was in progress is
          // abandoned before the pinch starts.
          const [first, second] = [...touchesRef.current.values()];
          pointerRef.current = {
            phase: "idle",
            pointerId: null,
            down: null,
            last: null,
            pressedNodeId: null,
            drag: null,
            history: [],
          };
          pinchRef.current = {
            distance: Math.hypot(second!.x - first!.x, second!.y - first!.y),
            mid: { x: (first!.x + second!.x) / 2, y: (first!.y + second!.y) / 2 },
          };
          takeCamera();
          return;
        }
        if (touchesRef.current.size > 2) return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // jsdom and some test environments do not implement pointer capture; the
        // `buttons === 0` guard in the move handler covers the gesture either way.
      }
      const hit = hitTest(point);
      pointerRef.current = {
        phase: "pressed",
        pointerId: event.pointerId,
        down: point,
        last: point,
        pressedNodeId: hit?.id ?? null,
        drag: null,
        history: [{ x: point.x, y: point.y, t: event.timeStamp }],
      };
    },
    [canvasRef, hitTest],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointOf(event);
      const state = pointerRef.current;
      const sim = simRef.current;
      const box = boxRef.current;

      if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
        touchesRef.current.set(event.pointerId, point);
        const pinch = pinchRef.current;
        if (pinch && touchesRef.current.size >= 2) {
          const [first, second] = [...touchesRef.current.values()];
          const distance = Math.hypot(second!.x - first!.x, second!.y - first!.y);
          const mid = { x: (first!.x + second!.x) / 2, y: (first!.y + second!.y) / 2 };
          if (pinch.distance > 0) {
            const bounds = fitBounds(sim, box);
            let next = zoomViewAbout(viewRef.current, box, mid, distance / pinch.distance, bounds);
            // Two fingers travelling together pan as well as pinch; the midpoint's own
            // movement is that pan, and taking it here is why one gesture does both.
            next = panView(next, { x: mid.x - pinch.mid.x, y: mid.y - pinch.mid.y });
            viewRef.current = next;
          }
          pinchRef.current = { distance, mid };
          wake();
        }
        return;
      }

      // A pointer that was released outside the canvas leaves the machine stuck; the
      // button state is the only witness, so it is checked on every move.
      if (state.phase !== "idle" && event.buttons === 0) {
        finishGesture(event.timeStamp);
        return;
      }

      if (state.phase === "idle") {
        const hit = hitTest(point);
        if (hit?.id !== stateRef.current.hoveredId) onHoverRef.current(hit?.id ?? null);
        // Nothing else on this canvas says a dot can be pressed, and no gate can see a
        // cursor over a painted mark (`cursor-affordance.spec.ts` measures DOM elements).
        event.currentTarget.style.cursor = hit ? "pointer" : "grab";
        return;
      }

      if (state.phase === "pressed") {
        const travelled = Math.hypot(point.x - (state.down?.x ?? point.x), point.y - (state.down?.y ?? point.y));
        if (travelled < DRAG_THRESHOLD_PX) return;
        state.phase = "dragging";
        takeCamera();
        // Decided **once**: whatever was under the finger when it went down is what this
        // gesture carries, even if the hand has since left the mark.
        const grabbed = state.pressedNodeId;
        state.pressedNodeId = null;
        if (grabbed && sim && sim.index.has(grabbed)) {
          const node = sim.nodes[sim.index.get(grabbed)!]!;
          const world = screenToWorld(point, viewRef.current, box);
          state.drag = { nodeId: grabbed, offset: { x: node.x - world.x, y: node.y - world.y } };
          pinLibraryNode(sim, grabbed, { x: node.x, y: node.y });
          reheatLibrarySimulation(sim);
        }
        event.currentTarget.style.cursor = "grabbing";
      }

      if (state.phase === "dragging") {
        if (state.drag && sim) {
          const world = screenToWorld(point, viewRef.current, box);
          pinLibraryNode(sim, state.drag.nodeId, {
            x: world.x + state.drag.offset.x,
            y: world.y + state.drag.offset.y,
          });
          reheatLibrarySimulation(sim, 0.32);
        } else {
          const previous = state.last ?? point;
          viewRef.current = panView(viewRef.current, { x: point.x - previous.x, y: point.y - previous.y });
        }
        state.last = point;
        state.history.push({ x: point.x, y: point.y, t: event.timeStamp });
        if (state.history.length > 10) state.history.shift();
        wake();
      }
    },
    [finishGesture, hitTest, wake],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointOf(event);
      if (event.pointerType === "touch") {
        touchesRef.current.delete(event.pointerId);
        if (touchesRef.current.size < 2) pinchRef.current = null;
      }
      finishGesture(event.timeStamp, pointerRef.current.phase === "pressed" ? point : undefined);
    },
    [finishGesture],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
      finishGesture(event.timeStamp);
    },
    [finishGesture],
  );

  const onPointerLeave = useCallback(() => {
    if (pointerRef.current.phase === "idle") onHoverRef.current(null);
  }, []);

  const onDoubleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      // A double-click **on a mark** is two clicks on it, which the first one already
      // answered. Only the empty canvas re-frames the picture.
      if (hitTest(pointOf(event))) return;
      fitToView();
    },
    [fitToView, hitTest],
  );

  // ── The wheel, on a native listener. ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent): void => {
      /*
       * React's delegated `wheel` listener is passive, so a JSX `onWheel` calling
       * `preventDefault` logs a warning and does not stop the page scrolling. The map
       * measured 37 such warnings from one gesture before moving to a native listener.
       */
      const pixels = wheelPixelDelta(event, typeof window === "undefined" ? 800 : window.innerHeight);
      if (!isWheelZoomIntent(pixels, event.ctrlKey)) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      rectRef.current = { left: rect.left, top: rect.top };
      takeCamera();
      viewRef.current = zoomViewAbout(
        viewRef.current,
        boxRef.current,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        wheelZoomFactor(pixels),
        fitBounds(simRef.current, boxRef.current),
      );
      wake();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, wake]);

  /**
   * ★ Inspection window, attached only under `?e2e=1`. **Not a product API.**
   *
   * The map recorded what it costs not to have one: six consecutive attempts to reproduce
   * a node-drag defect *only ever dragged the background*, because from outside a canvas
   * a grab and a pan are the same cursor over the same pixels, and every run answered
   * "it is not slow here" until the owner looked at the screen. A state a test cannot
   * distinguish from outside cannot be tested from outside.
   *
   * So this exposes the two things a gesture spec cannot otherwise know — **where a mark
   * is on the screen** (aiming) and **what the current gesture is holding** (confirming) —
   * plus the view, so a zoom can be asserted without reading pixels. Every field is a
   * getter over the same refs the product uses, so a frame costs nothing for it.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    const probe = {
      /** Every drawn mark, in canvas CSS pixels — including a node still fading out. */
      nodes: () =>
        graphRef.current.nodes.map((node) => {
          const point = screenRef.current.get(node.id);
          return {
            id: node.id,
            kind: node.kind,
            label: node.label,
            x: point?.x ?? Number.NaN,
            y: point?.y ?? Number.NaN,
            radius: radiiRef.current.get(node.id) ?? 0,
          };
        }),
      /** What the pointer is holding right now: a mark, the background, or nothing. */
      interaction: () => ({
        kind: pointerRef.current.drag ? ("node" as const) : pointerRef.current.phase === "dragging" ? ("pan" as const) : ("idle" as const),
        nodeId: pointerRef.current.drag?.nodeId ?? null,
      }),
      view: () => ({ ...viewRef.current, ...boxRef.current }),
      /** Where the simulation is: above the floor it is still arranging itself. */
      alpha: () => simRef.current?.alpha ?? 0,
    };
    (window as unknown as { __atlasLibraryGraph?: typeof probe }).__atlasLibraryGraph = probe;
    return () => {
      delete (window as unknown as { __atlasLibraryGraph?: typeof probe }).__atlasLibraryGraph;
    };
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onDoubleClick,
    fitToView,
    pictureAspect,
  };
}

/** The zoom's floor and ceiling, always relative to what the fit would be right now. */
function fitBounds(sim: LibrarySimulation | null, box: { width: number; height: number }) {
  const fitted = fitView(sim ? librarySimulationBounds(sim) : null, box, FIT_PADDING);
  return scaleBounds(fitted.scale);
}

/**
 * The speed a released mark keeps, in world units per tick.
 *
 * Measured over a trailing window anchored at the release, so a drag that was held still
 * before letting go stops dead instead of continuing on an average taken from earlier in
 * the gesture — the iOS scroll rule, and the same one the map uses.
 */
function releaseVelocity(
  history: ReadonlyArray<{ x: number; y: number; t: number }>,
  releasedAt: number,
  scale: number,
): LayoutPoint | undefined {
  if (history.length < 2) return undefined;
  const from = history.find((sample) => releasedAt - sample.t <= RELEASE_WINDOW_MS);
  const to = history[history.length - 1]!;
  if (!from || from === to) return undefined;
  const span = to.t - from.t;
  if (span <= 0) return undefined;
  // Screen pixels per millisecond → world units per 60fps tick.
  const perTick = 16.7 / (span * Math.max(0.0001, scale));
  return { x: (to.x - from.x) * perTick, y: (to.y - from.y) * perTick };
}

/** A CSS duration token in milliseconds, parsed rather than transcribed. */
function readMs(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const raw = style.getPropertyValue(token).trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw) || fallback;
  if (raw.endsWith("s")) return (Number.parseFloat(raw) || fallback / 1000) * 1000;
  return fallback;
}
