// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import { drawLibraryGraph, type LibraryGraphFrame, type LibraryGraphLabelBox } from "./draw-library-graph";
import { BoxGrid } from "./library-box-grid";
import type { LibraryGraphInk } from "./library-graph-ink";
import { LibraryLabelOccupancy } from "./library-label-occupancy";

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
    ["opened island columns at fit", () => columns(1950, 0.31, 6), "b972f23ec492c5ad", 0],
    ["opened island columns zoomed in", () => columns(1950, 7.5, -4000), "a84562d74d7ecf4b", 75],
    ["a force cloud past every edge", () => cloud(3000, 7), "cd895b0831403ac1", 44],
    ["the islands overview", () => overview(3000, 11), "aa0088b6e6986807", 51],
    ["a small folder with leaders", () => cloud(90, 3), "b172955545775fac", 63],
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
    ["at fit off the pixel grid", (pages: number) => columns(pages, 615 / pages, 7.85, 1.85, 2.5)],
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
