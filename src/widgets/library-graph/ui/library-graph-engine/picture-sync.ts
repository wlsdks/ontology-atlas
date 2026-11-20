import { MOTION } from "@/shared/motion";

import { maxOf } from "../../model/library-graph-extremes";
import { ISLANDS_MIN_MARKS } from "../../model/library-islands-layout";
import { createIslandField, settleIslandField } from "../../model/library-islands-physics";
import {
  applyLibraryFlowLayout,
  applyLibraryIslandsLayout,
  createLibrarySimulation,
  libraryPositions,
  libraryMarkRadii,
  resizeLibrarySimulation,
  settleLibrarySimulation,
  syncLibrarySimulation,
  type LibrarySimulation,
} from "../../model/library-force-simulation";
import { LIBRARY_ZOOM_MAX, libraryZoomMax, scaleBounds } from "../../model/library-graph-view";

import type { LibraryGraphEngineScope } from "./engine-scope";
import { flowWorld, islandsWorld, placeIslandBodies } from "./picture-geometry";

/** A CSS duration token in milliseconds, parsed rather than transcribed. */
function readMs(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const raw = style.getPropertyValue(token).trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw) || fallback;
  if (raw.endsWith("s")) return (Number.parseFloat(raw) || fallback / 1000) * 1000;
  // Map canvas physics budgets are unitless milliseconds; preserve that existing contract.
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number.parseFloat(raw) || fallback;
  return fallback;
}

export function syncLibraryGraphPicture(
  {
    autoFitRef, boxRef, canvasRef, columnsRef, ghostsRef, graphRef, islandFieldRef, islandLabelsRef,
    islandOffsetsRef, islandsRef, lastKnownRef, lastOverviewRef, layoutRef, motionRef, overviewRef,
    pendingBoxRef, pick, pictureRef, publishWalkOrder, radiiRef, setIslandsList, setPicture, simRef,
    stalePagesRef, stateRef, syncCostRef, travelRef, wake, wasSettlingRef, zoomMaxRef,
  }: Pick<
    LibraryGraphEngineScope,
    "autoFitRef" | "boxRef" | "canvasRef" | "columnsRef" | "ghostsRef" | "graphRef" |
    "islandFieldRef" | "islandLabelsRef" | "islandOffsetsRef" | "islandsRef" | "lastKnownRef" |
    "lastOverviewRef" | "layoutRef" | "motionRef" | "overviewRef" | "pendingBoxRef" | "pick" |
    "pictureRef" | "publishWalkOrder" | "radiiRef" | "setIslandsList" | "setPicture" | "simRef" |
    "stalePagesRef" | "stateRef" | "syncCostRef" | "travelRef" | "wake" | "wasSettlingRef" |
    "zoomMaxRef"
  >,
) {
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
    const changed = syncLibrarySimulation(existing, graph, { forces: pictureRef.current === "force" });
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
}

export function observeLibraryGraphBox(
  {
    autoFitRef, boxRef, canvasRef, columnsRef, graphRef, islandLabelsRef, islandsRef, pendingBoxRef,
    pictureRef, publishWalkOrder, rectRef, simRef, syncSimulationRef, viewRef, wake, zoomMaxRef,
  }: Pick<
    LibraryGraphEngineScope,
    "autoFitRef" | "boxRef" | "canvasRef" | "columnsRef" | "graphRef" | "islandLabelsRef" |
    "islandsRef" | "pendingBoxRef" | "pictureRef" | "publishWalkOrder" | "rectRef" | "simRef" |
    "syncSimulationRef" | "viewRef" | "wake" | "zoomMaxRef"
  >,
) {
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
}
