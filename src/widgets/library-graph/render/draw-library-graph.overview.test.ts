// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { drawLibraryGraph, type LibraryGraphFrame, type LibraryGraphGeometry } from "./draw-library-graph";

class RecordedPath {
  static created = 0;
  rects: number[][] = [];
  arcs: number[][] = [];
  constructor() { RecordedPath.created += 1; }
  rect(...values: number[]) { this.rects.push(values); }
  moveTo() {}
  arc(...values: number[]) { this.arcs.push(values); }
}

function fixture() {
  const noop = () => {};
  const fills: Array<{ path?: RecordedPath; ink: string }> = [];
  const ctx = {
    fillStyle: "", globalAlpha: 1, save: noop, restore: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    closePath: noop, rect: noop, arc: noop, roundRect: noop, stroke: noop,
    fillRect: noop, strokeRect: noop, setLineDash: noop, fillText: noop, strokeText: noop,
    translate: vi.fn(), scale: vi.fn(), measureText: () => ({ width: 0 }),
    fill(path?: RecordedPath) { fills.push({ path, ink: this.fillStyle }); },
  };
  const nodes = [
    { id: "s", kind: "source" as const, label: "Source", ref: "sources/s", href: null },
    { id: "p", kind: "page" as const, label: "Page", ref: "wiki/p", href: null },
    { id: "old", kind: "page" as const, label: "Old", ref: "wiki/old", href: null },
  ];
  const geometry: LibraryGraphGeometry = {
    positions: new Map(nodes.map((node, i) => [node.id, { x: i * 10, y: i * 20 }])),
    radii: new Map(nodes.map((node) => [node.id, 2])),
  };
  const frame: LibraryGraphFrame = {
    nodes, edges: [{ id: "e", source: "old", target: "s", relation: "cites", certainty: "unverified" }],
    positions: new Map([...geometry.positions].map(([id, point]) => [id, { x: 400 + point.x, y: 300 + point.y }])),
    radii: geometry.radii, width: 800, height: 600,
    ink: {
      source: "source", page: "page", stale: "stale", ground: "ground", concept: "concept",
      edge: "edge", hoverRing: "hover", selected: "selected", selectedRing: "ring", danger: "danger",
      pageHalo: "halo", sourceLabel: "label", labelSurface: "surface", labelBorder: "border",
      labelInk: "ink", fontFamily: "Test", pageLabelPx: 11, labelPx: 11, captionPx: 9.5,
    },
    selectedId: null, hoveredId: null, focusedId: null, activeLabel: null, standingLabels: false, layout: "islands", focusEdgesOnly: true,
    sourceLabels: false, conceptLabels: false,
    overview: { geometry, view: { x: 0, y: 0, scale: 1 } },
  };
  return { ctx, frame, fills };
}

afterEach(() => { vi.unstubAllGlobals(); RecordedPath.created = 0; });

it("reuses world paths across camera moves while retaining each kind and stale ink", () => {
  vi.stubGlobal("Path2D", RecordedPath);
  const { ctx, frame, fills } = fixture();
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, frame);
  const paths = fills.filter((fill) => fill.path);
  expect(paths.map((fill) => fill.ink)).toEqual(["source", "page", "stale"]);
  expect(paths[0].path?.rects).toEqual([[-2, -2, 4, 4]]);
  expect(paths[1].path?.arcs[0].slice(0, 3)).toEqual([10, 20, 2]);
  expect(paths[2].path?.arcs[0].slice(0, 3)).toEqual([20, 40, 2]);
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, {
    ...frame, overview: { ...frame.overview!, view: { x: 5, y: 7, scale: 2 } },
  });
  expect(RecordedPath.created).toBe(3);
  expect(ctx.translate).toHaveBeenLastCalledWith(390, 286);
  expect(ctx.scale).toHaveBeenLastCalledWith(2, 2);
});

it("rebuilds paths for changed geometry or relation evidence", () => {
  vi.stubGlobal("Path2D", RecordedPath);
  const { ctx, frame, fills } = fixture();
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, frame);
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, { ...frame, edges: [] });
  expect(RecordedPath.created).toBe(6);
  const changed = fills.filter((fill) => fill.path).slice(-3);
  expect(changed[1].path?.arcs).toHaveLength(2);
  expect(changed[2].path?.arcs).toHaveLength(0);
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, {
    ...frame, overview: { ...frame.overview!, geometry: { ...frame.overview!.geometry } },
  });
  expect(RecordedPath.created).toBe(9);
});

it("uses the ordinary paint path while marks are arriving", () => {
  vi.stubGlobal("Path2D", RecordedPath);
  const { ctx, frame } = fixture();
  drawLibraryGraph(ctx as unknown as CanvasRenderingContext2D, { ...frame, opacity: new Map([["s", 0.5]]) });
  expect(RecordedPath.created).toBe(0);
});
