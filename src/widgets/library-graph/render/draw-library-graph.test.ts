import { describe, expect, it, vi } from "vitest";

import type { LibraryGraphEdge, LibraryGraphNode } from "../model/build-library-graph";
import { drawLibraryGraph, hitTestLibraryGraph, NODE_RADIUS } from "./draw-library-graph";
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
}

function recorder(): Recorder {
  const strokes: string[] = [];
  const fills: string[] = [];
  const dashes: unknown[][] = [];
  const rects: Array<[number, number, number, number]> = [];
  const arcs: Array<{ x: number; y: number; r: number; style: string }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 0 };
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
      for (const arc of pending) arcs.push({ ...arc, style: state.fillStyle });
    }),
    stroke: vi.fn(() => {
      strokes.push(state.strokeStyle);
      for (const arc of pending) arcs.push({ ...arc, style: state.strokeStyle });
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push([x, y, w, h]);
      fills.push(state.fillStyle);
    }),
    strokeRect: vi.fn(() => strokes.push(state.strokeStyle)),
    setLineDash: vi.fn((pattern: unknown[]) => dashes.push(pattern)),
    measureText: vi.fn(() => ({ width: 40 })),
    fillText: vi.fn((text: string, x: number, y: number) => texts.push({ text, x, y })),
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
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    lineCap: "butt",
    textBaseline: "alphabetic",
    font: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, fills, dashes, rects, arcs, texts };
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
    ...overrides,
  } satisfies Parameters<typeof drawLibraryGraph>[1];
}

describe("drawing the library graph", () => {
  it("gives each kind its own shape, so the picture survives without colour", () => {
    const rec = recorder();
    drawLibraryGraph(rec.ctx, frame());
    // The first rectangle is the opaque ground; the source is the one square after it.
    expect(rec.rects[0]).toEqual([0, 0, 600, 320]);
    expect(rec.rects.slice(1)).toEqual([
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
    // A broken edge is two segments: two moveTo/lineTo pairs instead of one.
    const moves = (rec.ctx.moveTo as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(moves).toBe(3);
  });

  it("draws a source nobody has written up as a hollow square, not as a missing line", () => {
    const rec = recorder();
    const notCompiled = { ...nodes[1], state: "not-compiled" as const };
    drawLibraryGraph(rec.ctx, frame({ nodes: [nodes[0], notCompiled], edges: [] }));
    expect(rec.rects).toHaveLength(1); // the ground only: the square is stroked, not filled
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
