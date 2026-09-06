import { describe, expect, it, vi } from "vitest";

import type { LibraryGraphEdge, LibraryGraphNode } from "../model/build-library-graph";
import {
  DIMMED_INK,
  drawLibraryGraph,
  edgeControlPoint,
  hitTestLibraryGraph,
  NODE_RADIUS,
} from "./draw-library-graph";
import type { LibraryGraphInk } from "./library-graph-ink";

const INK: LibraryGraphInk = {
  ground: "ground",
  page: "page-ink",
  source: "source-ink",
  concept: "concept-ink",
  edge: "edge-ink",
  hoverRing: "hover-ring",
  selected: "selected-ink",
  selectedRing: "ring-ink",
  labelSurface: "label-surface",
  labelBorder: "label-border",
  labelInk: "label-ink",
  fontFamily: "Test",
};

interface Recorder {
  ctx: CanvasRenderingContext2D;
  strokes: string[];
  fills: string[];
  dashes: unknown[][];
  rects: Array<[number, number, number, number]>;
  arcs: Array<{ x: number; y: number; r: number; style: string }>;
  texts: Array<{ text: string; x: number; y: number }>;
  /**
   * The alpha each ink was actually painted at. The dim is a `globalAlpha`, not a second
   * colour token, so a recorder that only kept style strings could not see it at all.
   */
  alphaAt: Array<{ style: string; alpha: number }>;
  /** Standing names stroked in the ground before they are filled. */
  outlined: Array<{ text: string; style: string; width: number }>;
}

function recorder(): Recorder {
  const strokes: string[] = [];
  const fills: string[] = [];
  const dashes: unknown[][] = [];
  const rects: Array<[number, number, number, number]> = [];
  const arcs: Array<{ x: number; y: number; r: number; style: string }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const alphaAt: Array<{ style: string; alpha: number }> = [];
  const outlined: Array<{ text: string; style: string; width: number }> = [];
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 0, globalAlpha: 1 };
  const pending: Array<{ x: number; y: number; r: number }> = [];
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => pending.splice(0, pending.length)),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn((x: number, y: number, r: number) => pending.push({ x, y, r })),
    fill: vi.fn(() => {
      fills.push(state.fillStyle);
      alphaAt.push({ style: state.fillStyle, alpha: state.globalAlpha });
      for (const arc of pending) arcs.push({ ...arc, style: state.fillStyle });
    }),
    stroke: vi.fn(() => {
      strokes.push(state.strokeStyle);
      alphaAt.push({ style: state.strokeStyle, alpha: state.globalAlpha });
      for (const arc of pending) arcs.push({ ...arc, style: state.strokeStyle });
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push([x, y, w, h]);
      fills.push(state.fillStyle);
      alphaAt.push({ style: state.fillStyle, alpha: state.globalAlpha });
    }),
    strokeRect: vi.fn(() => {
      strokes.push(state.strokeStyle);
      alphaAt.push({ style: state.strokeStyle, alpha: state.globalAlpha });
    }),
    setLineDash: vi.fn((pattern: unknown[]) => dashes.push(pattern)),
    measureText: vi.fn(() => ({ width: 40 })),
    fillText: vi.fn((text: string, x: number, y: number) => texts.push({ text, x, y })),
    strokeText: vi.fn((text: string) => outlined.push({ text, style: state.strokeStyle, width: state.lineWidth })),
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    lineCap: "butt",
    lineJoin: "round",
    textBaseline: "alphabetic",
    font: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, fills, dashes, rects, arcs, texts, alphaAt, outlined };
}

const nodes: LibraryGraphNode[] = [
  { id: "page:wiki/plan", kind: "page", label: "Quarter plan", ref: "wiki/plan", href: null },
  { id: "source:sources/plan.pdf", kind: "source", label: "plan.pdf", ref: "sources/plan.pdf", href: null },
  { id: "concept:domains/checkout", kind: "concept", label: "Checkout", ref: "domains/checkout", href: "/topology/?p=x" },
];
const edges: LibraryGraphEdge[] = [
  {
    id: "c",
    source: "page:wiki/plan",
    target: "source:sources/plan.pdf",
    relation: "cites",
    certainty: "current",
  },
  {
    id: "m",
    source: "page:wiki/plan",
    target: "concept:domains/checkout",
    relation: "mentions",
    certainty: "current",
  },
];
const positions = new Map([
  ["page:wiki/plan", { x: 100, y: 100 }],
  ["source:sources/plan.pdf", { x: 200, y: 100 }],
  ["concept:domains/checkout", { x: 100, y: 200 }],
]);

function frame(overrides: Partial<Parameters<typeof drawLibraryGraph>[1]> = {}) {
  return {
    nodes,
    edges,
    positions,
    width: 600,
    height: 320,
    ink: INK,
    selectedId: null,
    hoveredId: null,
    focusedId: null,
    activeLabel: null,
    // The default frame is the hover policy, so every case written before standing names
    // existed still measures what it was written to measure.
    standingLabels: false,
    ...overrides,
  } satisfies Parameters<typeof drawLibraryGraph>[1];
}

describe("drawing the library graph", () => {
  it("gives each kind its own shape, so the picture survives without colour", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame());
    // The first rectangle is the opaque ground. The source then draws twice: its ground
    // halo, then the mark inside it.
    expect(rec.rects[0]).toEqual([0, 0, 600, 320]);
    const halo = NODE_RADIUS.source + 1.5;
    expect(rec.rects.slice(1)).toEqual([
      [200 - halo, 100 - halo, halo * 2, halo * 2],
      [200 - NODE_RADIUS.source, 100 - NODE_RADIUS.source, NODE_RADIUS.source * 2, NODE_RADIUS.source * 2],
    ]);
    // A page is filled, a concept is a ring: the concept's arc is stroked, never filled.
    expect(rec.arcs.filter((arc) => arc.style === "page-ink")).toHaveLength(1);
    expect(rec.fills).not.toContain("concept-ink");
    expect(rec.strokes).toContain("concept-ink");
  });

  it("says the relation with the dash and nothing else — both edges take one ink", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame());
    expect(rec.dashes.slice(0, 2)).toEqual([[], [2.5, 3.5]]);
    expect(rec.strokes.filter((style) => style === "edge-ink")).toHaveLength(2);
  });

  it("breaks a citation the folder can no longer vouch for, and only that one", () => {
    const rec = recorder();
    const unverified = { ...edges[0], certainty: "unverified" as const };
    drawLibraryGraph(rec.ctx, frame({ edges: [unverified, edges[1]] }));
    // A broken edge is two arcs: two moveTo/quadraticCurveTo pairs instead of one.
    const moves = (rec.ctx.moveTo as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(moves).toBe(3);
  });

  it("draws a source nobody has written up as a hollow square, not as a missing line", () => {
    const rec = recorder();
    const notCompiled = { ...nodes[1], state: "not-compiled" as const };
    drawLibraryGraph(rec.ctx, frame({ nodes: [nodes[0], notCompiled], edges: [] }));
    // The ground and the mark's own halo: the square itself is stroked, never filled.
    expect(rec.rects).toHaveLength(2);
    expect(rec.fills.filter((style) => style === "source-ink")).toHaveLength(0);
    expect(rec.strokes).toContain("source-ink");
  });

  it("raises the links of whatever is pointed at, because that is the question being asked", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ hoveredId: "page:wiki/plan", activeLabel: "Quarter plan" }));
    expect(rec.strokes.filter((style) => style === "source-ink").length).toBeGreaterThanOrEqual(2);
  });

  it("spends indigo only on the selection: its node, its ring, and the edges that touch it", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ selectedId: "page:wiki/plan" }));
    expect(rec.strokes.filter((style) => style === "selected-ink")).toHaveLength(2);
    expect(rec.fills).toContain("selected-ink");
    expect(rec.strokes).toContain("ring-ink");
    expect(rec.fills).not.toContain("page-ink");
  });

  it("keeps hover neutral — pointing at something is not choosing it", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ hoveredId: "page:wiki/plan", activeLabel: "Quarter plan" }));
    expect(rec.strokes).not.toContain("selected-ink");
    expect(rec.strokes).toContain("hover-ring");
  });

  it("draws focus as its own ring, so a wandering pointer cannot hide where the keyboard is", () => {
    const rec = recorder();
    drawLibraryGraph(
      rec.ctx,
      frame({ focusedId: "page:wiki/plan", hoveredId: "source:sources/plan.pdf", activeLabel: "plan.pdf" }),
    );
    // Both marks are drawn: the neutral hover ring and, on the other node, the focus ring.
    expect(rec.strokes).toContain("hover-ring");
    expect(rec.strokes).toContain("ring-ink");
    // The label follows the pointer while focus keeps its own ring.
    expect(rec.texts[0].text).toBe("plan.pdf");
  });

  it("draws one label, beside the node being pointed at", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ hoveredId: "page:wiki/plan", activeLabel: "Quarter plan" }));
    expect(rec.texts).toEqual([{ text: "Quarter plan", x: expect.any(Number), y: expect.any(Number) }]);
    expect(rec.texts[0].x).toBeGreaterThan(100);
  });

  it("flips the label inside the canvas rather than letting a name run off the edge", () => {
    const rec = recorder();
    drawLibraryGraph(
      rec.ctx,
      frame({
        positions: new Map([["page:wiki/plan", { x: 595, y: 100 }]]),
        nodes: [nodes[0]],
        edges: [],
        hoveredId: "page:wiki/plan",
        activeLabel: "Quarter plan",
      }),
    );
    expect(rec.texts[0].x).toBeLessThan(595);
  });

  /**
   * **The bow is what separates two lines of the same length between the same places.**
   * A straight line has no way of saying it is one of several; a curve whose depth grows
   * with its own length does, and the control point never leaves the corridor between the
   * two marks it joins.
   */
  it("bows an edge to one side, deeper the longer it is", () => {
    const short = edgeControlPoint({ x: 0, y: 0 }, { x: 40, y: 0 });
    const long = edgeControlPoint({ x: 0, y: 0 }, { x: 400, y: 0 });
    // Both bow to the same side, so the picture has one hand rather than a scatter.
    expect(short.y).toBeGreaterThan(0);
    expect(long.y).toBeGreaterThan(short.y);
    // And the bow is capped, so a very long edge does not become an arc across the canvas.
    expect(long.y).toBeLessThanOrEqual(17);
    // The control point stays on the midpoint's own perpendicular: the curve leans, it
    // does not travel toward a third place.
    expect(short.x).toBeCloseTo(20, 6);
  });

  it("does not bow an edge whose ends are the same point", () => {
    expect(edgeControlPoint({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  /**
   * The dim is the whole answer to a folder position cannot separate, so it has a case of
   * its own: at full dim everything outside the neighbourhood is drawn at `DIMMED_INK` and
   * everything inside it is untouched.
   */
  it("dims everything outside the pointed-at neighbourhood and nothing inside it", () => {
    const rec = recorder();
    drawLibraryGraph(
      rec.ctx,
      frame({
        hoveredId: "page:wiki/plan",
        activeLabel: "Quarter plan",
        dim: 1,
        focus: new Set(["page:wiki/plan", "source:sources/plan.pdf"]),
      }),
    );
    // The concept is the one node outside the neighbourhood; its ring is drawn dimmed.
    const concept = rec.alphaAt.find((entry) => entry.style === "concept-ink");
    expect(concept?.alpha).toBeCloseTo(DIMMED_INK, 6);
    const page = rec.alphaAt.find((entry) => entry.style === "page-ink");
    expect(page?.alpha).toBe(1);
  });

  it("draws nothing dimmed while nothing is pointed at", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ dim: 0, focus: null }));
    expect(rec.alphaAt.every((entry) => entry.alpha === 1)).toBe(true);
  });

  it("grades a mark by the radius it is handed, hit test included", () => {
    const rec = recorder();
    const radii = new Map([["source:sources/plan.pdf", 10]]);
    drawLibraryGraph(rec.ctx, frame({ radii, nodes: [nodes[1]], edges: [] }));
    expect(rec.rects.slice(1)).toEqual([
      [200 - 11.5, 100 - 11.5, 23, 23],
      [190, 90, 20, 20],
    ]);
    // The pointer reaches the mark it can see, not the one the flat band would have drawn.
    expect(hitTestLibraryGraph({ nodes, positions, radii }, { x: 213, y: 100 })?.kind).toBe("source");
  });

  it("fades an arriving node in without dimming what is already there", () => {
    const rec = recorder();
    drawLibraryGraph(
      rec.ctx,
      frame({ opacity: new Map([["concept:domains/checkout", 0.25]]) }),
    );
    expect(rec.alphaAt.find((entry) => entry.style === "concept-ink")?.alpha).toBeCloseTo(0.25, 6);
    expect(rec.alphaAt.find((entry) => entry.style === "page-ink")?.alpha).toBe(1);
  });

  /**
   * A grey name crossed by a grey line is the one thing on a graph this connected that a
   * person genuinely cannot read, so every standing name is stroked in the ground first.
   */
  it("outlines every standing name in the ground before filling it", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame({ standingLabels: true }));
    expect(rec.outlined.length).toBe(rec.texts.length);
    for (const outline of rec.outlined) {
      expect(outline.style).toBe("ground");
      expect(outline.width).toBe(2);
    }
    expect(rec.outlined.map((entry) => entry.text)).toEqual(rec.texts.map((entry) => entry.text));
  });

  it("paints its own ground: the canvas is opaque", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame());
    expect(rec.fills[0]).toBe("ground");
  });
});

describe("hit testing", () => {
  it("finds the node under the pointer, and nothing when the pointer is on empty canvas", () => {
    expect(hitTestLibraryGraph({ nodes, positions }, { x: 101, y: 102 })?.id).toBe("page:wiki/plan");
    expect(hitTestLibraryGraph({ nodes, positions }, { x: 400, y: 40 })).toBeNull();
  });

  it("reaches 4px past the mark, because a 3.6px square is smaller than a pointer", () => {
    expect(hitTestLibraryGraph({ nodes, positions }, { x: 207, y: 100 })?.kind).toBe("source");
    expect(hitTestLibraryGraph({ nodes, positions }, { x: 210, y: 100 })).toBeNull();
  });

  it("widens the reach for a coarse pointer without widening the mark", () => {
    expect(hitTestLibraryGraph({ nodes, positions }, { x: 215, y: 100 }, 18)?.kind).toBe("source");
  });

  it("prefers the nearest node when two marks overlap", () => {
    const crowded = new Map([
      ["page:wiki/plan", { x: 100, y: 100 }],
      ["source:sources/plan.pdf", { x: 104, y: 100 }],
      ["concept:domains/checkout", { x: 300, y: 300 }],
    ]);
    expect(hitTestLibraryGraph({ nodes, positions: crowded }, { x: 105, y: 100 })?.kind).toBe("source");
  });
});
