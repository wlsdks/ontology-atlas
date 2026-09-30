"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { MOTION } from "@/shared/motion";
import type { LibraryWorkActivity, LibraryWorkEvent } from "@/features/library";

import type { LibraryGraph, LibraryGraphNode } from "../model/build-library-graph";
import {
  libraryGraphFlowEdges,
  libraryGraphStaleEdges,
  placeLibraryGraphCard,
  LIBRARY_CARD_MAX_WIDTH,
  type LibraryGraphCardSide,
} from "../model/library-graph-card";
import { maxOf } from "../model/library-graph-extremes";
import { easeMotion, type LayoutPoint } from "../model/library-graph-layout";
import type { FlowLayout, FlowWorld } from "../model/library-flow-layout";
import { ISLANDS_MIN_MARKS, type IslandsLayout } from "../model/library-islands-layout";
import {
  createIslandField,
  isIslandFieldMoving,
  islandArrival,
  pinIsland,
  releaseIsland,
  settleIslandField,
  stepIslandField,
  type IslandField,
} from "../model/library-islands-physics";
import {
  applyLibraryFlowLayout,
  applyLibraryIslandsLayout,
  createLibrarySimulation,
  hasPinnedNode,
  isLibrarySimulationRunning,
  LIBRARY_FIT_PADDING,
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
  isSameView,
  isWheelZoomIntent,
  LIBRARY_ZOOM_MAX,
  LIBRARY_ZOOM_MIN,
  libraryZoomMax,
  panView,
  scaleBounds,
  screenToWorld,
  SOURCE_LABEL_MIN_SCALE,
  WIDEST_MARK_WORLD_RADIUS,
  wheelPixelDelta,
  wheelZoomFactor,
  worldToScreen,
  zoomViewAbout,
  type LibraryGraphView,
} from "../model/library-graph-view";
import {
  drawLibraryGraph,
  hitTestLibraryGraph,
  type LibraryGraphActivityMark,
  type LibraryGraphFlow,
  type LibraryGraphLabelBox,
} from "../render/draw-library-graph";
import { readLibraryGraphInk, type LibraryGraphInk } from "../render/library-graph-ink";

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
 * Travel before a press becomes a drag: the map's measured `--map-hysteresis-px`, as a
 * literal because that token is scoped to the topology surface.
 */
const DRAG_THRESHOLD_PX = 7;

/** What the fit reserves on every side, in CSS px; constant, so one folder has one framing. */
const FIT_PADDING = LIBRARY_FIT_PADDING;
/**
 * The flow layout's world: the padded pixel box seen through the zoom ceiling, shrunk a
 * little so a small folder's fit lands on the ceiling (`LIBRARY_MAX_MARK_PX`).
 */
function flowWorld(box: { width: number; height: number }, ceiling: number): FlowWorld {
  const shrink = 0.9;
  return {
    width: Math.max(1, ((box.width - FIT_PADDING * 2) / ceiling) * shrink),
    height: Math.max(1, ((box.height - FIT_PADDING * 2) / ceiling) * shrink),
    ceiling,
  };
}
/** The islands overview's world: the padded box shrunk a little, so the fit lands at 1:1. */
function islandsWorld(box: { width: number; height: number }): { width: number; height: number } {
  const shrink = 0.94;
  return {
    width: Math.max(1, (box.width - FIT_PADDING * 2) * shrink),
    height: Math.max(1, (box.height - FIT_PADDING * 2) * shrink),
  };
}
/** The island under a canvas point on the overview; null off every island. */
function islandAt(
  islands: IslandsLayout["islands"] | undefined,
  view: LibraryGraphView,
  box: { width: number; height: number },
  point: LayoutPoint,
): IslandsLayout["islands"][number] | null {
  if (!islands) return null;
  const world = screenToWorld(point, view, box);
  return (
    islands.find((island) =>
      island.band
        ? Math.abs(world.x - island.x) <= island.band.width / 2 && Math.abs(world.y - island.y) <= island.band.height / 2
        : Math.hypot(world.x - island.x, world.y - island.y) <= island.r,
    ) ?? null
  );
}
/**
 * Writes island bodies back onto the picture: each island's centre, and each dot at its
 * offset, since the simulation's nodes are the position store every frame reads.
 */
function placeIslandBodies(
  sim: LibrarySimulation,
  field: IslandField,
  layout: IslandsLayout | null = null,
  offsets: ReadonlyMap<string, { island: string; dx: number; dy: number }> | null = null,
): void {
  const byId = new Map(field.bodies.map((body) => [body.id, body]));
  if (layout) {
    for (const island of layout.islands) {
      const body = byId.get(island.id);
      if (!body) continue;
      island.x = body.x;
      island.y = body.y;
    }
  }
  if (!offsets) return;
  for (const node of sim.nodes) {
    const offset = offsets.get(node.id);
    if (!offset) continue;
    const body = byId.get(offset.island);
    if (!body) continue;
    node.x = body.x + offset.dx;
    node.y = body.y + offset.dy;
  }
}
/** On the overview a page's name stands once its dot is this wide on screen. */
const ISLAND_PAGE_LABEL_MIN_PX = 10;
/** On the overview a file's name waits for a real zoom: a page dot this wide, not merely named. */
const ISLAND_SOURCE_LABEL_MIN_PX = 36;
/**
 * An island spanning this share of the view's shorter side has been zoomed into and opens;
 * a small island opens when aimed at from the zoom ceiling instead.
 */
const ISLAND_OPENS_AT_VIEW_SHARE = 0.45;
/** An opened island zoomed out to this share of its fit scale gives way to the map. */
const ISLAND_LEAVES_BELOW_FIT = 0.6;
/**
 * After a wheel-out returns the map, further wheel-out of the same stream is ignored this
 * long, or it zooms the map past its fit into a small archipelago; wheel-in, press and drag
 * still act at once.
 */
const WHEEL_RETURN_SETTLE_MS = 700;
/**
 * On the overview a dot takes a press only once its radius is this, on screen: a 16px
 * mark is a target, a 4px one is texture and the island under it is what the press means.
 */
const ISLAND_DOT_PRESS_MIN_PX = 8;

/**
 * A folded file band (`FlowColumn.grid` above one) names its files only this far past the
 * source threshold: 24px squares leave no room for a name until about 60px a row.
 */
const FOLDED_LABEL_MIN_SCALE = SOURCE_LABEL_MIN_SCALE * 3.5;

/** How fast an auto-fitting view catches up with the settling picture, per frame. */
const AUTO_FIT_FOLLOW = 0.16;

/** Trailing window over which a release's speed is measured, in milliseconds. */
const RELEASE_WINDOW_MS = 80;

/** Touch reach around a mark, in CSS px. Half of `--touch-target-min` (44) is the floor. */
const COARSE_HIT_REACH = 18;

/** One shared empty set, so a resting frame allocates nothing for a motion it is not making. */
const EMPTY_EDGE_SET: ReadonlySet<string> = new Set<string>();

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
  /** Non-null while an island of the overview is being carried, with its own grab offset. */
  islandDrag: { id: string; offset: LayoutPoint } | null;
  history: Array<{ x: number; y: number; t: number }>;
}

/**
 * Maps a Library work target to an existing page or source node, stricter than a label
 * match, or a model's mention would look like a file read.
 */
function activityNodeId(event: LibraryWorkEvent, graph: LibraryGraph): string | null {
  if (!event.target) return null;
  const nodeId = event.target.kind === "source" ? `source:${event.target.ref}` : `page:${event.target.ref}`;
  return graph.nodes.some((node) => node.id === nodeId) ? nodeId : null;
}

/**
 * Resolves the finite overlay from epoch receipts, apart from the rAF clock. Each `at`
 * is an epoch `Date.now()`, or every receipt reads as fresh after a reload.
 */
export function libraryGraphActivityMarks(
  activity: LibraryWorkActivity | undefined,
  graph: LibraryGraph,
  nowEpochMs: number,
  trailMs: number,
  activeCycleMs: number,
  reducedMotion: boolean,
): LibraryGraphActivityMark[] {
  if (!activity) return [];
  const marks: LibraryGraphActivityMark[] = [];
  const occupied = new Set<string>();
  const append = (event: LibraryWorkEvent): void => {
    const nodeId = activityNodeId(event, graph);
    if (!nodeId || occupied.has(nodeId)) return;
    occupied.add(nodeId);
    const moves = !reducedMotion && (event.kind === "read" || event.kind === "proposal");
    marks.push({
      nodeId,
      kind: event.kind,
      phase: event.phase,
      progress: 0,
      turn: moves ? (Math.max(0, nowEpochMs - event.at) % Math.max(1, activeCycleMs)) / Math.max(1, activeCycleMs) : 0,
    });
  };

  if (activity.isActive && activity.current?.phase === "active") append(activity.current);

  for (const event of activity.recent) {
    if (event.phase !== "complete" || event.kind === "waiting") continue;
    const elapsed = Math.max(0, nowEpochMs - event.at);
    if (elapsed >= trailMs) continue;
    const nodeId = activityNodeId(event, graph);
    if (!nodeId || occupied.has(nodeId)) continue;
    occupied.add(nodeId);
    marks.push({
      nodeId,
      kind: event.kind,
      phase: "complete",
      // Reduced motion receives the settled mark in its single paint, never a frame loop.
      progress: reducedMotion ? 1 : elapsed / Math.max(1, trailMs),
      settled: reducedMotion,
    });
  }
  return marks;
}

/** Only completed receipts can keep the canvas clock awake; a pending wait is intentionally still. */
function hasActivityTrail(
  activity: LibraryWorkActivity | undefined,
  graph: LibraryGraph,
  nowEpochMs: number,
  trailMs: number,
  activeCycleMs: number,
  reducedMotion: boolean,
): boolean {
  if (reducedMotion) return false;
  return libraryGraphActivityMarks(activity, graph, nowEpochMs, trailMs, activeCycleMs, false).some(
    (mark) => mark.phase === "complete" || (mark.phase === "active" && (mark.kind === "read" || mark.kind === "proposal")),
  );
}

/** A primitive dependency: unrelated parent renders must not wake a settled canvas. */
function activitySignature(activity: LibraryWorkActivity | undefined): string {
  if (!activity) return "";
  const event = (value: LibraryWorkEvent | null): string =>
    value
      ? `${value.id}:${value.kind}:${value.phase}:${value.target?.kind ?? ""}:${value.target?.ref ?? ""}:${value.at}`
      : "";
  return `${activity.isActive ? "1" : "0"}|${event(activity.current)}|${activity.recent.map(event).join(",")}`;
}

/** Where the open card stands, for the surface to read and for a gate to measure. */
export interface LibraryGraphCardBox {
  nodeId: string;
  left: number;
  top: number;
  side: LibraryGraphCardSide;
  width: number;
  /** The tallest it may be here; past that it scrolls inside. */
  maxHeight: number;
  /** The mark the card is hung from, in canvas CSS pixels. */
  mark: { x: number; y: number; radius: number };
}

/** An island a press picked: what it stands for and who is on it. */
export interface LibraryIslandPick {
  id: string;
  kind: "concept" | "folder" | "unsorted" | "unread";
  label: string;
  conceptId: string | null;
  pages: readonly string[];
  sources: readonly string[];
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
  /** Whether the camera already sits where {@link LibraryGraphEngine.fitToView} would put it (`isSameView`). */
  framed: boolean;
  /** The settled picture's width over its height, for `data-picture-aspect`. */
  pictureAspect: number | null;
  /** The picture the folder got: `flow` names everything, `islands` is the overview past `ISLANDS_MIN_MARKS`. */
  picture: "flow" | "force" | "islands";
  /** The islands of the overview, largest first, for the keyboard to step over; empty on any other picture. */
  islands: readonly LibraryIslandPick[];
  /**
   * The marks in reading order, column by column, top to bottom, for the keyboard; empty
   * without columns, and the caller falls back to graph order.
   */
  walkOrder: readonly string[];
  /** Places the open card synchronously; a layout effect passes the id, since the state ref fills later. */
  placeCard: (openNow?: string | null) => void;
}

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
  const screenRef = useRef<Map<string, LayoutPoint>>(new Map());
  const worldPositionsRef = useRef<Map<string, LayoutPoint>>(new Map());
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
    (now: number) => {
      const canvas = canvasRef.current;
      const sim = simRef.current;
      if (!canvas || !sim) return;
      /*
       * Resolved from the canvas and cached. A throw means `app/globals.css` lacks the palette;
       * it propagates rather than falling back to a colourless default.
       */
      inkRef.current ??= readLibraryGraphInk(canvas);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      const startedAt = performance.now();

      /*
       * The backing store is resized in the frame, never in the ResizeObserver: writing the
       * canvas width clears the bitmap, and an observer runs after rAF, so it ships a blank frame.
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
      // Where the fit tile would take the camera, every frame, so the tile stops offering a no-op press.
      const fitTarget = fitView(bounds, box, FIT_PADDING, zoomMaxRef.current);
      fitScaleRef.current = fitTarget.scale;
      if (autoFitRef.current.on) {
        const target = fitTarget;
        const current = viewRef.current;
        // Instant under reduced motion and on the first frame.
        const follow = stateRef.current.reducedMotion || current.scale === 1 ? 1 : AUTO_FIT_FOLLOW;
        viewRef.current = {
          scale: current.scale + (target.scale - current.scale) * follow,
          x: current.x + (target.x - current.x) * follow,
          y: current.y + (target.y - current.y) * follow,
        };
        // Auto-fit stays armed after arriving, so motion is the distance left, not "armed",
        // or the loop repaints forever.
        const next = viewRef.current;
        const drift =
          Math.abs(next.scale - target.scale) / Math.max(1e-6, target.scale) +
          (Math.abs(next.x - target.x) + Math.abs(next.y - target.y)) / Math.max(1, box.width);
        // Snap onto the target at the threshold: the lerp is asymptotic, and a leftover
        // fraction resumes on the next wake, so a hover would move every mark.
        if (drift < 0.002) {
          viewRef.current = target;
          autoFitRef.current.converged = true;
        } else {
          autoFitRef.current.converged = false;
        }
      }
      const view = viewRef.current;
      publishFramed(isSameView(view, fitTarget));

      const world = libraryPositions(sim, worldPositionsRef.current);
      const travel = travelRef.current;
      if (travel) {
        const t = (now - travel.since) / Math.max(1, motionRef.current.settle);
        if (t >= 1 || stateRef.current.reducedMotion) travelRef.current = null;
        else {
          const eased = easeMotion(t);
          for (const [id, start] of travel.from) {
            const end = world.get(id);
            if (end) world.set(id, { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased });
          }
        }
      }
      const screen = screenRef.current;
      for (const [id, point] of world) screen.set(id, worldToScreen(point, view, box, screen.get(id)));
      if (screen.size > world.size) for (const id of screen.keys()) if (!world.has(id)) screen.delete(id);
      // Radii go through the same camera as positions, so a zoom grows dots by the same factor.
      const screenRadii = screenRadiiRef.current;
      const radiusSource = screenRadiusSourceRef.current;
      if (radiusSource?.radii !== radiiRef.current || radiusSource.scale !== view.scale) {
        for (const [id, radius] of radiiRef.current) screenRadii.set(id, radius * view.scale);
        if (screenRadii.size > radiiRef.current.size) {
          for (const id of screenRadii.keys()) if (!radiiRef.current.has(id)) screenRadii.delete(id);
        }
        screenRadiusSourceRef.current = { radii: radiiRef.current, scale: view.scale };
      }

      /*
       * The dim ramp runs one `--motion-fast` under reduced motion too: it changes ink, not
       * position, so there is no axis to remove, and a snap would be a hard cut. Every dim is
       * started by the person's own hand (WCAG 2.2 §2.3.3); `settling` sleeps after the ramp.
       */
      const elapsed = lastPaintRef.current === 0 ? 0 : now - lastPaintRef.current;
      lastPaintRef.current = now;
      const dimState = dimRef.current;
      if (dimState.value !== dimState.target) {
        const step = elapsed / Math.max(1, motionRef.current.fast);
        dimState.value =
          dimState.target > dimState.value
            ? Math.min(dimState.target, dimState.value + step)
            : Math.max(dimState.target, dimState.value - step);
      }

      // Arrivals and departures.
      const opacity = new Map<string, number>();
      for (const node of sim.nodes) if (node.entered < 1) opacity.set(node.id, easeMotion(node.entered));
      // On the overview a dot arrives with its island: it fades in as the island closes in.
      if (pictureRef.current === "islands" && islandFieldRef.current && isIslandFieldMoving(islandFieldRef.current)) {
        const arrivalOf = new Map<string, number>();
        for (const body of islandFieldRef.current.bodies) {
          const arrival = islandArrival(body);
          if (arrival < 1) arrivalOf.set(body.id, easeMotion(arrival));
        }
        if (arrivalOf.size > 0) {
          for (const [id, offset] of islandOffsetsRef.current) {
            const alpha = arrivalOf.get(offset.island);
            if (alpha !== undefined) opacity.set(id, Math.min(opacity.get(id) ?? 1, alpha));
          }
        }
      }
      const ghosts = ghostsRef.current;
      const nodes: LibraryGraphNode[] = ghosts.size > 0 ? [...graphRef.current.nodes] : graphRef.current.nodes;
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
      /*
       * The ego focus, strongest first: hover, keyboard, an open card (its dim must survive
       * the pointer leaving to read it), then the open page. Pointing elsewhere closes nothing.
       */
      const active =
        stateRef.current.hoveredId ??
        stateRef.current.focusedId ??
        stateRef.current.cardId ??
        stateRef.current.selectedId;
      // Without one, a strip clause's `highlight` holds the slot as a set, since its fact is an edge with two ends.
      const attention = active
        ? neighboursRef.current.get(active) ?? new Set([active])
        : stateRef.current.highlight && stateRef.current.highlight.size > 0
          ? stateRef.current.highlight
          : null;
      /*
       * The last set is kept while `dim` is above zero: the renderer draws full ink whenever
       * the focus set is null, so dropping it at once makes the un-dim a hard cut.
       */
      if (attention) lastFocusRef.current = attention;
      const focus = attention ?? (dimState.value > 0 ? lastFocusRef.current : null);
      const activity = libraryGraphActivityMarks(
        stateRef.current.activity,
        graphRef.current,
        Date.now(),
        motionRef.current.base + motionRef.current.settle,
        motionRef.current.activityCycle,
        stateRef.current.reducedMotion,
      );

      /*
       * Three motions: flow (an open card's citations drift toward the page), arrival (one
       * pass for a just-written page, bounded by its receipt) and pulse (the stale dot's
       * breath while its card is open, or once as the home settles). Reduced motion sets
       * the `still` flag. At rest with no card every set is empty; `settling` schedules frames.
       */
      const reduced = stateRef.current.reducedMotion;
      const period = Math.max(1, motionRef.current.activityCycle);
      const arrived = new Map<string, number>();
      const arrivalEdges = new Set<string>();
      for (const mark of activity) {
        if (mark.kind !== "write" || mark.phase !== "complete") continue;
        if (!mark.nodeId.startsWith("page:")) continue;
        const progress = Math.min(1, Math.max(0, mark.progress));
        arrived.set(mark.nodeId, progress);
        for (const edge of graphRef.current.edges) {
          if (edge.relation !== "cites") continue;
          if (edge.source === mark.nodeId || edge.target === mark.nodeId) arrivalEdges.add(edge.id);
        }
      }
      const cardOpen = stateRef.current.cardId !== null;
      const homePulse =
        pulseRef.current.homeAt !== null && now - pulseRef.current.homeAt <= period * 2
          ? (now - pulseRef.current.homeAt) / (period * 2)
          : null;
      if (pulseRef.current.homeAt !== null && homePulse === null) pulseRef.current.homeAt = null;
      const pulse =
        cardOpen && flowRef.current.stale.size > 0
          ? flowRef.current.stale
          : homePulse !== null
            ? libraryGraphStaleEdges(graphRef.current)
            : EMPTY_EDGE_SET;
      const flow: LibraryGraphFlow | null =
        flowRef.current.edges.size > 0 || arrivalEdges.size > 0 || pulse.size > 0
          ? {
              edges: cardOpen ? flowRef.current.edges : EMPTY_EDGE_SET,
              // One dash period per activity cycle: slower than loading, fast enough to show direction.
              phase: ((now % period) / period),
              arrivalEdges,
              arrivalPhase: arrived.size > 0 ? Math.min(...arrived.values()) : 0,
              arrived,
              pulse,
              // One breath over two activity cycles, derived from tokens this canvas reads.
              pulsePhase:
                homePulse !== null && !cardOpen
                  ? Math.sin(Math.PI * homePulse) ** 2
                  : Math.sin((Math.PI * (now % (period * 2))) / (period * 2)) ** 2,
              still: reduced,
            }
          : null;

      // The passes below append, so the probe arrays are cleared per frame.
      if (labelReportRef.current) labelReportRef.current.length = 0;
      if (islandReportRef.current) islandReportRef.current.length = 0;
      // The islands in canvas pixels, and how wide a page dot is on screen right now.
      const islands =
        pictureRef.current === "islands" && islandsRef.current
          ? islandsRef.current.islands.map((island) => {
              const at = worldToScreen(island, view, { width, height });
              let stale = 0;
              for (const id of island.pages) if (stalePagesRef.current.has(id)) stale += 1;
              const body = islandFieldRef.current?.bodies[islandFieldRef.current.index.get(island.id) ?? -1];
              return {
                id: island.id,
                kind: island.kind,
                label: island.label,
                x: at.x,
                y: at.y,
                r: island.r * view.scale,
                pages: island.pages.length,
                sources: island.sources.length,
                stale,
                arrival: body ? islandArrival(body) : 1,
                ...(island.band ? { band: { width: island.band.width * view.scale, height: island.band.height * view.scale } } : {}),
              };
            })
          : undefined;
      const widestPagePx = pictureRef.current === "islands" ? 2 * view.scale * maxOf(nodes.filter((node) => node.kind === "page").map((node) => radiiRef.current.get(node.id) ?? 0), 0) : Infinity;
      /*
       * Zooming into an island opens it as columns, as a press would: a packed island has no
       * room for names however far the camera closes in. The chip and Escape lead back.
       */
      const aim = zoomAimRef.current;
      if (
        pictureRef.current === "islands" &&
        islands &&
        aim &&
        !(autoFitRef.current.on && !autoFitRef.current.converged) &&
        pointerRef.current.phase !== "dragging" &&
        onPressIslandRef.current
      ) {
        const atCeiling = view.scale >= zoomMaxRef.current - 1e-6;
        // The Unread island is a pile, not a topic, so it never opens.
        const filling = islands.find(
          (island) => island.id === aim && island.kind !== "unread" && (atCeiling || island.r * 2 >= ISLAND_OPENS_AT_VIEW_SHARE * Math.min(width, height)),
        );
        const source = filling ? islandsRef.current?.islands.find((island) => island.id === filling.id) : null;
        if (source) {
          zoomAimRef.current = null;
          onPressIslandRef.current(pick(source));
        }
      }
      drawLibraryGraph(context, {
        nodes,
        edges: graphRef.current.edges,
        positions: screen,
        width,
        height,
        ink: inkRef.current,
        locale: localeRef.current,
        selectedId: stateRef.current.selectedId,
        hoveredId: stateRef.current.hoveredId,
        focusedId: stateRef.current.focusedId,
        activeLabel: stateRef.current.activeLabel,
        standingLabels: stateRef.current.standingLabels,
        radii: screenRadiiRef.current,
        // A plain source column names every file; a folded band only once zoomed in.
        sourceLabels:
          pictureRef.current === "flow"
            ? (columnsRef.current?.columns.find((column) => column.kind === "source")?.grid ?? 1) === 1 || view.scale >= FOLDED_LABEL_MIN_SCALE
            : pictureRef.current === "islands"
              ? widestPagePx >= ISLAND_SOURCE_LABEL_MIN_PX
              : view.scale >= SOURCE_LABEL_MIN_SCALE,
        conceptLabels:
          pictureRef.current === "flow"
            ? (columnsRef.current?.columns.find((column) => column.kind === "concept")?.grid ?? 1) === 1 || view.scale >= FOLDED_LABEL_MIN_SCALE
            : pictureRef.current === "islands"
              ? false
              : view.scale >= SOURCE_LABEL_MIN_SCALE,
        // Each column's name room in screen px; the layout returns world units.
        flowLabelRoom:
          pictureRef.current === "flow" && columnsRef.current
            ? Object.fromEntries(
                columnsRef.current.columns.map((column) => [column.kind, column.labelRoom * view.scale]),
              )
            : undefined,
        labelReport: labelReportRef.current ?? undefined,
        opacity,
        dim: dimState.value,
        focus,
        activity,
        flow,
        layout: pictureRef.current,
        islands,
        hoveredIslandId: hoveredIslandRef.current,
        focusedIslandId: focusedIslandRef.current,
        islandReport: islandReportRef.current ?? undefined,
        pageLabels: pictureRef.current !== "islands" || widestPagePx >= ISLAND_PAGE_LABEL_MIN_PX,
        focusEdgesOnly: pictureRef.current === "islands",
      });

      placeCard();

      /*
       * Machine-readable state for e2e specs: `data-view-scale` tells a zoom from a pan, and
       * the `data-interaction` value tells a node grab from a background pan.
       */
      const scaleText = view.scale.toFixed(4);
      if (canvas.dataset.viewScale !== scaleText) canvas.dataset.viewScale = scaleText;
      const interaction =
        pointerRef.current.drag !== null || pointerRef.current.islandDrag !== null
          ? "node"
          : pointerRef.current.phase === "dragging"
            ? "pan"
            : "idle";
      if (canvas.dataset.interaction !== interaction) canvas.dataset.interaction = interaction;

      // Frame cost for the `e2e` probe, judged against the 2 ms budget in `docs/DECISIONS.md`,
      // "A press on a Library mark opens a card beside it".
      const cost = performance.now() - startedAt;
      const record = paintCostRef.current;
      record.last = cost;
      record.total += cost;
      record.frames += 1;
      if (cost > record.worst) record.worst = cost;
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
      const sim = simRef.current;
      if (!sim || !stateRef.current.visible || document.hidden) {
        runningRef.current = false;
        return;
      }
      const reduced = stateRef.current.reducedMotion;
      // The islands' own physics: one fixed step a frame while anything moves, then still.
      const field = pictureRef.current === "islands" ? islandFieldRef.current : null;
      if (field && isIslandFieldMoving(field)) {
        if (reduced && pointerRef.current.islandDrag === null) settleIslandField(field);
        else stepIslandField(field);
        placeIslandBodies(sim, field, islandsRef.current, islandOffsetsRef.current);
      }
      const busy = isLibrarySimulationRunning(sim) || hasPinnedNode(sim) || (field !== null && isIslandFieldMoving(field));
      /*
       * Forces run only under the force picture: laid marks stand closer than the collision
       * reach, so stepping would blow packed dots into a cloud. A laid picture still advances
       * fade-in arrivals at the simulation's rate.
       */
      if (pictureRef.current !== "force") for (const node of sim.nodes) if (node.entered < 1) node.entered = Math.min(1, node.entered + 0.08);
      if (busy && pictureRef.current === "force") {
        /*
         * Reduced motion settles here too: `usePrefersReducedMotion` reads false on the first
         * render (hydration), so the preference arrives after creation, and a later reheat
         * would otherwise loop forever. A held mark still steps: the person's own hand
         * (WCAG 2.2 §2.3.3).
         */
        if (!reduced) stepLibrarySimulation(sim);
        else if (hasPinnedNode(sim)) stepLibrarySimulation(sim);
        else settleLibrarySimulation(sim);
      }
      const settling =
        busy ||
        travelRef.current !== null ||
        dimRef.current.value !== dimRef.current.target ||
        ghostsRef.current.size > 0 ||
        (autoFitRef.current.on && !autoFitRef.current.converged) ||
        pendingBoxRef.current !== null ||
        sim.nodes.some((node) => node.entered < 1) ||
        hasActivityTrail(
          stateRef.current.activity,
          graphRef.current,
          Date.now(),
          motionRef.current.base + motionRef.current.settle,
          motionRef.current.activityCycle,
          reduced,
        ) ||
        /*
         * The only unprompted frames, each bounded: the drift while a card is open, and the
         * home's one stale breath, which clears itself. Reduced motion takes neither.
         */
        (!reduced &&
          ((stateRef.current.cardId !== null && flowRef.current.edges.size > 0) ||
            pulseRef.current.homeAt !== null));

      /*
       * A picture with nowhere left to go paints its last frame and stops the loop rather
       * than idling; every later change comes back through `wake()`.
       */
      if (settling) {
        wasSettlingRef.current = true;
        paint(now);
      } else {
        // The aspect is published once the picture stops, or it reports the seed spiral's shape.
        paint(now);
        if (wasSettlingRef.current) {
          wasSettlingRef.current = false;
          publishAspect();
          /*
           * One breath for the stale citations once the home settles, not on mount, since a
           * pulse on travelling marks is a flicker; `homeAt` clears itself, so never a loop.
           */
          if (
            !reduced &&
            pulseRef.current.armed &&
            pulseRef.current.homeAt === null &&
            stateRef.current.cardId === null &&
            libraryGraphStaleEdges(graphRef.current).size > 0
          ) {
            pulseRef.current = { homeAt: now, armed: false };
            frameRef.current = requestAnimationFrame((next) => stepRef.current(next));
            return;
          }
        }
        runningRef.current = false;
        return;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const syncStartedAt = typeof performance === "undefined" ? 0 : performance.now();
    const graph = graphRef.current;
    const reducedMotion = stateRef.current.reducedMotion;
    const style = getComputedStyle(canvas);
    motionRef.current = {
      fast: readMs(style, "--motion-fast", MOTION.fast.duration * 1000),
      base: readMs(style, "--motion-base", MOTION.base.duration * 1000),
      settle: readMs(style, "--motion-settle", MOTION.settle.duration * 1000),
      // Existing canvas settle budget (900ms), not a library-local clock or a progress timer.
      activityCycle: readMs(
        style,
        "--map-node-release-settle-ms",
        MOTION.base.duration * 1000 + MOTION.settle.duration * 1000,
      ),
    };

    const box = pendingBoxRef.current ?? boxRef.current;
    // A fixed world scale: the radii never consult the box.
    radiiRef.current = libraryMarkRadii(graph);
    zoomMaxRef.current =
      radiiRef.current.size === 0 ? LIBRARY_ZOOM_MAX : libraryZoomMax(Math.max(...radiiRef.current.values()));
    pictureRef.current = layoutRef.current === "flow" && overviewRef.current && graph.nodes.length >= ISLANDS_MIN_MARKS ? "islands" : layoutRef.current;
    setPicture(pictureRef.current);
    const layPicture = (sim: LibrarySimulation, travelling: boolean, known: ReadonlySet<string> | null = null) => {
      /*
       * Only marks from the previous picture travel; a just-added mark starts on the seed
       * spiral, so it is placed where it belongs and fades in instead of flying across.
       */
      const from = travelling && !reducedMotion ? libraryPositions(sim) : null;
      if (from && known) for (const id of [...from.keys()]) if (!known.has(id)) from.delete(id);
      if (pictureRef.current === "islands") {
        columnsRef.current = null;
        publishWalkOrder(null);
        islandsRef.current = applyLibraryIslandsLayout(sim, graph, islandsWorld(box), islandLabelsRef.current);
        // The ceiling follows the overview's own dot sizes.
        radiiRef.current = islandsRef.current.radii;
        zoomMaxRef.current = radiiRef.current.size === 0 ? LIBRARY_ZOOM_MAX : libraryZoomMax(maxOf(radiiRef.current.values()));
        setIslandsList(islandsRef.current.islands.map(pick));
        // Dots belong to their island: each keeps its offset from the island's centre.
        const offsets = new Map<string, { island: string; dx: number; dy: number }>();
        for (const island of islandsRef.current.islands) {
          for (const id of [...island.pages, ...island.sources, ...(island.conceptId ? [island.conceptId] : [])]) {
            const point = islandsRef.current.positions.get(id);
            if (point) offsets.set(id, { island: island.id, dx: point.x - island.x, dy: point.y - island.y });
          }
        }
        /*
         * A dot that changed island leaves a ghost and fades in where it belongs, or a folder
         * loading in chunks sends clouds of dots flying through every island.
         */
        const previousOffsets = islandOffsetsRef.current;
        if (from && previousOffsets.size > 0) {
          const now = typeof performance === "undefined" ? 0 : performance.now();
          for (const [id, start] of [...from.entries()]) {
            const before = previousOffsets.get(id)?.island;
            const after = offsets.get(id)?.island;
            if (before === undefined || after === undefined || before === after) continue;
            from.delete(id);
            const node = graph.nodes.find((candidate) => candidate.id === id);
            const live = sim.nodes[sim.index.get(id) ?? -1];
            if (!node || !live) continue;
            live.entered = 0;
            ghostsRef.current.set(`${id}#moved`, { node: { ...node, id: `${id}#moved` }, x: start.x, y: start.y, since: now });
          }
        }
        islandOffsetsRef.current = offsets;
        /*
         * Islands arrive on a folder's first map, chunked loads included. A relaid map keeps
         * each island where it stands and springs it home; a return from an opened island
         * travels instead; reduced motion settles in place.
         */
        const world = islandsWorld(box);
        const previous = islandFieldRef.current;
        const returning = travelling && !lastOverviewRef.current;
        const arriving = !reducedMotion && !returning && previous === null;
        const field = createIslandField(islandsRef.current.islands, { x: world.width / 2, y: world.height / 2 }, { arriving });
        if (previous && !returning) {
          for (const body of field.bodies) {
            const was = previous.bodies[previous.index.get(body.id) ?? -1];
            if (!was) continue;
            body.x = was.x;
            body.y = was.y;
            if (Math.hypot(body.x - body.home.x, body.y - body.home.y) > 0.05) field.moving = true;
          }
        }
        if (reducedMotion) settleIslandField(field);
        islandFieldRef.current = field;
        placeIslandBodies(sim, field, islandsRef.current, offsets);
      } else {
        islandsRef.current = null;
        islandFieldRef.current = null;
        islandOffsetsRef.current = new Map();
        setIslandsList([]);
        columnsRef.current = applyLibraryFlowLayout(sim, graph, flowWorld(box, zoomMaxRef.current));
        publishWalkOrder(columnsRef.current);
      }
      if (from && from.size > 0) {
        // Only marks on both pictures travel; the rest are ghosts or arrivals.
        const ids = new Set(sim.nodes.map((node) => node.id));
        for (const id of [...from.keys()]) if (!ids.has(id)) from.delete(id);
        travelRef.current = from.size > 0 ? { from, since: typeof performance === "undefined" ? 0 : performance.now() } : null;
      }
      lastOverviewRef.current = overviewRef.current;
      autoFitRef.current = { on: true, converged: false };
    };
    const existing = simRef.current;
    if (!existing) {
      if (box.width === 0 || box.height === 0) return;
      const sim = createLibrarySimulation({ graph, box });
      simRef.current = sim;
      // Reduced motion settles before the first frame and never ticks: the same picture, synchronously.
      if (pictureRef.current !== "force") layPicture(sim, false);
      else if (reducedMotion) settleLibrarySimulation(sim);
      autoFitRef.current = { on: true, converged: false };
    } else {
      const known = new Set(existing.nodes.map((node) => node.id));
      const changed = syncLibrarySimulation(existing, graph);
      // The columns are recomputed whole: a new page changes every row under it.
      if (pictureRef.current !== "force") layPicture(existing, true, known);
      const now = typeof performance === "undefined" ? 0 : performance.now();
      for (const gone of changed.removed) {
        const node = ghostsRef.current.get(gone.id)?.node ?? lastKnownRef.current.get(gone.id);
        if (node) ghostsRef.current.set(gone.id, { node, x: gone.x, y: gone.y, since: now });
      }
    }
    lastKnownRef.current = new Map(graph.nodes.map((node) => [node.id, node]));
    syncCostRef.current = (typeof performance === "undefined" ? 0 : performance.now()) - syncStartedAt;
    stalePagesRef.current = new Set(graph.edges.filter((edge) => edge.certainty === "unverified").map((edge) => edge.source));

    // The loop publishes the aspect at rest; here the picture is still the seed spiral.
    wasSettlingRef.current = true;
    wake();
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
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const previous = boxRef.current;
      pendingBoxRef.current = { width: rect.width, height: rect.height, dpr };
      rectRef.current = { left: rect.left, top: rect.top };
      const sim = simRef.current;
      // The force picture's scale and composition are facts about the folder, so a resize only
      // records the box there; the laid flow and islands pictures are re-laid below.
      if (sim) {
        const before = { ...sim.box };
        resizeLibrarySimulation(sim, { width: rect.width, height: rect.height });
        // Columns are a fact about the box: a new width moves them, and the view refits.
        if (pictureRef.current !== "force" && (before.width !== sim.box.width || before.height !== sim.box.height)) {
          if (pictureRef.current === "islands") islandsRef.current = applyLibraryIslandsLayout(sim, graphRef.current, islandsWorld(sim.box), islandLabelsRef.current);
          else {
            columnsRef.current = applyLibraryFlowLayout(sim, graphRef.current, flowWorld(sim.box, zoomMaxRef.current));
            publishWalkOrder(columnsRef.current);
          }
          autoFitRef.current = { on: true, converged: false };
        }
      }
      // The first box is what lets the simulation be created at all.
      else if (rect.width > 0 && rect.height > 0) syncSimulationRef.current();
      /*
       * A taken camera keeps the same world extent visible when the box changes: the scale
       * follows the smaller axis ratio about a fixed centre, so nothing leaves the edges and
       * no arrangement is refitted away. Clamped to `scaleBounds`, as a wheel is.
       */
      if (
        !autoFitRef.current.on &&
        sim &&
        rect.width > 0 &&
        rect.height > 0 &&
        previous.width > 0 &&
        previous.height > 0 &&
        (Math.abs(rect.width - previous.width) > 1 || Math.abs(rect.height - previous.height) > 1)
      ) {
        const box = { width: rect.width, height: rect.height };
        const ratio = Math.min(box.width / previous.width, box.height / previous.height);
        const limits = scaleBounds(zoomMaxRef.current);
        const view = viewRef.current;
        viewRef.current = {
          ...view,
          scale: Math.min(limits.max, Math.max(limits.min, view.scale * ratio)),
        };
      }
      wake();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
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
      const state = pointerRef.current;
      const sim = simRef.current;
      if (state.drag && sim) {
        releaseLibraryNode(sim, state.drag.nodeId, releaseVelocity(state.history, timeStamp, viewRef.current.scale));
        reheatLibrarySimulation(sim);
      }
      if (state.islandDrag && islandFieldRef.current) releaseIsland(islandFieldRef.current, state.islandDrag.id);
      const pressed = state.pressedNodeId;
      pointerRef.current = {
        phase: "idle",
        pointerId: null,
        down: null,
        last: null,
        pressedNodeId: null,
        drag: null,
    islandDrag: null,
        history: [],
      };
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "";
      if (commit) {
        const node = pressed
          ? graphRef.current.nodes.find((candidate) => candidate.id === pressed) ?? null
          : null;
        if (node) {
          // One tap at every pointer type: a press only opens a reversible card, never navigates.
          coarseTapRef.current = null;
          if (coarsePointer()) onHoverRef.current(node.id);
          onPressMark(node);
        } else {
          /* An island press opens it; an empty-canvas press dismisses what stands open. */
          const island = pictureRef.current === "islands" ? islandAt(islandsRef.current?.islands, viewRef.current, boxRef.current, commit) : null;
          if (island && onPressIslandRef.current) {
            onDismiss();
            onPressIslandRef.current(pick(island));
          } else onDismiss();
        }
      }
      wake();
    },
    [canvasRef, onDismiss, onPressMark, wake],
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
          // Two fingers abandon any press or drag in progress before the pinch starts.
          const [first, second] = [...touchesRef.current.values()];
          pointerRef.current = {
            phase: "idle",
            pointerId: null,
            down: null,
            last: null,
            pressedNodeId: null,
            drag: null,
    islandDrag: null,
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
    islandDrag: null,
        history: [{ x: point.x, y: point.y, t: event.timeStamp }],
      };
    },
    [canvasRef, hitTest],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      /*
       * The box position is re-read on every move: a scroll moves the canvas with no event
       * here, so a cached offset hit-tests beside the pointer. The read forces no layout.
       */
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        rectRef.current = { left: rect.left, top: rect.top };
      }
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
            const bounds = scaleBounds(zoomMaxRef.current);
            let next = zoomViewAbout(viewRef.current, box, mid, distance / pinch.distance, bounds);
            // The midpoint's own movement pans, so one gesture pinches and pans.
            next = panView(next, { x: mid.x - pinch.mid.x, y: mid.y - pinch.mid.y });
            viewRef.current = next;
          }
          pinchRef.current = { distance, mid };
          wake();
        }
        return;
      }

      // A release outside the canvas is only visible in `buttons`, so it is checked on every move.
      if (state.phase !== "idle" && event.buttons === 0) {
        finishGesture(event.timeStamp);
        return;
      }

      if (state.phase === "idle") {
        const hit = hitTest(point);
        if (hit?.id !== stateRef.current.hoveredId) onHoverRef.current(hit?.id ?? null);
        const island = hit || pictureRef.current !== "islands" ? null : islandAt(islandsRef.current?.islands, viewRef.current, boxRef.current, point);
        if ((island?.id ?? null) !== hoveredIslandRef.current) {
          hoveredIslandRef.current = island?.id ?? null;
          onHoverIslandRef.current?.(island ? pick(island) : null);
          wake();
        }
        // The cursor is the only press affordance on painted marks, which no DOM gate can see.
        event.currentTarget.style.cursor = hit || island ? "pointer" : "grab";
        return;
      }

      if (state.phase === "pressed") {
        const travelled = Math.hypot(point.x - (state.down?.x ?? point.x), point.y - (state.down?.y ?? point.y));
        if (travelled < DRAG_THRESHOLD_PX) return;
        state.phase = "dragging";
        takeCamera();
        // Decided once: what was under the pointer at pointerdown is what the gesture carries.
        const grabbed = state.pressedNodeId;
        state.pressedNodeId = null;
        // On the overview a hand carries the island; the physics shoves others aside and back.
        const heldIsland =
          !grabbed && pictureRef.current === "islands" && islandFieldRef.current
            ? islandAt(islandsRef.current?.islands, viewRef.current, boxRef.current, state.down ?? point)
            : null;
        if (heldIsland && islandFieldRef.current) {
          const world = screenToWorld(point, viewRef.current, box);
          state.islandDrag = { id: heldIsland.id, offset: { x: heldIsland.x - world.x, y: heldIsland.y - world.y } };
          pinIsland(islandFieldRef.current, heldIsland.id, { x: heldIsland.x, y: heldIsland.y });
        }
        // In the flow layout a mark has one place; a hand that moves it pans the picture.
        if (grabbed && sim && sim.index.has(grabbed) && pictureRef.current === "force") {
          const node = sim.nodes[sim.index.get(grabbed)!]!;
          const world = screenToWorld(point, viewRef.current, box);
          state.drag = { nodeId: grabbed, offset: { x: node.x - world.x, y: node.y - world.y } };
          pinLibraryNode(sim, grabbed, { x: node.x, y: node.y });
          reheatLibrarySimulation(sim);
        }
        event.currentTarget.style.cursor = "grabbing";
      }

      if (state.phase === "dragging") {
        if (state.islandDrag && islandFieldRef.current) {
          const world = screenToWorld(point, viewRef.current, box);
          pinIsland(islandFieldRef.current, state.islandDrag.id, { x: world.x + state.islandDrag.offset.x, y: world.y + state.islandDrag.offset.y });
        } else if (state.drag && sim) {
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent): void => {
      // A native listener: React's delegated `wheel` is passive, so `preventDefault` there cannot stop page scroll.
      const pixels = wheelPixelDelta(event, typeof window === "undefined" ? 800 : window.innerHeight);
      if (!isWheelZoomIntent(pixels, event.ctrlKey)) return;
      event.preventDefault();
      if (pixels > 0 && overviewRef.current && event.timeStamp - wheelReturnedAtRef.current < WHEEL_RETURN_SETTLE_MS) return;
      const rect = canvas.getBoundingClientRect();
      rectRef.current = { left: rect.left, top: rect.top };
      takeCamera();
      const about = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // The island under the pointer at the start of a zoom-in run is the aim; later steps
      // keep it, since the edge clamp slides the view under the pointer.
      if (pixels >= 0) zoomAimRef.current = null;
      else if (pictureRef.current === "islands" && zoomAimRef.current === null) {
        zoomAimRef.current = islandAt(islandsRef.current?.islands, viewRef.current, boxRef.current, about)?.id ?? null;
      }
      viewRef.current = zoomViewAbout(
        viewRef.current,
        boxRef.current,
        about,
        wheelZoomFactor(pixels),
        scaleBounds(zoomMaxRef.current),
      );
      /*
       * Zooming out of an opened island past a margin below its fit returns to the map; the
       * margin stops an overshoot bouncing out. The zoom floor counts, since a wide island fits there.
       */
      const scaleNow = viewRef.current.scale;
      if (pixels > 0 && !overviewRef.current && (scaleNow <= fitScaleRef.current * ISLAND_LEAVES_BELOW_FIT || scaleNow <= LIBRARY_ZOOM_MIN + 1e-6)) {
        wheelReturnedAtRef.current = event.timeStamp;
        onLeaveIslandRef.current?.();
      }
      wake();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, wake]);

  /**
   * Inspection window under `?e2e=1` only, not a product API: from outside a canvas a grab
   * and a pan look identical, so specs read where marks are and what a gesture holds.
   * Getters over the product's own refs, so a frame pays nothing.
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
            radius: screenRadiiRef.current.get(node.id) ?? 0,
          };
        }),
      /** Every relation by endpoint id; with `nodes()`, a spec can count crossings and collisions. */
      edges: () =>
        graphRef.current.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          certainty: edge.certainty,
        })),
      /** What the pointer is holding right now: a mark, the background, or nothing. */
      interaction: () => ({
        kind: pointerRef.current.drag || pointerRef.current.islandDrag ? ("node" as const) : pointerRef.current.phase === "dragging" ? ("pan" as const) : ("idle" as const),
        nodeId: pointerRef.current.drag?.nodeId ?? pointerRef.current.islandDrag?.id ?? null,
      }),
      view: () => ({ ...viewRef.current, ...boxRef.current }),
      /** The columns of the flow picture as last laid, or null under the force layout. */
      layout: () =>
        columnsRef.current
          ? { rowGap: columnsRef.current.rowGap, columns: columnsRef.current.columns.map((column) => ({ kind: column.kind, x: column.x, grid: column.grid, count: column.ids.length })) }
          : null,
      /** The scale the fit tile would take the camera to. */
      fitScale: () => fitScaleRef.current,
      /** The islands of the overview, in world units, or null under any other picture. */
      islands: () =>
        islandsRef.current
          ? islandsRef.current.islands.map((island) => ({ id: island.id, kind: island.kind, label: island.label, x: island.x, y: island.y, r: island.r, pages: island.pages.length, sources: island.sources.length, ...(island.band ? { band: island.band } : {}) }))
          : null,
      /** Every name the last frame placed, from the label pass's own output; empty until one armed frame. */
      labels: () => labelReportRef.current ?? [],
      /** The islands whose name the last frame placed; a name that lost a collision is not here. */
      islandNames: () => islandReportRef.current ?? [],
      /** Where the simulation is: above the floor it is still arranging itself. */
      alpha: () => simRef.current?.alpha ?? 0,
      /**
       * Whether marks are still travelling (camera easing, a mark entering, a pending box);
       * laid pictures keep `alpha()` at 0, so specs wait on this.
       */
      arriving: () =>
        (autoFitRef.current.on && !autoFitRef.current.converged) ||
        pendingBoxRef.current !== null ||
        travelRef.current !== null ||
        (islandFieldRef.current !== null && pictureRef.current === "islands" && isIslandFieldMoving(islandFieldRef.current)) ||
        (simRef.current?.nodes.some((node) => node.entered < 1) ?? false),
      /** The open card's placement with its painted mark, in one frame's coordinates. */
      card: () => cardBoxRef.current,
      /** Which lines are moving, and whether they are travelling or standing still. */
      flow: () => ({
        edges: [...flowRef.current.edges],
        stale: [...flowRef.current.stale],
        pulsing: pulseRef.current.homeAt !== null,
      }),
      /** What the last sync of the graph cost, in ms. */
      syncCost: () => syncCostRef.current,
      /** Frame costs in ms; `reset()` first, since a folder's arrival is the costliest frame. */
      paint: () => ({
        last: paintCostRef.current.last,
        mean: paintCostRef.current.frames === 0 ? 0 : paintCostRef.current.total / paintCostRef.current.frames,
        worst: paintCostRef.current.worst,
        frames: paintCostRef.current.frames,
        reset: () => {
          paintCostRef.current = { last: 0, total: 0, frames: 0, worst: 0 };
        },
      }),
    };
    labelReportRef.current = [];
    islandReportRef.current = [];
    (window as unknown as { __atlasLibraryGraph?: typeof probe }).__atlasLibraryGraph = probe;
    return () => {
      labelReportRef.current = null;
      islandReportRef.current = null;
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
    framed,
    pictureAspect,
    picture,
    islands: islandsList,
    walkOrder,
    placeCard,
  };
}

/**
 * A released mark's speed in world units per tick, over a trailing window anchored at the
 * release, so a drag held still before letting go stops dead.
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
  // Map canvas physics budgets are unitless milliseconds; preserve that existing contract.
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number.parseFloat(raw) || fallback;
  return fallback;
}
