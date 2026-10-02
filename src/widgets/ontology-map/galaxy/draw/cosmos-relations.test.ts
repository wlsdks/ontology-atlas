import { describe, expect, it, vi } from "vitest";
import { revealEnd } from "../../expressive/edge-reveal";
import { easeOutCubic } from "../../model/camera-easing";
import type { CosmosLayout } from "../layout/cosmos-layout";
import type { CosmosAttention, CosmosInks, CosmosLens, CosmosRelation, CosmosTrail } from "../cosmos-types";
import { CosmosBitmapCache } from "./cosmos-bitmap-cache";
import { drawCosmosRelations, galaxyLensAlpha, lensAlpha, trailHolds } from "./cosmos-relations";

vi.mock("./cosmos-paint", () => ({ starSprite: () => ({}) }));

const inks = {
  project: "#111111", domain: "#222222", capability: "#333333", element: "#444444", accent: "#555555",
  bgNear: "#000001", bgFar: "#000002", filament: "#666666", filamentHead: "#777777", filamentDim: "#888888",
  labelProject: "#999999", labelDomain: "#aaaaaa", labelCapability: "#bbbbbb", labelElement: "#cccccc", labelMeta: "#dddddd",
  select: "#eeeeee", spotlightRestAlpha: 0.3, pathRestAlpha: 0.18,
} satisfies CosmosInks;

interface Call { op: string; args: number[]; dash: number[]; stroke: string }

function fakeCtx() {
  const calls: Call[] = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "",
    textBaseline: "alphabetic",
    setLineDash: (d: number[]) => { dash = d; },
    beginPath: () => {},
    closePath: () => {},
    moveTo: (...args: number[]) => calls.push({ op: "moveTo", args, dash, stroke: ctx.strokeStyle }),
    lineTo: (...args: number[]) => calls.push({ op: "lineTo", args, dash, stroke: ctx.strokeStyle }),
    quadraticCurveTo: () => {},
    stroke: () => calls.push({ op: "stroke", args: [], dash, stroke: ctx.strokeStyle }),
    fill: () => calls.push({ op: "fill", args: [], dash, stroke: ctx.strokeStyle }),
    arc: (...args: number[]) => calls.push({ op: "arc", args, dash, stroke: ctx.strokeStyle }),
    roundRect: () => {},
    fillText: () => {},
    drawImage: (...args: unknown[]) => calls.push({ op: "drawImage", args: args.slice(1) as number[], dash, stroke: "" }),
    measureText: (t: string) => ({ width: t.length * 6 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const layout = {
  galaxies: [],
  core: { id: null, label: "", radius: 1, starIds: [], starX: new Float32Array(), starY: new Float32Array(), starKind: new Uint8Array(), starMagnitude: new Float32Array() },
  galaxyOf: new Map(),
  points: new Map(),
} as unknown as CosmosLayout;

const camera = { x: 0, y: 0, scale: 1 };
const room = { x: 0, y: 0, width: 1000, height: 800 };

function attention(over: Partial<CosmosAttention> = {}): CosmosAttention {
  return { selectedId: null, hoverId: null, hoverGalaxy: -1, focusGalaxy: -1, revealMs: 1000, ...over };
}

function rel(source: string, target: string, directional = true, id = `${source}>${target}`): CosmosRelation {
  return { id, source, target, relationType: directional ? "depends_on" : "related_to", directional };
}

function run(opts: {
  relations?: CosmosRelation[];
  attention?: CosmosAttention;
  lens?: CosmosLens | null;
  trail?: CosmosTrail | null;
  reducedMotion?: boolean;
  pointOf?: (id: string) => { x: number; y: number } | null;
  record?: (id: string, x: number, y: number, r: number) => void;
}) {
  const relations = opts.relations ?? [];
  const { ctx, calls } = fakeCtx();
  const out = drawCosmosRelations(ctx, {
    layout,
    camera,
    room,
    width: 1000,
    height: 800,
    attention: opts.attention ?? attention(),
    relationsOf: (id) => relations.filter((r) => r.source === id || r.target === id),
    pointOf: opts.pointOf ?? ((id) => ({ x: (id.charCodeAt(id.length - 1) % 20) * 10, y: id.length * 5 })),
    lens: opts.lens ?? null,
    trail: opts.trail ?? null,
    inks,
    reducedMotion: opts.reducedMotion ?? false,
    labelOf: (id) => id,
    record: opts.record ?? null,
    font: "12px sans-serif",
    cache: new CosmosBitmapCache(),
  });
  return { out, calls };
}

const many = (n: number) => Array.from({ length: n }, (_, i) => rel("hub", `n${String(i).padStart(3, "0")}`));

describe("drawCosmosRelations", () => {
  it("caps a selected concept at 80 rows and a hovered one at 24", () => {
    expect(run({ relations: many(81), attention: attention({ selectedId: "hub" }) }).out.rows).toHaveLength(80);
    const hovered = run({ relations: many(25), attention: attention({ hoverId: "hub" }) }).out.rows;
    expect(hovered).toHaveLength(24);
    expect(hovered.every((r) => r.role === "hovered")).toBe(true);
  });

  it("orders directional relations first, then by the other end", () => {
    const relations = [rel("hub", "c", false), rel("hub", "b"), rel("a", "hub", false), rel("hub", "d")];
    const rows = run({ relations, attention: attention({ selectedId: "hub" }) }).out.rows;
    expect(rows.map((r) => `${r.source}>${r.target}`)).toEqual(["hub>b", "hub>d", "a>hub", "hub>c"]);
    expect(rows.every((r) => r.role === "selected")).toBe(true);
  });

  it("draws a directional relation solid with one head and a symmetric one dashed without a head", () => {
    const solid = run({ relations: [rel("hub", "x")], attention: attention({ selectedId: "hub" }) });
    expect(solid.out.rows[0]!.dashed).toBe(false);
    expect(solid.calls.filter((c) => c.op === "stroke" && c.args.length === 0 && c.dash.length === 0).length).toBeGreaterThan(0);
    expect(solid.calls.filter((c) => c.op === "fill")).toHaveLength(1);
    const dashed = run({ relations: [rel("hub", "x", false)], attention: attention({ selectedId: "hub" }) });
    expect(dashed.out.rows[0]!.dashed).toBe(true);
    expect(dashed.calls.some((c) => c.op === "stroke" && c.dash.join() === "4,3")).toBe(true);
    expect(dashed.calls.filter((c) => c.op === "fill")).toHaveLength(0);
  });

  it("reveals over 420 ms with easeOutCubic, and whole under reduced motion", () => {
    const at = (revealMs: number, reducedMotion = false) =>
      run({ relations: [rel("hub", "x")], attention: attention({ selectedId: "hub", revealMs }), reducedMotion }).out.rows[0]!.progress;
    expect(at(0)).toBe(0);
    expect(at(210)).toBeCloseTo(easeOutCubic(0.5), 10);
    expect(at(420)).toBe(1);
    expect(at(0, true)).toBe(1);
  });

  it("grows each line from the end revealEnd names", () => {
    const pointOf = (id: string) => ({ hub: { x: 0, y: 0 }, a: { x: 100, y: 0 } })[id as "hub" | "a"] ?? null;
    const toHub = rel("a", "hub", false);
    const { calls } = run({ relations: [toHub], attention: attention({ selectedId: "hub", revealMs: 210 }), pointOf });
    expect(revealEnd(false, "a", "hub")).toBe("b");
    const move = calls.find((c) => c.op === "moveTo")!;
    expect(move.args).toEqual([500, 400]);
    const line = calls.find((c) => c.op === "lineTo")!;
    expect(line.args[0]).toBeCloseTo(500 + 100 * easeOutCubic(0.5), 6);
  });

  it("recedes non-members to the path or spotlight rest alpha", () => {
    const path: CosmosLens = { kind: "path", memberIds: new Set(["a"]), edgeIds: new Set() };
    const spot: CosmosLens = { kind: "constellation", memberIds: new Set(["a"]), edgeIds: null };
    expect(lensAlpha(path, "a", inks)).toBe(1);
    expect(lensAlpha(path, "b", inks)).toBe(inks.pathRestAlpha);
    expect(lensAlpha(spot, "b", inks)).toBe(inks.spotlightRestAlpha);
    expect(lensAlpha(null, "b", inks)).toBe(1);
    expect(galaxyLensAlpha(path, inks)).toBe(inks.pathRestAlpha);
    expect(galaxyLensAlpha(spot, inks)).toBe(inks.spotlightRestAlpha);
    expect(galaxyLensAlpha(null, inks)).toBe(1);
  });

  it("draws path rows from edgeIds and constellation rows from member-to-member relations capped at 200", () => {
    const relations = [rel("a", "b", true, "e1"), rel("b", "c", true, "e2"), rel("a", "c", true, "e3")];
    const path = run({ relations, lens: { kind: "path", memberIds: new Set(["a", "b", "c"]), edgeIds: new Set(["e1", "e2"]) } }).out;
    expect(path.rows.map((r) => `${r.source}>${r.target}`)).toEqual(["a>b", "b>c"]);
    expect(path.rows.every((r) => r.role === "path" && r.progress === 1)).toBe(true);
    expect(path.lens).toEqual({ kind: "path", lit: 3, restAlpha: inks.pathRestAlpha });

    const ids = Array.from({ length: 30 }, (_, i) => `m${String(i).padStart(2, "0")}`);
    const dense = ids.flatMap((s, i) => ids.slice(i + 1).map((t) => rel(s, t)));
    dense.push(rel("m00", "outside"));
    const group = run({ relations: dense, lens: { kind: "constellation", memberIds: new Set(ids), edgeIds: null } }).out;
    expect(group.rows).toHaveLength(200);
    expect(group.rows.every((r) => r.role === "member" && ids.includes(r.source) && ids.includes(r.target))).toBe(true);
    expect(group.candidates.filter((c) => c.kind === "member" && c.priority === 950)).toHaveLength(30);
  });

  it("with only the trail active, recedes unvisited stars and the galaxies the walk did not enter", () => {
    const trail: CosmosTrail = { visitedIds: ["a"] };
    expect(lensAlpha(null, "a", inks, trail)).toBe(1);
    expect(lensAlpha(null, "b", inks, trail)).toBe(inks.spotlightRestAlpha);
    expect(galaxyLensAlpha(null, inks, trail)).toBe(inks.spotlightRestAlpha);
    const sky = { galaxyOf: new Map([["a", 0], ["b", 1]]) } as unknown as CosmosLayout;
    expect(trailHolds(sky, trail, 0)).toBe(true);
    expect(trailHolds(sky, trail, 1)).toBe(false);
    const path: CosmosLens = { kind: "path", memberIds: new Set(["b"]), edgeIds: new Set() };
    expect(lensAlpha(path, "a", inks, trail)).toBe(inks.pathRestAlpha);
  });

  it("lights visited ids for the trail and draws no rows", () => {
    const record = vi.fn();
    const { out } = run({ relations: [rel("a", "b")], trail: { visitedIds: ["a", "b"] }, record });
    expect(out.rows).toHaveLength(0);
    expect(out.lens.lit).toBe(2);
    expect(out.lens.kind).toBe("trail");
    expect(record.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("draws the selected ring at the posed point", () => {
    const unposed = { x: 10, y: 20 };
    const { calls } = run({ attention: attention({ selectedId: "s" }), pointOf: () => ({ x: unposed.x + 40, y: unposed.y }) });
    const ring = calls.find((c) => c.op === "arc")!;
    expect(ring.args.slice(0, 2)).toEqual([500 + 50, 400 + 20]);
  });
});
