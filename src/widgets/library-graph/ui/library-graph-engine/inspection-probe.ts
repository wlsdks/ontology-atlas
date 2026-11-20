import { isIslandFieldMoving } from "../../model/library-islands-physics";

import type { LibraryGraphEngineScope } from "./engine-scope";

export function mountLibraryGraphProbe(
  {
    autoFitRef, boxRef, cardBoxRef, columnsRef, fitScaleRef, flowRef, graphRef, islandFieldRef,
    islandReportRef, islandsRef, labelReportRef, paintCostRef, pendingBoxRef, pictureRef,
    pointerRef, pulseRef, screenRadiiRef, screenRef, simRef, syncCostRef, travelRef, viewRef,
  }: Pick<
    LibraryGraphEngineScope,
    "autoFitRef" | "boxRef" | "cardBoxRef" | "columnsRef" | "fitScaleRef" | "flowRef" | "graphRef" |
    "islandFieldRef" | "islandReportRef" | "islandsRef" | "labelReportRef" | "paintCostRef" |
    "pendingBoxRef" | "pictureRef" | "pointerRef" | "pulseRef" | "screenRadiiRef" | "screenRef" |
    "simRef" | "syncCostRef" | "travelRef" | "viewRef"
  >,
) {
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
    /** The columns of the flow picture as last laid, in world units, or null under the force layout. */
    layout: () =>
      columnsRef.current
        ? {
            rowGap: columnsRef.current.rowGap,
            columns: columnsRef.current.columns.map((column) => ({
              kind: column.kind,
              x: column.x,
              lanes: column.lanes,
              stacks: column.stacks,
              named: column.named,
              count: column.ids.length,
              labelRoom: column.labelRoom,
            })),
          }
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
}
