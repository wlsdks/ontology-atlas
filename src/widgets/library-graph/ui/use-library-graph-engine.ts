"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { MOTION } from "@/shared/motion";
import type { LibraryWorkActivity } from "@/features/library";

import type { LibraryGraph, LibraryGraphNode } from "../model/build-library-graph";
import {
  libraryGraphFlowEdges,
  placeLibraryGraphCard,
  LIBRARY_CARD_MAX_WIDTH,
} from "../model/library-graph-card";
import type { LayoutPoint } from "../model/library-graph-layout";
import type { FlowLayout } from "../model/library-flow-layout";
import type { IslandsLayout } from "../model/library-islands-layout";
import type { IslandField } from "../model/library-islands-physics";
import { librarySimulationBounds, type LibrarySimulation } from "../model/library-force-simulation";
import {
  LIBRARY_ZOOM_MAX,
  WIDEST_MARK_WORLD_RADIUS,
  type LibraryGraphView,
  type LibraryPositionLookup,
} from "../model/library-graph-view";
import {
  hitTestLibraryGraph,
  type LibraryGraphLabelBox,
  type LibraryGraphGeometry,
} from "../render/draw-library-graph";
import type { LibraryGraphInk } from "../render/library-graph-ink";

import type {
  LibraryGraphCardBox,
  LibraryGraphEngine,
  LibraryIslandPick,
  PointerState,
} from "./library-graph-engine/engine-types";
import { activitySignature } from "./library-graph-engine/activity-marks";
import { paintLibraryGraphFrame } from "./library-graph-engine/paint-frame";
import { stepLibraryGraphFrame } from "./library-graph-engine/step-frame";
import {
  observeLibraryGraphBox,
  syncLibraryGraphPicture,
} from "./library-graph-engine/picture-sync";
import {
  attachLibraryGraphWheel,
  finishLibraryGraphGesture,
  moveLibraryGraphPointer,
  pressLibraryGraphPointer,
} from "./library-graph-engine/pointer-gestures";
import { mountLibraryGraphProbe } from "./library-graph-engine/inspection-probe";

/**
 * The library canvas's clock, pointer and paint, kept apart from `LibraryGraph.tsx` so the
 * loop never re-runs when the component's contract changes.
 *
 * A 60fps frame cannot afford a React render, so simulation, view and pointer live in refs;
 * React state holds only what a DOM surface reads: the picture kind and aspect, the islands
 * list, the keyboard walk order and whether the view is framed.
 *
 * | Gesture | What happens |
 * |---|---|
 * | press and move on a mark | the node follows the pointer, pinned; released with capped inertia |
 * | press and move on empty canvas | the view pans 1:1 |
 * | wheel | zoom about the pointer, within the zoom bounds |
 * | two fingers | pinch zoom about the midpoint |
 * | double-click empty canvas | fit, animated |
 *
 * Drag or pan is decided once at pointerdown, or a hand grazing a mark's edge flips it.
 */

/**
 * On the overview a dot takes a press only once its radius is this, on screen: a 16px
 * mark is a target, a 4px one is texture and the island under it is what the press means.
 */
const ISLAND_DOT_PRESS_MIN_PX = 8;

/** Touch reach around a mark, in CSS px. Half of `--touch-target-min` (44) is the floor. */
const COARSE_HIT_REACH = 18;

export function useLibraryGraphEngine({
  graph,
  canvasRef,
  reducedMotion,
  selectedId,
  hoveredId,
  focusedId,
  highlight = null,
  activeLabel,
  standingLabels,
  activity,
  visible = true,
  cardId = null,
  cardRef,
  onCardPlaced,
  onHover,
  onPressMark,
  onPressIsland,
  onHoverIsland,
  onLeaveIsland,
  onActivate,
  onDismiss,
  layout = "flow",
  islandLabels = { unsorted: "Unsorted", unread: "Unread" },
  locale,
  overview = true,
  focusedIslandId = null,
}: {
  graph: LibraryGraph;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * Flow is still columns, sources → pages → concepts, where a press opens a card and a
   * drag pans; force is the live simulation with draggable marks.
   */
  layout?: "flow" | "force";
  /** The names of the two islands that are not a concept. */
  islandLabels?: { unsorted: string; unread: string };
  /** The page's locale; the renderer groups an island's count with it. */
  locale?: string;
  /** Whether the graph is the whole folder; an opened island is drawn as columns at any size. */
  overview?: boolean;
  /** The island the keyboard stands on; its rim wears the focus ring. */
  focusedIslandId?: string | null;
  reducedMotion: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  focusedId: string | null;
  /**
   * Node ids a sentence elsewhere on screen is about (`docs/DECISIONS.md`, "The Library
   * graph stands still"), held like a pointer's neighbourhood; a pointer or the keyboard
   * still wins.
   */
  highlight?: ReadonlySet<string> | null;
  activeLabel: string | null;
  standingLabels: boolean;
  activity?: LibraryWorkActivity;
  visible?: boolean;
  /**
   * The mark whose card is open. The widget owns it as a DOM surface; the loop holds its
   * focus, flows its citations and keeps it beside its mark.
   */
  cardId?: string | null;
  /** The open card's element. Read for its measured size, never written to — see `placeCard`. */
  cardRef?: RefObject<HTMLElement | null>;
  /** Where the card should stand, on every change, per frame while moving; the caller writes it. */
  onCardPlaced?: (box: LibraryGraphCardBox | null) => void;
  onHover: (id: string | null) => void;
  /** A press, or `Enter`: the mark answers with a card beside it, and stays where it is. */
  onPressMark: (node: LibraryGraphNode) => void;
  /** A press on an island of the overview, off any dot: the caller opens that island. */
  onPressIsland?: (island: LibraryIslandPick) => void;
  /** The island under the pointer changed; null once the pointer is off every island. */
  onHoverIsland?: (island: LibraryIslandPick | null) => void;
  /** The person zoomed out of an opened island past its fit: the caller returns to the map. */
  onLeaveIsland?: () => void;
  /** A double press: the shortcut past the card, straight to the page or the map. */
  onActivate: (node: LibraryGraphNode) => void;
  /** A press that landed on no mark. Whatever stands open is dismissed by it. */
  onDismiss: () => void;
}): LibraryGraphEngine {
  const simRef = useRef<LibrarySimulation | null>(null);
  const layoutRef = useRef(layout);
  /** The columns as last laid, for the label rule (a folded band names no file at rest). */
  const columnsRef = useRef<FlowLayout | null>(null);
  /** The islands of the overview as last laid, or null under any other picture. */
  const islandsRef = useRef<IslandsLayout | null>(null);
  /** The island under the pointer on the overview, for its rim and the cursor. */
  const hoveredIslandRef = useRef<string | null>(null);
  /** The islands as bodies (`library-islands-physics.ts`); each dot keeps its offset, so a body carries its dots. */
  const islandFieldRef = useRef<IslandField | null>(null);
  /** Whether the last picture laid was the whole folder, for telling a return from an opened island apart from a growing folder. */
  const lastOverviewRef = useRef(true);
  const islandOffsetsRef = useRef<Map<string, { island: string; dx: number; dy: number }>>(new Map());
  /**
   * The island a wheel zoom-in aimed at, resolved at wheel time; null after a zoom-out. Not
   * per frame, because the edge clamp slides the view under the pointer mid-zoom.
   */
  const zoomAimRef = useRef<string | null>(null);
  /** When a wheel-out last returned the map, in event time; wheel-out is ignored for a beat after. */
  const wheelReturnedAtRef = useRef(-Infinity);
  const onPressIslandRef = useRef(onPressIsland);
  const onHoverIslandRef = useRef(onHoverIsland);
  const onLeaveIslandRef = useRef(onLeaveIsland);
  useEffect(() => {
    onPressIslandRef.current = onPressIsland;
    onHoverIslandRef.current = onHoverIsland;
    onLeaveIslandRef.current = onLeaveIsland;
  }, [onHoverIsland, onLeaveIsland, onPressIsland]);
  /** The scale the fit last asked for; what "zoomed out past the fit" is measured against. */
  const fitScaleRef = useRef(1);
  /**
   * A picture changing under the same marks travels over one `--motion-settle` rather than
   * cutting: shared marks ease, leavers fade as ghosts, arrivals fade in and the camera
   * eases, all from one frame. Reduced motion snaps.
   */
  const travelRef = useRef<{ from: Map<string, LayoutPoint>; since: number } | null>(null);
  const pick = (island: IslandsLayout["islands"][number]): LibraryIslandPick => ({
    id: island.id,
    kind: island.kind,
    label: island.label,
    conceptId: island.conceptId,
    pages: island.pages,
    sources: island.sources,
  });

  /** What the last sync of the graph cost, in ms: layout, simulation and physics together. */
  const syncCostRef = useRef(0);
  /** The ids of the islands whose name the last frame placed; armed only under the `e2e` probe. */
  const islandReportRef = useRef<string[] | null>(null);
  /** Pages with at least one unverified citation, for the islands' stale counts. */
  const stalePagesRef = useRef<Set<string>>(new Set());
  /** Flow up to `ISLANDS_MIN_MARKS` marks, islands past that; `force` stays force. */
  const pictureRef = useRef<"flow" | "force" | "islands">(layout);
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const islandLabelsRef = useRef(islandLabels);
  const overviewRef = useRef(overview);
  useEffect(() => {
    islandLabelsRef.current = islandLabels;
    overviewRef.current = overview;
  }, [islandLabels, overview]);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const viewRef = useRef<LibraryGraphView>({ scale: 1, x: 0, y: 0 });
  /** Whether the view follows the picture, and whether it has caught up; `converged` means nothing while off. */
  const autoFitRef = useRef({ on: true, converged: false });
  const inkRef = useRef<LibraryGraphInk | null>(null);
  /** Screen-space positions of the last painted frame — what the pointer is tested against. */
  const screenRef = useRef<LibraryPositionLookup>(new Map());
  const screenPointsRef = useRef<Map<string, LayoutPoint>>(new Map());
  const worldPositionsRef = useRef<Map<string, LayoutPoint>>(new Map());
  const overviewGeometryRef = useRef<{
    nodes: LibrarySimulation["nodes"];
    ticks: number;
    radii: Map<string, number>;
    columns: FlowLayout | null;
    islands: IslandsLayout | null;
    moving: boolean;
    bounds: ReturnType<typeof librarySimulationBounds>;
    geometry: LibraryGraphGeometry;
  } | null>(null);
  const radiiRef = useRef<Map<string, number>>(new Map());
  /**
   * This folder's zoom ceiling (`libraryZoomMax`): a cap on the drawn widest mark, so it
   * depends on the folder. Rebuilt beside `radiiRef`.
   */
  const zoomMaxRef = useRef(LIBRARY_ZOOM_MAX);
  /** Screen-space radii for paint, hit testing and probes at the last drawn scale. */
  const screenRadiiRef = useRef<Map<string, number>>(new Map());
  const screenRadiusSourceRef = useRef<{ radii: Map<string, number>; scale: number } | null>(null);
  /** The last frame's placed names, armed only by the `e2e` probe; null otherwise, so nothing is allocated. */
  const labelReportRef = useRef<LibraryGraphLabelBox[] | null>(null);
  const boxRef = useRef({ width: 0, height: 0, dpr: 1 });
  const pendingBoxRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const rectRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const frameRef = useRef(0);
  const lastPaintRef = useRef(0);
  /** Nodes whose files are gone, still fading out from where they were. */
  const ghostsRef = useRef<Map<string, { node: LibraryGraphNode; x: number; y: number; since: number }>>(new Map());
  const dimRef = useRef({ value: 0, target: 0 });
  /** The neighbourhood the dim was last about, kept alive while the ramp eases back out. */
  const lastFocusRef = useRef<ReadonlySet<string> | null>(null);
  const pointerRef = useRef<PointerState>({
    phase: "idle",
    pointerId: null,
    down: null,
    last: null,
    pressedNodeId: null,
    drag: null,
    islandDrag: null,
    history: [],
  });
  const touchesRef = useRef<Map<number, LayoutPoint>>(new Map());
  const pinchRef = useRef<{ distance: number; mid: LayoutPoint } | null>(null);
  /** The first tap on a coarse pointer names the dot; the second opens it. */
  const coarseTapRef = useRef<string | null>(null);

  /*
   * The loop reads props through refs filled in an effect, never during render: a discarded
   * render would leave its values in the ref.
   */
  const graphRef = useRef(graph);
  const stateRef = useRef({ selectedId, hoveredId, focusedId, highlight, activeLabel, standingLabels, reducedMotion, activity, visible, cardId });
  const onHoverRef = useRef(onHover);
  const onCardPlacedRef = useRef(onCardPlaced ?? (() => undefined));
  useEffect(() => {
    onCardPlacedRef.current = onCardPlaced ?? (() => undefined);
    graphRef.current = graph;
    stateRef.current = { selectedId, hoveredId, focusedId, highlight, activeLabel, standingLabels, reducedMotion, activity, visible, cardId };
    onHoverRef.current = onHover;
  });

  /**
   * The drift's edge sets (`flowRef`), recomputed with the card or folder, never per frame;
   * the home's one breath for stale citations as it settles is `pulseRef.homeAt`.
   */
  const flowRef = useRef<{ edges: Set<string>; stale: Set<string> }>({ edges: new Set(), stale: new Set() });
  const pulseRef = useRef<{ homeAt: number | null; armed: boolean }>({ homeAt: null, armed: true });
  const cardBoxRef = useRef<LibraryGraphCardBox | null>(null);
  const cardSizeRef = useRef({ width: LIBRARY_CARD_MAX_WIDTH, height: 0 });
  /** The last painted frame's cost in milliseconds, and the mean over the run. See `paint()`. */
  const paintCostRef = useRef({ last: 0, total: 0, frames: 0, worst: 0 });

  useEffect(() => {
    flowRef.current = (() => {
      const { flow, stale } = libraryGraphFlowEdges(graph, cardId);
      return { edges: flow, stale };
    })();
  }, [cardId, graph]);

  // The arrival breath is once per folder, or every resize and sync re-pulses the picture.
  useEffect(() => {
    pulseRef.current = { homeAt: null, armed: true };
  }, [graph]);

  const [pictureAspect, setPictureAspect] = useState<number | null>(null);
  /** Which picture the folder got, for the legend: the flow names things, the islands do not. */
  const [picture, setPicture] = useState<"flow" | "force" | "islands">(layout);
  const [islandsList, setIslandsList] = useState<readonly LibraryIslandPick[]>([]);
  const [walkOrder, setWalkOrder] = useState<readonly string[]>([]);
  /** Publishes the laid columns' reading order; `null` when the picture has no columns. */
  const publishWalkOrder = (layout: FlowLayout | null): void => {
    const next = layout ? layout.columns.flatMap((column) => column.ids) : [];
    setWalkOrder((previous) => (previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next));
  };
  const focusedIslandRef = useRef(focusedIslandId);

  /** Whether the picture is framed, as state for the fit tile; it flips on gestures and arrival, never per frame. */
  const [framed, setFramed] = useState(false);
  const publishFramed = useCallback((next: boolean) => {
    setFramed((current) => (current === next ? current : next));
  }, []);

  // The neighbourhood that keeps its ink while everything else dims.
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
   * This canvas's motion clocks in ms, parsed from CSS; the fallback is the gated mirror
   * (src/shared/motion/tokens.ts), never a fresh literal that could drift.
   */
  const motionRef = useRef({
    fast: MOTION.fast.duration * 1000,
    base: MOTION.base.duration * 1000,
    settle: MOTION.settle.duration * 1000,
    activityCycle: MOTION.base.duration * 1000 + MOTION.settle.duration * 1000,
  });

  /**
   * Keeps the card beside its mark as the mark moves, via a pure placement
   * (`placeLibraryGraphCard`) and two style writes, cheaper than a render. Also called from a
   * layout effect on open, or the card shows for one frame at the canvas's corner.
   */
  const placeCard = useCallback((openNow?: string | null) => {
    /*
     * On open the caller must name the card: `stateRef` fills in a passive effect after the
     * calling layout effect, so the ref still reads null and the card shows with no box.
     */
    const openCardId = openNow === undefined ? stateRef.current.cardId : openNow;
    if (openCardId === null) {
      if (cardBoxRef.current !== null) {
        cardBoxRef.current = null;
        onCardPlacedRef.current(null);
      }
      return;
    }
    const box = boxRef.current;
    const mark = screenRef.current.get(openCardId);
    if (!mark || box.width === 0 || box.height === 0) return;
    const markRadius = screenRadiiRef.current.get(openCardId) ?? 0;
    const element = cardRef?.current ?? null;
    if (element) {
      cardSizeRef.current = {
        width: element.offsetWidth || cardSizeRef.current.width,
        height: element.offsetHeight || cardSizeRef.current.height,
      };
    }
    const placement = placeLibraryGraphCard({
      mark,
      markRadius,
      card: cardSizeRef.current,
      box: { width: box.width, height: box.height },
    });
    const next: LibraryGraphCardBox = {
      nodeId: openCardId,
      left: placement.left,
      top: placement.top,
      side: placement.side,
      width: cardSizeRef.current.width,
      maxHeight: placement.maxHeight,
      mark: { x: mark.x, y: mark.y, radius: markRadius },
    };
    const previous = cardBoxRef.current;
    cardBoxRef.current = next;
    if (
      !previous ||
      previous.nodeId !== next.nodeId ||
      previous.side !== next.side ||
      Math.abs(previous.maxHeight - next.maxHeight) > 0.1 ||
      Math.abs(previous.left - next.left) > 0.1 ||
      Math.abs(previous.top - next.top) > 0.1
    ) {
      /*
       * Handed back, not written: a hook may not mutate its argument `cardRef`
       * (`react-hooks/immutability`). The widget's handler only touches `style`, so no render.
       */
      onCardPlacedRef.current(next);
    }
  }, [cardRef]);

  const paint = useCallback(
    (now: number, settling: boolean) => {
      paintLibraryGraphFrame({
        autoFitRef, boxRef, canvasRef, columnsRef, dimRef, fitScaleRef, flowRef, focusedIslandRef,
        ghostsRef, graphRef, hoveredIslandRef, inkRef, islandFieldRef, islandOffsetsRef,
        islandReportRef, islandsRef, labelReportRef, lastFocusRef, lastPaintRef, localeRef,
        motionRef, neighboursRef, onPressIslandRef, overviewGeometryRef, paintCostRef,
        pendingBoxRef, pick, pictureRef, placeCard, pointerRef, publishFramed, pulseRef, radiiRef,
        screenPointsRef, screenRadiiRef, screenRadiusSourceRef, screenRef, simRef, stalePagesRef,
        stateRef, travelRef, viewRef, worldPositionsRef, zoomAimRef, zoomMaxRef,
      }, now, settling);
    },
    [canvasRef, placeCard, publishFramed],
  );

  const runningRef = useRef(false);
  const wasSettlingRef = useRef(true);
  const stepRef = useRef<(now: number) => void>(() => undefined);

  /** Publishes the settled picture's own aspect for `data-picture-aspect`. */
  const publishAspect = useCallback(() => {
    const sim = simRef.current;
    const bounds = sim ? librarySimulationBounds(sim) : null;
    if (!bounds) return;
    // A one-row picture has no vertical span of centres, so a mark's height stands in.
    const spanX = Math.max(bounds.maxX - bounds.minX, 2 * WIDEST_MARK_WORLD_RADIUS);
    const spanY = Math.max(bounds.maxY - bounds.minY, 2 * WIDEST_MARK_WORLD_RADIUS);
    setPictureAspect((current) =>
      current !== null && Math.abs(current - spanX / spanY) < 0.005 ? current : spanX / spanY,
    );
  }, []);
  const wake = useCallback(() => {
    if (runningRef.current) return;
    if (!stateRef.current.visible) return;
    if (typeof document !== "undefined" && document.hidden) return;
    runningRef.current = true;
    lastPaintRef.current = 0;
    frameRef.current = requestAnimationFrame((now) => stepRef.current(now));
  }, []);
  // The keyboard's island changed: one frame, so its ring moves with it.
  useEffect(() => {
    focusedIslandRef.current = focusedIslandId;
    wake();
  }, [focusedIslandId, wake]);

  const currentActivitySignature = activitySignature(activity);
  useEffect(() => {
    // An activity update paints once, touching no simulation, auto-fit or view, so receipts never reheat the graph.
    wake();
  }, [currentActivitySignature, wake]);

  useEffect(() => {
    if (visible) wake();
    else {
      cancelAnimationFrame(frameRef.current);
      runningRef.current = false;
    }
  }, [visible, wake]);

  useEffect(() => {
    stepRef.current = (now: number) => {
      stepLibraryGraphFrame({
        autoFitRef, dimRef, flowRef, frameRef, ghostsRef, graphRef, islandFieldRef,
        islandOffsetsRef, islandsRef, motionRef, paint, pendingBoxRef, pictureRef, pointerRef,
        publishAspect, pulseRef, runningRef, simRef, stateRef, stepRef, travelRef, wasSettlingRef,
      }, now);
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

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      // The flag falls with the frame, or after a dev double-mount every `wake()` is a no-op.
      runningRef.current = false;
    },
    [],
  );

  /** The last shape of every node, so a removed one can still be drawn while it fades. */
  const lastKnownRef = useRef<Map<string, LibraryGraphNode>>(new Map());

  // The simulation: created once the canvas has a box, then kept in step with the folder.
  const syncSimulation = useCallback(() => {
    syncLibraryGraphPicture({
      autoFitRef, boxRef, canvasRef, columnsRef, ghostsRef, graphRef, islandFieldRef,
      islandLabelsRef, islandOffsetsRef, islandsRef, lastKnownRef, lastOverviewRef, layoutRef,
      motionRef, overviewRef, pendingBoxRef, pick, pictureRef, publishWalkOrder, radiiRef,
      setIslandsList, setPicture, simRef, stalePagesRef, stateRef, syncCostRef, travelRef, wake,
      wasSettlingRef, zoomMaxRef,
    });
  }, [canvasRef, wake]);

  /** Mirrored into a ref so the loop and the observer do not depend on its identity. */
  const syncSimulationRef = useRef(syncSimulation);
  useEffect(() => {
    syncSimulationRef.current = syncSimulation;
  }, [syncSimulation]);

  useEffect(() => {
    syncSimulation();
  }, [graph, reducedMotion, syncSimulation]);

  // Measure the box; the frame commits it.
  useEffect(() => {
    return observeLibraryGraphBox({
      autoFitRef, boxRef, canvasRef, columnsRef, graphRef, islandLabelsRef, islandsRef,
      pendingBoxRef, pictureRef, publishWalkOrder, rectRef, simRef, syncSimulationRef, viewRef,
      wake, zoomMaxRef,
    });
  }, [canvasRef, wake]);


  // A change to selection, hover, focus or the label must repaint even when nothing moves.
  useEffect(() => {
    // An open card holds the dim, or it fades while the person reads the card.
    dimRef.current.target =
      (hoveredId ?? focusedId ?? cardId ?? selectedId) || (highlight !== null && highlight.size > 0)
        ? 1
        : 0;
    wake();
  }, [activeLabel, cardId, focusedId, highlight, hoveredId, selectedId, standingLabels, wake]);

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
        { nodes: graphRef.current.nodes, positions: screenRef.current, radii: screenRadiiRef.current },
        point,
        coarsePointer() ? COARSE_HIT_REACH : undefined,
        // On the overview a dot is pressable only once it is mark-sized; below that its island is.
        pictureRef.current === "islands" ? ISLAND_DOT_PRESS_MIN_PX : 0,
      ),
    [],
  );

  const fitToView = useCallback(() => {
    autoFitRef.current = { on: true, converged: false };
    publishFramed(false);
    wake();
  }, [publishFramed, wake]);

  /** Any deliberate gesture takes the camera off the leash; only `fitToView` puts it back. */
  const takeCamera = (): void => {
    autoFitRef.current = { on: false, converged: true };
  };

  /** Ends the gesture; a press that never travelled is a choice. */
  const finishGesture = useCallback(
    (timeStamp: number, commit?: LayoutPoint) => {
      finishLibraryGraphGesture({
        boxRef, canvasRef, coarsePointer, coarseTapRef, graphRef, islandFieldRef, islandsRef,
        onDismiss, onHoverRef, onPressIslandRef, onPressMark, pick, pictureRef, pointerRef, simRef,
        viewRef, wake,
      }, timeStamp, commit);
    },
    [canvasRef, onDismiss, onPressMark, wake],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      pressLibraryGraphPointer({
        canvasRef, hitTest, pinchRef, pointerRef, pointOf, rectRef, takeCamera, touchesRef,
      }, event);
    },
    [canvasRef, hitTest],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      moveLibraryGraphPointer({
        boxRef, canvasRef, finishGesture, hitTest, hoveredIslandRef, islandFieldRef, islandsRef,
        onHoverIslandRef, onHoverRef, pick, pictureRef, pinchRef, pointerRef, pointOf, rectRef,
        simRef, stateRef, takeCamera, touchesRef, viewRef, wake, zoomMaxRef,
      }, event);
    },
    [canvasRef, finishGesture, hitTest, wake],
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
    zoomAimRef.current = null;
    if (pointerRef.current.phase === "idle") onHoverRef.current(null);
    if (hoveredIslandRef.current !== null) {
      hoveredIslandRef.current = null;
      onHoverIslandRef.current?.(null);
      wake();
    }
  }, [wake]);

  const onDoubleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      // A double press on a mark skips the card and opens it; on the empty canvas it refits.
      const hit = hitTest(pointOf(event));
      if (hit) {
        onActivate(hit);
        return;
      }
      fitToView();
    },
    [fitToView, hitTest, onActivate],
  );

  useEffect(() => {
    return attachLibraryGraphWheel({
      boxRef, canvasRef, fitScaleRef, islandsRef, onLeaveIslandRef, overviewRef, pictureRef,
      rectRef, takeCamera, viewRef, wake, wheelReturnedAtRef, zoomAimRef, zoomMaxRef,
    });
  }, [canvasRef, wake]);

  /**
   * Inspection window under `?e2e=1` only, not a product API: from outside a canvas a grab
   * and a pan look identical, so specs read where marks are and what a gesture holds.
   * Getters over the product's own refs, so a frame pays nothing.
   */
  useEffect(() => {
    return mountLibraryGraphProbe({
      autoFitRef, boxRef, cardBoxRef, columnsRef, fitScaleRef, flowRef, graphRef, islandFieldRef,
      islandReportRef, islandsRef, labelReportRef, paintCostRef, pendingBoxRef, pictureRef,
      pointerRef, pulseRef, screenRadiiRef, screenRef, simRef, syncCostRef, travelRef, viewRef,
    });
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onDoubleClick,
    fitToView,
    framed,
    pictureAspect,
    picture,
    islands: islandsList,
    walkOrder,
    placeCard,
  };
}
