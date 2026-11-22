import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  TREE_ARC_BUDGET,
  TREE_TONE_STEPS,
  type TreeDrawList,
  type TreeFocus,
  type TreeFrameInput,
  type TreeLayout,
  type TreeModel,
  type TreeNodeKind,
  type TreeProjector,
} from "../model/tree-view/tree-shapes";
import { readTreeTokens, type TreeTokens } from "../tokens/read-tree-tokens";
import { treeScreenGrowth } from "../model/tree-view/tree-detail";
import { paintTreeFrame } from "./tree-paint";

interface Point { x: number; y: number }
interface Paint {
  op: "fill" | "stroke" | "fillRect";
  style: unknown;
  points: Point[];
  /** The path's polygons, split at each moveTo. */
  subpaths: Point[][];
  arcs: { x: number; y: number; r: number; anticlockwise: boolean }[];
  curves: number;
}

function recorder() {
  const paints: Paint[] = [];
  const sets: { key: string; value: unknown }[] = [];
  let gradients = 0;
  let points: Point[] = [];
  let subpaths: Point[][] = [];
  let arcs: Paint["arcs"] = [];
  let curves = 0;
  const props: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: "source-over", fillStyle: "", strokeStyle: "" };
  const stack: Record<string, unknown>[] = [];
  const gradient = { addColorStop: () => {} };
  const reset = () => {
    points = [];
    subpaths = [];
    arcs = [];
    curves = 0;
  };
  const methods: Record<string, (...a: number[]) => unknown> = {
    beginPath: reset,
    moveTo: (x, y) => {
      points.push({ x: x!, y: y! });
      subpaths.push([{ x: x!, y: y! }]);
    },
    lineTo: (x, y) => {
      points.push({ x: x!, y: y! });
      subpaths.at(-1)?.push({ x: x!, y: y! });
    },
    quadraticCurveTo: (_cx, _cy, x, y) => {
      curves += 1;
      points.push({ x: x!, y: y! });
    },
    arc: (x, y, r, _from, _to, anticlockwise) => arcs.push({ x: x!, y: y!, r: r!, anticlockwise: Boolean(anticlockwise) }),
    fill: () => paints.push({ op: "fill", style: props.fillStyle, points, subpaths, arcs, curves }),
    stroke: () => paints.push({ op: "stroke", style: props.strokeStyle, points, subpaths, arcs, curves }),
    fillRect: () => paints.push({ op: "fillRect", style: props.fillStyle, points: [], subpaths: [], arcs: [], curves: 0 }),
    createRadialGradient: () => {
      gradients += 1;
      return gradient;
    },
    save: () => stack.push({ ...props }),
    restore: () => Object.assign(props, stack.pop()),
  };
  const ctx = new Proxy(props, {
    get: (t, key: string) => (key in methods ? methods[key] : key in t ? t[key] : () => undefined),
    set: (t, key: string, value) => {
      sets.push({ key, value });
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, sets, props, gradients: () => gradients };
}

const BORROWED_INKS: Record<string, string> = {
  "--map-graph-project": "#9aa2ff",
  "--map-graph-disc-fill": "#0b0c12",
  "--map-graph-name": "#c9cdd8",
  "--map-graph-name-strong": "#f4f5f9",
  "--map-graph-halo": "#07080c",
  "--map-graph-arc": "#cfd3ff",
  "--map-graph-reach": "#eeaa86",
  "--color-status-warning": "#f4b731",
  "--map-canvas-bg-near": "#0a0a0d",
};

let T: TreeTokens;
beforeAll(() => {
  const css = readFileSync(path.join(process.cwd(), "app/styles/map-tree-tokens.css"), "utf8");
  const values: Record<string, string> = { ...BORROWED_INKS };
  for (const m of css.matchAll(/(--map-tree-[\w-]+):\s*([^;]+);/g)) values[m[1]!] = m[2]!.trim();
  const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (name: string) => values[name] ?? "",
  } as CSSStyleDeclaration);
  T = readTreeTokens();
  spy.mockRestore();
});

/** World y is up; the projector flips it and puts the trunk base at (400, 600). */
/** A projector at a uniform zoom: positions and scale both grow by `zoom`. */
function projectorAt(zoom: number): TreeProjector {
  return {
    project(x, y, z, out) {
      out.x = 400 + x * zoom;
      out.y = 600 - y * zoom;
      out.scale = zoom;
      out.depth = 100 + z;
    },
    unit: 1,
    near: 0,
    far: 200,
  };
}
const projector = projectorAt(1);

interface Spec { kind: TreeNodeKind; parent: number; x: number; y: number }
const WIDTH: Record<TreeNodeKind, [number, number]> = { project: [12, 8], domain: [6, 4], fork: [4, 3], capability: [3, 2], element: [1, 1] };

/** Specs in preorder; reach is height over the tallest node, controls split the straight line in thirds. */
function layoutOf(specs: readonly Spec[]): TreeLayout {
  const count = specs.length;
  const subtreeEnd = new Int32Array(count).map((_, i) => i + 1);
  for (let i = count - 1; i > 0; i -= 1) subtreeEnd[specs[i]!.parent] = Math.max(subtreeEnd[specs[i]!.parent]!, subtreeEnd[i]!);
  const top = Math.max(...specs.map((s) => s.y));
  const position = new Float32Array(count * 3);
  const control = new Float32Array(count * 6);
  const bound = new Float32Array(count * 4);
  specs.forEach((s, i) => {
    const from = s.parent < 0 ? { x: 0, y: 0 } : specs[s.parent]!;
    position.set([s.x, s.y, 0], i * 3);
    control.set([from.x + (s.x - from.x) / 3, from.y + (s.y - from.y) / 3, 0, from.x + (2 * (s.x - from.x)) / 3, from.y + (2 * (s.y - from.y)) / 3, 0], i * 6);
    bound.set([s.x, s.y, 0, 80], i * 4);
  });
  const ids = specs.map((s, i) => (s.kind === "fork" ? null : `n${i}`));
  const model: TreeModel = {
    count,
    ids,
    labels: specs.map((_, i) => `Concept ${i}`),
    kinds: specs.map((s) => s.kind),
    parent: Int32Array.from(specs.map((s) => s.parent)),
    subtreeEnd,
    concepts: new Int32Array(count),
    capabilities: new Int32Array(count),
    elements: new Int32Array(count),
    indexOf: new Map(ids.flatMap((id, i) => (id ? [[id, i] as const] : []))),
    needsStart: new Int32Array(count + 1),
    needs: new Int32Array(0),
    usedByStart: new Int32Array(count + 1),
    usedBy: new Int32Array(0),
    looseRoot: -1,
  };
  return {
    model,
    position,
    control,
    widthStart: Float32Array.from(specs.map((s) => WIDTH[s.kind][0])),
    widthEnd: Float32Array.from(specs.map((s) => WIDTH[s.kind][1])),
    bound,
    childPitch: new Float32Array(count),
    reach: Float32Array.from(specs.map((s) => s.y / top)),
    centre: [0, top / 2, 0],
    radius: top,
  };
}

/** 0 trunk; domain 1 holds capabilities 2 (elements 3, 4) and 5 (element 6); domain 7 holds capability 8 (element 9). */
const SMALL: readonly Spec[] = [
  { kind: "project", parent: -1, x: 0, y: 100 },
  { kind: "domain", parent: 0, x: -120, y: 200 },
  { kind: "capability", parent: 1, x: -180, y: 300 },
  { kind: "element", parent: 2, x: -210, y: 340 },
  { kind: "element", parent: 2, x: -150, y: 340 },
  { kind: "capability", parent: 1, x: -60, y: 300 },
  { kind: "element", parent: 5, x: -60, y: 340 },
  { kind: "domain", parent: 0, x: 120, y: 200 },
  { kind: "capability", parent: 7, x: 140, y: 300 },
  { kind: "element", parent: 8, x: 140, y: 340 },
];

function drawListOf(layout: TreeLayout, nodes: readonly number[], closed: readonly number[] = [], view = projector): TreeDrawList {
  const radius: Record<TreeNodeKind, number> = { ...T.marks, fork: T.marks.bud };
  const marks = nodes.map((node) => {
    const p = { x: 0, y: 0, scale: 0, depth: 0 };
    const P = layout.position;
    if (node === 0) view.project(0, 0, 0, p);
    else view.project(P[node * 3]!, P[node * 3 + 1]!, P[node * 3 + 2]!, p);
    return { node, x: p.x, y: p.y, radius: radius[layout.model.kinds[node]!] * treeScreenGrowth(p.scale), scale: p.scale, depth: p.depth, tone: TREE_TONE_STEPS - 1, closed: closed.includes(node) };
  });
  return { marks, count: marks.length, visited: marks.length, folded: 0 };
}

function frameOf(layout: TreeLayout, list: TreeDrawList, extra: Partial<TreeFrameInput> = {}): TreeFrameInput {
  return {
    width: 800, height: 700, dpr: 2, layout, list, projector,
    names: { boxes: [], count: 0, dropped: 0, tested: 0 },
    stale: null, focus: null, growth: 1,
    ...extra,
  };
}

function focusOn(node: number, needs: number[], usedBy: number[]): TreeFocus {
  return { node, selected: false, needs, usedBy, path: [] };
}

const ALL = SMALL.map((_, i) => i);
const markAt = (list: TreeDrawList, node: number) => list.marks.find((m) => m.node === node)!;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const isAmber = (style: unknown) => T.tones.stale.includes(style as string) || style === T.inks.warning;
const amberDiscs = (paints: Paint[]) => paints.filter((p) => p.op === "fill" && isAmber(p.style)).flatMap((p) => p.arcs);
const strokesIn = (paints: Paint[], ink: string) => paints.filter((p) => p.op === "stroke" && p.style === ink && p.curves > 0);

/** Signed crossings of a rightward ray, the count Canvas's nonzero rule sums over subpaths. */
function winding(p: Point, polygon: readonly Point[]): number {
  let w = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y && b.y > p.y && side > 0) w += 1;
    else if (a.y > p.y && b.y <= p.y && side < 0) w -= 1;
  }
  return w;
}

/** Inside a fill by the nonzero rule: ribbons and cap discs sum their windings. */
function filledAt(p: Point, paint: Paint): boolean {
  let w = 0;
  for (const s of paint.subpaths) if (s.length > 2) w += winding(p, s);
  for (const d of paint.arcs) if (distance(p, d) < d.r) w += d.anticlockwise ? -1 : 1;
  return w !== 0;
}

describe("paintTreeFrame", () => {
  it("draws nothing amber when evidence was not measured", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, [0, 1, 2, 5, 6, 7, 8], [2, 8]);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { focus: focusOn(5, [8], [2]) }), T);
    expect(r.paints.length).toBeGreaterThan(0);
    expect(r.paints.filter((p) => isAmber(p.style))).toEqual([]);
  });

  it("draws a stale element in the warning ink and puts the amber dot on a stale capability", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, ALL);
    const stale = new Uint8Array(layout.model.count);
    stale[3] = 1;
    stale[5] = 1;
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { stale }), T);
    const amber = amberDiscs(r.paints);
    const leaf = markAt(list, 3);
    const capability = markAt(list, 5);
    expect(amber).toContainEqual(expect.objectContaining({ x: leaf.x, y: leaf.y, r: leaf.radius }));
    expect(amber.some((d) => Math.abs(distance(d, capability) - capability.radius) < 1e-6 && d.r < capability.radius)).toBe(true);
    expect(amber.some((d) => distance(d, capability) < 1e-6)).toBe(false);
    expect(amber).toHaveLength(2);
  });

  it("puts the amber dot on a closed mark only when a concept inside it is stale", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, [0, 1, 2, 5, 7, 8], [2, 5, 8]);
    const stale = new Uint8Array(layout.model.count);
    stale[4] = 1;
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { stale }), T);
    const amber = amberDiscs(r.paints);
    expect(amber).toHaveLength(1);
    const holder = markAt(list, 2);
    expect(distance(amber[0]!, holder)).toBeCloseTo(holder.radius, 6);
  });

  it("stops each branch at the edge of the marks at both of its ends", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, ALL);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list), T);
    const wood = new Set([...T.tones.branch, ...T.tones.branchCore]);
    const ribbonPoints = r.paints.filter((p) => p.op === "fill" && wood.has(p.style as string)).flatMap((p) => p.points);
    expect(ribbonPoints.length).toBeGreaterThan(0);
    for (const mark of list.marks) {
      const nearest = Math.min(...ribbonPoints.map((p) => distance(p, mark)));
      expect(nearest).toBeGreaterThanOrEqual(mark.radius);
      expect(nearest).toBeLessThan(mark.radius * 3 + 8);
    }
  });

  it("draws a domain under an open fork with an unbroken run of branch from the trunk base to its mark", () => {
    const specs: Spec[] = [
      { kind: "project", parent: -1, x: 0, y: 100 },
      { kind: "fork", parent: 0, x: 0, y: 170 },
      { kind: "domain", parent: 1, x: -90, y: 260 },
      { kind: "domain", parent: 1, x: 90, y: 260 },
    ];
    const layout = layoutOf(specs);
    const list = drawListOf(layout, [0, 2, 3]);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list), T);
    const wood = r.paints.filter((p) => p.op === "fill" && T.tones.branch.includes(p.style as string));
    const covered = (p: Point) => wood.some((fill) => filledAt(p, fill));
    const base = markAt(list, 0);
    const hub = markAt(list, 2);
    const corners = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 170 }, { x: -90, y: 260 }].map((w) => ({ x: 400 + w.x, y: 600 - w.y }));
    let tested = 0;
    for (let leg = 0; leg + 1 < corners.length; leg += 1) {
      const a = corners[leg]!;
      const b = corners[leg + 1]!;
      for (let step = 0; step <= 100; step += 1) {
        const p = { x: a.x + ((b.x - a.x) * step) / 100, y: a.y + ((b.y - a.y) * step) / 100 };
        if (distance(p, base) < base.radius * 2 || distance(p, hub) < hub.radius * 2) continue;
        tested += 1;
        expect(covered(p), `uncovered at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`).toBe(true);
      }
    }
    expect(tested).toBeGreaterThan(200);
  });

  it("redraws the focus path in its rest body and gives only its core the strong ink", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, ALL);
    const rest = recorder();
    paintTreeFrame(rest.ctx, frameOf(layout, list), T);
    const focused = recorder();
    paintTreeFrame(focused.ctx, frameOf(layout, list, { focus: focusOn(2, [], []) }), T);
    const ribbons = (paints: Paint[], inks: readonly string[]) =>
      paints.filter((p) => p.op === "fill" && inks.includes(p.style as string)).flatMap((p) => p.subpaths.filter((g) => g.length > 2));
    const veil = focused.paints.findLastIndex((p) => p.op === "fillRect" && p.style === T.inks.ground);
    const after = focused.paints.slice(veil + 1);
    const pathBodies = ribbons(after, T.tones.branch);
    const pathCores = ribbons(after, [T.inks.nameStrong]);
    expect(pathBodies.length).toBeGreaterThanOrEqual(3);
    expect(pathCores).toHaveLength(pathBodies.length);
    for (const body of pathBodies) expect(ribbons(rest.paints, T.tones.branch)).toContainEqual(body);
    for (const core of pathCores) expect(ribbons(rest.paints, T.tones.branchCore)).toContainEqual(core);
  });

  it("widens a branch with the square-root growth of scale, twice as wide at scale 4", () => {
    const layout = layoutOf([{ kind: "project", parent: -1, x: 0, y: 100 }]);
    const widthAtTop = (zoom: number) => {
      const view = projectorAt(zoom);
      const r = recorder();
      paintTreeFrame(r.ctx, frameOf(layout, drawListOf(layout, [0], [], view), { projector: view }), T);
      const body = r.paints.find((p) => p.op === "fill" && T.tones.branch.includes(p.style as string))!;
      const ribbon = body.subpaths.find((g) => g.length > 2)!;
      const n = ribbon.length / 2;
      return distance(ribbon[n - 1]!, ribbon[n]!);
    };
    expect(widthAtTop(4) / widthAtTop(1)).toBeCloseTo(2, 6);
  });

  it("lays no gradient over the ground at zoom 4", () => {
    const view = projectorAt(4);
    const layout = layoutOf(SMALL);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, drawListOf(layout, ALL, [], view), { projector: view }), T);
    expect(r.gradients()).toBe(0);
    expect(r.paints.filter((p) => typeof p.style !== "string")).toEqual([]);
  });

  it("draws no dependency arc without a focus", () => {
    const layout = layoutOf(SMALL);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, drawListOf(layout, ALL)), T);
    expect(r.paints.filter((p) => p.curves > 0)).toEqual([]);
  });

  it("draws arcs to what the focus depends on in the arc ink and from what depends on it in the reach ink", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, ALL);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { focus: focusOn(2, [8], [5]) }), T);
    const [needs] = strokesIn(r.paints, T.inks.arc);
    const [usedBy] = strokesIn(r.paints, T.inks.reach);
    const focus = markAt(list, 2);
    const near = (p: Point, node: number) => distance(p, markAt(list, node)) < markAt(list, node).radius * 3 + 6;
    expect(needs?.curves).toBe(1);
    expect(near(needs!.points[0]!, 2) && near(needs!.points[1]!, 8)).toBe(true);
    expect(usedBy?.curves).toBe(1);
    expect(near(usedBy!.points[0]!, 5) && near(usedBy!.points[1]!, 2)).toBe(true);
    expect(distance(needs!.points[0]!, focus)).toBeGreaterThan(focus.radius);
  });

  it("ends an arc to a folded concept at the closed mark that holds it", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, [0, 1, 2, 3, 4, 5, 6, 7, 8], [8]);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { focus: focusOn(2, [9], []) }), T);
    const [needs] = strokesIn(r.paints, T.inks.arc);
    const holder = markAt(list, 8);
    expect(needs?.curves).toBe(1);
    expect(distance(needs!.points[1]!, holder)).toBeLessThan(holder.radius * 3 + 6);
  });

  it("draws no arc past the arc budget", () => {
    const leaves = 80;
    const specs: Spec[] = [
      { kind: "project", parent: -1, x: 0, y: 100 },
      { kind: "domain", parent: 0, x: 0, y: 200 },
      { kind: "capability", parent: 1, x: 0, y: 300 },
      ...Array.from({ length: leaves }, (_, i): Spec => ({ kind: "element", parent: 2, x: (i - leaves / 2) * 12, y: 360 + (i % 3) * 20 })),
    ];
    const layout = layoutOf(specs);
    const list = drawListOf(layout, specs.map((_, i) => i));
    const needs = Array.from({ length: leaves / 2 }, (_, i) => 3 + i);
    const usedBy = Array.from({ length: leaves / 2 }, (_, i) => 3 + leaves / 2 + i);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { focus: focusOn(2, needs, usedBy) }), T);
    const drawn = [...strokesIn(r.paints, T.inks.arc), ...strokesIn(r.paints, T.inks.reach)].reduce((n, p) => n + p.curves, 0);
    expect(drawn).toBe(TREE_ARC_BUDGET);
  });

  it("draws no mark beyond half the reach at growth 0.5 and grows the branch toward it partway", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, ALL);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { growth: 0.5 }), T);
    const discs = r.paints.filter((p) => p.op === "fill").flatMap((p) => p.arcs);
    const beyond = list.marks.filter((m) => m.node !== 0 && layout.reach[m.node]! > 0.5);
    expect(beyond.length).toBeGreaterThan(0);
    for (const mark of beyond) expect(discs.filter((d) => distance(d, mark) < 1e-6)).toEqual([]);
    const wood = new Set([...T.tones.branch]);
    const highest = Math.min(...r.paints.filter((p) => wood.has(p.style as string)).flatMap((p) => p.points.map((q) => q.y)));
    expect(highest).toBeLessThan(600 - 100);
    expect(highest).toBeGreaterThan(600 - 0.5 * 340 - 8);
  });

  it("sets no filter and never leaves source-over compositing", () => {
    const layout = layoutOf(SMALL);
    const list = drawListOf(layout, [0, 1, 2, 5, 7, 8], [5, 8]);
    const stale = new Uint8Array(layout.model.count);
    stale[6] = 1;
    stale[2] = 1;
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, list, { stale, focus: focusOn(2, [9], [6]), growth: 0.9 }), T);
    expect(r.sets.filter((s) => s.key === "filter")).toEqual([]);
    expect(r.sets.filter((s) => s.key === "globalCompositeOperation" && s.value !== "source-over")).toEqual([]);
    expect(r.props.globalCompositeOperation).toBe("source-over");
  });

  it("creates at most 2 + 12 radial gradients however many domains are drawn", () => {
    const domains = 20;
    const specs: Spec[] = [{ kind: "project", parent: -1, x: 0, y: 100 }];
    for (let i = 0; i < domains; i += 1) {
      specs.push({ kind: "domain", parent: 0, x: (i - domains / 2) * 30, y: 200 });
      specs.push({ kind: "capability", parent: specs.length - 1, x: (i - domains / 2) * 30, y: 260 });
    }
    const layout = layoutOf(specs);
    const r = recorder();
    paintTreeFrame(r.ctx, frameOf(layout, drawListOf(layout, specs.map((_, i) => i))), T);
    expect(r.gradients()).toBe(2 + 12);
  });
});
