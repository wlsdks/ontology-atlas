import type { LibraryGraphNode } from "../../model/build-library-graph";
import { libraryGraphStaleEdges } from "../../model/library-graph-card";
import { maxOf } from "../../model/library-graph-extremes";
import { easeMotion } from "../../model/library-graph-layout";
import { isIslandFieldMoving, islandArrival } from "../../model/library-islands-physics";
import { libraryPositions, librarySimulationBounds } from "../../model/library-force-simulation";
import {
  createProjectedPositions,
  fitView,
  isSameView,
  SOURCE_LABEL_MIN_SCALE,
  worldToScreen,
} from "../../model/library-graph-view";
import { drawLibraryGraph, type LibraryGraphFlow } from "../../render/draw-library-graph";
import { readLibraryGraphInk } from "../../render/library-graph-ink";

import type { LibraryGraphEngineScope } from "./engine-scope";
import { libraryGraphActivityMarks } from "./activity-marks";
import { FIT_PADDING, flowFitView } from "./picture-geometry";

/** On the overview a page's name stands once its dot is this wide on screen. */
const ISLAND_PAGE_LABEL_MIN_PX = 10;
/** On the overview a file's name waits for a real zoom: a page dot this wide, not merely named. */
const ISLAND_SOURCE_LABEL_MIN_PX = 36;
/**
 * An island spanning this share of the view's shorter side has been zoomed into and opens;
 * a small island opens when aimed at from the zoom ceiling instead.
 */
const ISLAND_OPENS_AT_VIEW_SHARE = 0.45;

/**
 * A flow column with no names at rest (folded, or given no room) names its marks only this
 * far past the source threshold: 24px squares leave no room for a name until about 60px a row.
 */
const FOLDED_LABEL_MIN_SCALE = SOURCE_LABEL_MIN_SCALE * 3.5;

/** How fast an auto-fitting view catches up with the settling picture, per frame. */
const AUTO_FIT_FOLLOW = 0.16;

/** One shared empty set, so a resting frame allocates nothing for a motion it is not making. */
const EMPTY_EDGE_SET: ReadonlySet<string> = new Set<string>();

export function paintLibraryGraphFrame(
  {
    autoFitRef, boxRef, canvasRef, columnsRef, dimRef, fitScaleRef, flowRef, focusedIslandRef,
    ghostsRef, graphRef, hoveredIslandRef, inkRef, islandFieldRef, islandOffsetsRef,
    islandReportRef, islandsRef, labelReportRef, lastFocusRef, lastPaintRef, localeRef, motionRef,
    neighboursRef, onPressIslandRef, overviewGeometryRef, paintCostRef, pendingBoxRef, pick,
    pictureRef, placeCard, pointerRef, publishFramed, pulseRef, radiiRef, screenPointsRef,
    screenRadiiRef, screenRadiusSourceRef, screenRef, simRef, stalePagesRef, stateRef, travelRef,
    viewRef, worldPositionsRef, zoomAimRef, zoomMaxRef,
  }: Pick<
    LibraryGraphEngineScope,
    "autoFitRef" | "boxRef" | "canvasRef" | "columnsRef" | "dimRef" | "fitScaleRef" | "flowRef" |
    "focusedIslandRef" | "ghostsRef" | "graphRef" | "hoveredIslandRef" | "inkRef" |
    "islandFieldRef" | "islandOffsetsRef" | "islandReportRef" | "islandsRef" | "labelReportRef" |
    "lastFocusRef" | "lastPaintRef" | "localeRef" | "motionRef" | "neighboursRef" |
    "onPressIslandRef" | "overviewGeometryRef" | "paintCostRef" | "pendingBoxRef" | "pick" |
    "pictureRef" | "placeCard" | "pointerRef" | "publishFramed" | "pulseRef" | "radiiRef" |
    "screenPointsRef" | "screenRadiiRef" | "screenRadiusSourceRef" | "screenRef" | "simRef" |
    "stalePagesRef" | "stateRef" | "travelRef" | "viewRef" | "worldPositionsRef" | "zoomAimRef" |
    "zoomMaxRef"
  >,
  now: number,
) {
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

  const moving = travelRef.current !== null || ghostsRef.current.size > 0 ||
    (islandFieldRef.current !== null && isIslandFieldMoving(islandFieldRef.current));
  let overviewGeometry = overviewGeometryRef.current;
  const geometryChanged = !overviewGeometry || overviewGeometry.nodes !== sim.nodes ||
    overviewGeometry.ticks !== sim.ticks || overviewGeometry.radii !== radiiRef.current ||
    overviewGeometry.columns !== columnsRef.current || overviewGeometry.islands !== islandsRef.current ||
    overviewGeometry.moving || moving;
  const box = { width, height };
  // The flow picture frames the box it was laid in, so the name room it keeps at its edges stays on screen.
  const laidFlow = pictureRef.current === "flow" && columnsRef.current && columnsRef.current.positions.size > 0 ? columnsRef.current : null;
  const bounds = laidFlow
    ? { minX: 0, minY: 0, maxX: laidFlow.extent.width, maxY: laidFlow.extent.height }
    : pictureRef.current !== "islands" || geometryChanged
      ? librarySimulationBounds(sim)
      : overviewGeometry?.bounds ?? null;
  // Where the fit tile would take the camera, every frame, so the tile stops offering a no-op press.
  const fitTarget = laidFlow && bounds ? flowFitView(bounds, box, zoomMaxRef.current) : fitView(bounds, box, FIT_PADDING, zoomMaxRef.current);
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

  const world = pictureRef.current !== "islands" || geometryChanged
    ? libraryPositions(sim, worldPositionsRef.current)
    : worldPositionsRef.current;
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
  const ghosts = ghostsRef.current;
  const screenPoints = screenPointsRef.current;
  if (geometryChanged) {
    for (const id of screenPoints.keys()) if (!world.has(id) && !ghosts.has(id)) screenPoints.delete(id);
  }
  const screen = createProjectedPositions({ get: (id) => world.get(id) ?? ghosts.get(id) }, view, box, screenPoints);
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
  const nodes: LibraryGraphNode[] = ghosts.size > 0 ? [...graphRef.current.nodes] : graphRef.current.nodes;
  if (ghosts.size > 0) {
    for (const [id, ghost] of ghosts) {
      const gone = (now - ghost.since) / Math.max(1, motionRef.current.base);
      if (gone >= 1 || stateRef.current.reducedMotion) {
        ghosts.delete(id);
        continue;
      }
      nodes.push(ghost.node);
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
  if (pictureRef.current === "islands" && geometryChanged) {
    overviewGeometry = {
      nodes: sim.nodes, ticks: sim.ticks, radii: radiiRef.current,
      columns: columnsRef.current, islands: islandsRef.current, moving, bounds,
      geometry: { positions: world, radii: radiiRef.current },
    };
    overviewGeometryRef.current = overviewGeometry;
  }
  /*
   * In the flow picture a column names its marks at rest when the layout gave it room, files
   * and concepts only while unfolded; a column without names shows them once zoomed in.
   */
  const namedAtRest = (kind: LibraryGraphNode["kind"], scale: number): boolean => {
    const column = columnsRef.current?.columns.find((candidate) => candidate.kind === kind);
    if (!column || scale >= FOLDED_LABEL_MIN_SCALE) return true;
    return column.labelRoom > 0 && (kind === "page" || column.grid === 1);
  };
  drawLibraryGraph(context, {
    nodes,
    edges: graphRef.current.edges,
    positions: screen,
    overview: pictureRef.current === "islands" && overviewGeometry ? { geometry: overviewGeometry.geometry, view } : undefined,
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
    sourceLabels:
      pictureRef.current === "flow"
        ? namedAtRest("source", view.scale)
        : pictureRef.current === "islands"
          ? widestPagePx >= ISLAND_SOURCE_LABEL_MIN_PX
          : view.scale >= SOURCE_LABEL_MIN_SCALE,
    conceptLabels:
      pictureRef.current === "flow"
        ? namedAtRest("concept", view.scale)
        : pictureRef.current === "islands"
          ? false
          : view.scale >= SOURCE_LABEL_MIN_SCALE,
    // Each named column's room in screen px; the layout returns world units.
    flowLabelRoom:
      pictureRef.current === "flow" && columnsRef.current
        ? Object.fromEntries(
            columnsRef.current.columns.filter((column) => column.labelRoom > 0).map((column) => [column.kind, column.labelRoom * view.scale]),
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
    pageLabels: pictureRef.current === "flow" ? namedAtRest("page", view.scale) : pictureRef.current !== "islands" || widestPagePx >= ISLAND_PAGE_LABEL_MIN_PX,
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
}
