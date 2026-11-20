// @vitest-environment node
import { createHash } from "node:crypto";
import { getHeapStatistics, setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryGraphEdge, LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import { flowLayout } from "../model/library-flow-layout";
import type { LayoutPoint } from "../model/library-graph-layout";
import { fitBox, fitView, LIBRARY_ZOOM_MAX } from "../model/library-graph-view";
import { drawLibraryGraph, type LibraryGraphFrame, type LibraryGraphLabelBox } from "./draw-library-graph";
import { BoxGrid } from "./library-box-grid";
import type { LibraryGraphInk } from "./library-graph-ink";
import { LibraryLabelOccupancy } from "./library-label-occupancy";
import { drawStandingNames } from "./library-standing-names";

type ScreenBox = { x: number; y: number; width: number; height: number };

const INK: LibraryGraphInk = {
  ground: "ground", page: "page", source: "source", concept: "concept", edge: "edge",
  hoverRing: "hover", selected: "selected", selectedRing: "ring", danger: "danger", stale: "stale",
  pageHalo: "halo", sourceLabel: "label", labelSurface: "surface", labelBorder: "border",
  labelInk: "ink", fontFamily: "Test", pageLabelPx: 11, labelPx: 11, captionPx: 9.5,
};

class StubPath {
  rect() {}
  moveTo() {}
  arc() {}
}

/**
 * A context that writes every call to `trace` with the state in force at that call, which is what
 * the pixels depend on; a glyph is 0.55 of the font size wide.
 */
function tracingContext(): { ctx: CanvasRenderingContext2D; trace: unknown[] } {
  const trace: unknown[] = [];
  const state: Record<string | symbol, unknown> = { font: "10px Test", globalAlpha: 1, lineDash: [] };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "measureText") {
        return (text: string) => ({ width: [...text].length * Number.parseFloat(String(target.font)) * 0.55 });
      }
      if (key === "setLineDash") return (pattern: number[]) => void (target.lineDash = [...pattern]);
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        // A restore puts back the saved state whatever was set before it, so that state draws nothing.
        if (key === "restore") return void trace.push([key]);
        trace.push([key, ...args.map((arg) => (arg instanceof StubPath ? "path" : arg)), JSON.stringify(target)]);
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, trace };
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function node(kind: LibraryGraphNodeKind, index: number): LibraryGraphNode {
  const label = kind === "source" ? `batch-${index % 7}/doc-${index}.md` : `Page ${index} ${["vault", "graph", "evidence review", "boundary"][index % 4]}`;
  return { id: `${kind}:${index}`, kind, label, ref: label, href: null };
}

function frameOf(
  nodes: LibraryGraphNode[],
  positions: Map<string, LayoutPoint>,
  radii: Map<string, number>,
  extra: Partial<LibraryGraphFrame>,
): LibraryGraphFrame {
  return {
    nodes, edges: [], positions, radii, width: 1088, height: 627, ink: INK,
    selectedId: null, hoveredId: null, focusedId: null, activeLabel: null,
    standingLabels: true, sourceLabels: true, conceptLabels: true, pageLabels: true,
    labelReport: [],
    ...extra,
  };
}

/** The opened island's columns: sources left, pages right, rows `pitch` apart from `top`. */
function columns(pages: number, pitch: number, top: number, left = 0, pageRadius?: number): LibraryGraphFrame {
  const nodes: LibraryGraphNode[] = [];
  const positions = new Map<string, LayoutPoint>();
  const radii = new Map<string, number>();
  for (let index = 0; index < pages; index += 1) {
    for (const [kind, x] of [["source", 300], ["page", 760]] as const) {
      const mark = node(kind, index);
      nodes.push(mark);
      positions.set(mark.id, { x: left + x + (index % 3) * 2, y: top + index * pitch });
      radii.set(mark.id, kind === "page" ? (pageRadius ?? 3 + (index % 4)) : 2.5);
    }
  }
  return frameOf(nodes, positions, radii, { layout: "flow", flowLabelRoom: { page: 140, source: 120 } });
}

/** Clusters spilling past every edge, with a missing centre, a NaN centre and a negative radius. */
function cloud(count: number, seed: number): LibraryGraphFrame {
  const next = random(seed);
  const nodes: LibraryGraphNode[] = [];
  const positions = new Map<string, LayoutPoint>();
  const radii = new Map<string, number>();
  const centres = Array.from({ length: 9 }, () => ({ x: -150 + next() * 1400, y: -100 + next() * 830 }));
  for (let index = 0; index < count; index += 1) {
    const kind: LibraryGraphNodeKind = index % 5 === 0 ? "concept" : index % 2 === 0 ? "page" : "source";
    const mark = node(kind, index);
    nodes.push(mark);
    if (index === 7) continue;
    const centre = centres[index % centres.length];
    const spread = 40 + (index % 13) * 9;
    positions.set(mark.id, index === 11 ? { x: Number.NaN, y: 10 } : { x: centre.x + (next() - 0.5) * spread * 2, y: centre.y + (next() - 0.5) * spread });
    radii.set(mark.id, index === 13 ? -4 : 2 + next() * 6);
  }
  const focus = new Set(nodes.slice(0, 40).map((mark) => mark.id));
  return frameOf(nodes, positions, radii, { layout: "force", selectedId: nodes[2].id, hoveredId: nodes[4].id, focus, dim: 0.5 });
}

/** The islands overview, whose marks are found through the world-space mark index. */
function overview(count: number, seed: number): LibraryGraphFrame {
  const frame = cloud(count, seed);
  const view = { x: 40, y: -20, scale: 1.6 };
  const world = new Map<string, LayoutPoint>();
  for (const [id, point] of frame.positions as Map<string, LayoutPoint>) {
    world.set(id, { x: view.x + (point.x - frame.width / 2) / view.scale, y: view.y + (point.y - frame.height / 2) / view.scale });
  }
  return { ...frame, layout: "islands", focusEdgesOnly: true, overview: { geometry: { positions: world, radii: frame.radii! }, view } };
}

/**
 * An island the flow layout folds into stacks, zoomed in near its right end: stacks stand far past
 * the left edge, so a name's room reaches across more of the canvas than the box grid buckets.
 */
function laidIsland(pages: number, seed: number): LibraryGraphFrame {
  const next = random(seed);
  const nodes: LibraryGraphNode[] = [];
  const edges: LibraryGraphEdge[] = [];
  const titles = ["vault and graph", "an evidence review of the boundary", "x", "boundary notes"];
  for (let index = 0; index < pages; index += 1) {
    nodes.push({ id: `page:${index}`, kind: "page", label: `Page ${index} ${titles[index % 4]}`, ref: `w/${index}`, href: null });
    if (next() < 0.8) {
      nodes.push({ id: `source:${index}`, kind: "source", label: `batch-${index % 7}/doc-${index}.md`, ref: `${index}.md`, href: null });
      edges.push({ id: `c${index}`, source: `page:${index}`, target: `source:${index}`, relation: "cites", certainty: "current" });
    }
  }
  const concepts = Math.floor(next() * 40);
  for (let index = 0; index < concepts; index += 1) {
    nodes.push({ id: `concept:${index}`, kind: "concept", label: `Concept number ${index}`, ref: `c/${index}`, href: null });
    for (let k = 0; k < 3; k += 1) edges.push({ id: `m${index}-${k}`, source: `page:${Math.floor(next() * pages)}`, target: `concept:${index}`, relation: "mentions", certainty: "current" });
  }
  const graph = { nodes, edges, counts: { sources: 0, pages, concepts, cites: 0, mentions: 0 } };
  const box = { width: 1440, height: 900 };
  const pad = { x: 24, y: 24 };
  const layout = flowLayout(graph, { ...fitBox(box, pad), ceiling: LIBRARY_ZOOM_MAX });
  const fit = fitView({ minX: 0, minY: 0, maxX: layout.extent.width, maxY: layout.extent.height }, box, pad, LIBRARY_ZOOM_MAX);
  const xs = [...layout.positions.values()].map((point) => point.x);
  const view = { x: Math.max(...xs) - 200, y: fit.y, scale: LIBRARY_ZOOM_MAX };
  const positions = new Map<string, LayoutPoint>();
  const radii = new Map<string, number>();
  for (const mark of nodes) {
    const point = layout.positions.get(mark.id)!;
    positions.set(mark.id, { x: box.width / 2 + (point.x - view.x) * view.scale, y: box.height / 2 + (point.y - view.y) * view.scale });
    radii.set(mark.id, (mark.kind === "source" ? 3.5 : 5 + (mark.id.length % 4)) * view.scale);
  }
  const flowLabelRoom = Object.fromEntries(layout.columns.filter((column) => column.labelRoom > 0).map((column) => [column.kind, column.labelRoom * view.scale]));
  expect(layout.columns.find((column) => column.kind === "page")!.stacks, "the island folds into stacks").toBeGreaterThanOrEqual(2);
  return { ...frameOf(nodes, positions, radii, { layout: "flow", flowLabelRoom }), width: box.width, height: box.height };
}

function drawn(frame: LibraryGraphFrame): { digest: string; labels: LibraryGraphLabelBox[] } {
  const { ctx, trace } = tracingContext();
  drawLibraryGraph(ctx, frame);
  return { digest: createHash("sha256").update(JSON.stringify(trace)).digest("hex").slice(0, 16), labels: frame.labelReport ?? [] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("standing names", () => {
  /** Canvas command streams drawn by the reference linear scan over every placed box, per fixture. */
  const fixtures: Array<[string, () => LibraryGraphFrame, string, number]> = [
    ["opened island columns at fit", () => columns(1950, 0.31, 6), "3e47890a0c7c0a36", 0],
    ["opened island columns zoomed in", () => columns(1950, 7.5, -4000), "abf73cad20c898cb", 75],
    ["a force cloud past every edge", () => cloud(3000, 7), "458118ed58eb402a", 44],
    ["the islands overview", () => overview(3000, 11), "6b2569ff6e526e4f", 51],
    ["a small folder with leaders", () => cloud(90, 3), "fc65bbd834906eed", 63],
    ["a laid island zoomed in near its right end", () => laidIsland(2400, 7 * 31337), "b390fda7a108d4d7", 267],
  ];

  it.each(fixtures)("%s: places and draws exactly what the reference did", (_name, make, digest, count) => {
    vi.stubGlobal("Path2D", StubPath);
    const result = drawn(make());
    console.log(`[standing-names] ${_name}: ${result.digest} · ${result.labels.length} labels`);
    expect(result.labels.length).toBe(count);
    expect(result.digest).toBe(digest);
  });

  it.each([
    ["at fit", (pages: number) => columns(pages, 615 / pages, 6)],
    ["at fit off the pixel grid", (pages: number) => columns(pages, 615 / pages, 6.74, 0.74, 2.5)],
    ["zoomed in", (pages: number) => columns(pages, 7.5, -4000)],
  ])("places names with work in proportion to the marks for an opened island %s", (_name, make) => {
    vi.stubGlobal("Path2D", StubPath);
    const small = placementWork(() => drawLibraryGraph(tracingContext().ctx, make(2_000)));
    const large = placementWork(() => drawLibraryGraph(tracingContext().ctx, make(20_000)));
    console.log(`[standing-names] ${_name}: work ${small} at 4,000 marks, ${large} at 40,000`);
    expect(small).toBeGreaterThan(0);
    expect(large / small).toBeLessThan(12.5);
    // At most 2.3 tests per mark measured; a scan per name costs about 165 even when the names stay few.
    expect(large / 40_000).toBeLessThan(12);
  });

  it("draws a repeated frame from the last placement and places again once a mark moves", () => {
    vi.stubGlobal("Path2D", StubPath);
    const frame = cloud(3000, 7);
    const { ctx, trace } = tracingContext();
    const first = placementWork(() => drawLibraryGraph(ctx, { ...frame, labelReport: [] }));
    const firstTrace = trace.splice(0);
    const repeatedReport: LibraryGraphLabelBox[] = [];
    const repeated = placementWork(() => drawLibraryGraph(ctx, { ...frame, dim: 0.9, labelReport: repeatedReport }));
    expect(first).toBeGreaterThan(0);
    expect(repeated).toBe(0);
    expect(repeatedReport).toHaveLength(44);
    const texts = (calls: unknown[]) => calls.filter((call) => (call as unknown[])[0] === "fillText").map((call) => (call as unknown[]).slice(0, 4));
    expect(texts(trace)).toEqual(texts(firstTrace));

    const positions = new Map(frame.positions as Map<string, LayoutPoint>);
    const moved = repeatedReport.find((label) => Number.isFinite(label.x))!.nodeId;
    positions.set(moved, { x: positions.get(moved)!.x + 30, y: positions.get(moved)!.y });
    const replaced = placementWork(() => drawLibraryGraph(ctx, { ...frame, positions }));
    expect(replaced).toBeGreaterThan(0);
  });

  /** Frame B differs from frame A in one thing the placement reads. */
  const named = (frame: LibraryGraphFrame): string[] => {
    const report: LibraryGraphLabelBox[] = [];
    drawLibraryGraph(tracingContext().ctx, { ...frame, labelReport: report });
    return report.filter((label) => Number.isFinite(label.x)).map((label) => label.nodeId);
  };
  const crowd = (): LibraryGraphFrame => ({ ...cloud(3000, 7), hoveredId: null, selectedId: null });
  const changes: Array<[string, () => [LibraryGraphFrame, LibraryGraphFrame]]> = [
    ["hover on a named mark", () => { const a = crowd(); return [a, { ...a, hoveredId: named(a)[5] }]; }],
    ["a selection outside the focus set", () => {
      const a = crowd();
      return [a, { ...a, selectedId: a.nodes.find((mark) => !a.focus!.has(mark.id) && named(a).includes(mark.id))!.id }];
    }],
    ["the focus set replaced by one of the same size", () => {
      const a = crowd();
      return [a, { ...a, focus: new Set(a.nodes.slice(40, 80).map((mark) => mark.id)) }];
    }],
    ["the width", () => { const a = crowd(); return [a, { ...a, width: a.width - 300 }]; }],
    ["the height", () => { const a = crowd(); return [a, { ...a, height: a.height - 250 }]; }],
    ["file names off", () => { const a = crowd(); return [a, { ...a, sourceLabels: false }]; }],
    ["page names off", () => { const a = crowd(); return [a, { ...a, pageLabels: false }]; }],
    ["the flow room", () => { const a = columns(1950, 7.5, -4000); return [a, { ...a, flowLabelRoom: { page: 40, source: 30 } }]; }],
    ["the nodes replaced by renamed ones", () => {
      const a = crowd();
      return [a, { ...a, nodes: a.nodes.map((mark) => ({ ...mark, label: `${mark.label} renamed at length` })) }];
    }],
    ["a radius", () => {
      const a = crowd();
      const radii = new Map(a.radii);
      radii.set(named(a)[3], 40);
      return [a, { ...a, radii }];
    }],
    ["a second folder on the same canvas", () => [crowd(), { ...cloud(3000, 8), hoveredId: null, selectedId: null }]],
  ];

  it.each(changes)("names a frame after one with a different %s as a fresh canvas would", (_name, pair) => {
    vi.stubGlobal("Path2D", StubPath);
    const [a, b] = pair();
    const fresh: LibraryGraphLabelBox[] = [];
    drawLibraryGraph(tracingContext().ctx, { ...b, labelReport: fresh });
    const { ctx } = tracingContext();
    drawLibraryGraph(ctx, { ...a, labelReport: [] });
    const reused: LibraryGraphLabelBox[] = [];
    drawLibraryGraph(ctx, { ...b, labelReport: reused });
    expect(reused).toEqual(fresh);
  });
});

/** Box tests at the grid, plus each occupancy question and hold, for one run of the placement. */
function placementWork(run: () => void): number {
  let work = 0;
  const some = BoxGrid.prototype.some;
  const spies = [
    vi.spyOn(BoxGrid.prototype, "some").mockImplementation(function (this: BoxGrid<ScreenBox>, box, margin, test) {
      return some.call(this, box, margin, (item) => {
        work += 1;
        return test(item);
      });
    }),
    vi.spyOn(LibraryLabelOccupancy.prototype, "blocks"),
    vi.spyOn(LibraryLabelOccupancy.prototype, "hold"),
  ];
  run();
  for (const spy of spies.slice(1)) work += spy.mock.calls.length;
  for (const spy of spies) spy.mockRestore();
  return work;
}

/** A context that only measures text, so a heap reading around a name pass sees the pass alone. */
function quietContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const ctx = {
    font: "10px Test", globalAlpha: 1, textAlign: "left", textBaseline: "alphabetic", lineWidth: 1,
    lineJoin: "miter", strokeStyle: "", fillStyle: "",
    measureText: (text: string) => ({ width: text.length * Number.parseFloat(ctx.font) * 0.55 }),
    setLineDash: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, strokeText: noop, fillText: noop,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Writes `base` scaled about the canvas centre and shifted right into `live`'s points, in place. */
function zoomInto(frame: LibraryGraphFrame, base: Map<string, LayoutPoint>, live: Map<string, LayoutPoint>, scale: number, shiftX: number): void {
  const cx = frame.width / 2, cy = frame.height / 2;
  for (const [id, point] of base) {
    const at = live.get(id)!;
    at.x = cx + (point.x - cx) * scale + shiftX;
    at.y = cy + (point.y - cy) * scale;
  }
}

function livePositions(frame: LibraryGraphFrame): { base: Map<string, LayoutPoint>; live: Map<string, LayoutPoint> } {
  const base = frame.positions as Map<string, LayoutPoint>;
  return { base, live: new Map([...base].map(([id, point]) => [id, { ...point }])) };
}

describe("standing names while marks move", () => {
  const one = () => 1;

  it.each([
    ["opened island columns zoomed in", () => columns(1950, 7.5, -4000)],
    ["a force cloud past every edge", () => cloud(3000, 7)],
    ["a laid island zoomed in near its right end", () => laidIsland(2400, 7 * 31337)],
  ])("names the still frame after a motion exactly as a fresh canvas does: %s", (_name, make) => {
    vi.stubGlobal("Path2D", StubPath);
    const target = make();
    const { base, live } = livePositions(target);
    const { ctx } = tracingContext();
    zoomInto(target, base, live, 1.6, -80);
    drawLibraryGraph(ctx, { ...target, positions: live, labelReport: [] });
    for (let step = 1; step <= 12; step += 1) {
      zoomInto(target, base, live, 1.6 - 0.05 * step, -80 + step * 6.6);
      drawLibraryGraph(ctx, { ...target, positions: live, moving: true, labelReport: [] });
    }
    zoomInto(target, base, live, 1, 0);
    const settled: LibraryGraphLabelBox[] = [];
    drawLibraryGraph(ctx, { ...target, positions: live, labelReport: settled });
    expect(settled).toEqual(drawn({ ...target, positions: live }).labels);
  });

  it("carries names through a moving frame at 40,000 marks without placing or allocating per mark", () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const frame = columns(20_000, 7.5, -4000);
    const { base, live } = livePositions(frame);
    let lookups = 0;
    const counted = { get: (id: string) => ((lookups += 1), live.get(id)) };
    const ctx = quietContext();
    const report: LibraryGraphLabelBox[] = [];
    const stillWork = placementWork(() => drawStandingNames(ctx, { ...frame, positions: counted, labelReport: report }, null, null, one));
    const stillLookups = lookups;
    expect(report.length).toBeGreaterThan(40);

    const still = { ...frame, positions: counted, labelReport: undefined };
    const moving = { ...still, moving: true };
    const frames = 120;
    for (let step = 0; step < frames; step += 1) {
      zoomInto(frame, base, live, 1 - step * 0.001, step * 0.25);
      drawStandingNames(ctx, moving, null, null, one);
    }
    lookups = 0;
    const movingWork = placementWork(() => drawStandingNames(ctx, moving, null, null, one));
    const movingLookups = lookups;

    let movingBytes = 0;
    gc();
    for (let step = 0; step < frames; step += 1) {
      zoomInto(frame, base, live, 0.88 - step * 0.001, 30 + step * 0.25);
      const before = getHeapStatistics().used_heap_size;
      drawStandingNames(ctx, moving, null, null, one);
      movingBytes += getHeapStatistics().used_heap_size - before;
    }
    gc();
    const before = getHeapStatistics().used_heap_size;
    drawStandingNames(ctx, still, null, null, one);
    const stillBytes = getHeapStatistics().used_heap_size - before;
    console.log(`[standing-names] 40,000 marks, ${report.length} names: still frame work ${stillWork}, ${stillLookups} lookups, ${stillBytes} bytes; moving frame work ${movingWork}, ${movingLookups} lookups, ${Math.round(movingBytes / frames)} bytes a frame`);
    expect(movingWork).toBe(0);
    expect(movingLookups).toBeLessThanOrEqual(report.length);
    expect(stillLookups).toBeGreaterThanOrEqual(40_000);
    // About 150 bytes a drawn name measured (argument boxing at the canvas calls), none per mark.
    expect(movingBytes / frames).toBeLessThan(report.length * 512);
    expect(stillBytes, "the heap reading sees a placement").toBeGreaterThan(movingBytes / frames);
  });

  it("fades names out while marks crowd them, never brings one in or back, and keeps each frame's change small", () => {
    vi.stubGlobal("Path2D", StubPath);
    const frame = columns(1950, 7.5, -4000);
    const { base, live } = livePositions(frame);
    const { ctx, trace } = tracingContext();
    /** Each drawn name's ink, read from the alpha in force at its `fillText`. */
    const inks = (report: LibraryGraphLabelBox[]): Map<string, number> => {
      const fills = trace.splice(0).filter((call) => (call as unknown[])[0] === "fillText") as unknown[][];
      expect(fills).toHaveLength(report.length);
      return new Map(report.map((label, index) => [label.nodeId, JSON.parse(fills[index].at(-1) as string).globalAlpha as number]));
    };
    const first: LibraryGraphLabelBox[] = [];
    drawLibraryGraph(ctx, { ...frame, positions: live, labelReport: first });
    let ink = inks(first);
    const start = new Set(ink.keys());
    let mostOneName = 0;
    let mostFrame = 0;
    for (let step = 1; step <= 40; step += 1) {
      zoomInto(frame, base, live, 1 - step * 0.012, 0);
      const report: LibraryGraphLabelBox[] = [];
      drawLibraryGraph(ctx, { ...frame, positions: live, moving: true, labelReport: report });
      const now = inks(report);
      let change = 0;
      for (const id of start) {
        const delta = (now.get(id) ?? 0) - (ink.get(id) ?? 0);
        expect(delta, `${id} gained ink mid-motion`).toBeLessThanOrEqual(1e-9);
        mostOneName = Math.max(mostOneName, -delta);
        change -= delta;
      }
      for (const id of now.keys()) expect(start.has(id), `${id} appeared mid-motion`).toBe(true);
      mostFrame = Math.max(mostFrame, change);
      ink = now;
    }
    console.log(`[standing-names] zoom out over 40 frames: ${start.size} names, ${ink.size} left; a name loses at most ${mostOneName} of its ink a frame, all names together ${mostFrame.toFixed(2)}`);
    expect(ink.size).toBeLessThan(start.size);
    expect(mostOneName).toBeLessThanOrEqual(1 / 8 + 1e-9);
    // A column packed one gap apart crowds a third of its names at once: 4.13 names of ink a frame measured.
    expect(mostFrame).toBeLessThanOrEqual(5);
  });
});
