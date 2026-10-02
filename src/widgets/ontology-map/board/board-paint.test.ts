import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../model/containment-tree";
import { computeHexBoard, hexGutter, HEX_TYPE, type HexBoardLayout, type HexTextRole } from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import type { HexDrawRoute, HexDrawState, HexEvidenceState } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { drawBoard } from "./board-paint";
import { buildBoardScene } from "./board-scene";
import { cssOf, solid } from "./board-tones";

interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
  shadowBlur: number;
  lineWidth: number;
}

function recorder() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1, shadowBlur: 0, lineWidth: 1, fillStyle: "", strokeStyle: "" };
  const stack: Record<string, unknown>[] = [];
  const gradient = { addColorStop: () => {} };
  const special: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (t) => ({ width: [...String(t)].length * 6.5 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    save: () => stack.push({ ...props }),
    restore: () => Object.assign(props, stack.pop()),
  };
  const ctx = new Proxy(props, {
    get: (t, key: string) => {
      if (key in special || !(key in t)) {
        return (...args: unknown[]) => {
          calls.push({
            op: key,
            args,
            fillStyle: t.fillStyle,
            strokeStyle: t.strokeStyle,
            globalAlpha: t.globalAlpha as number,
            shadowBlur: t.shadowBlur as number,
            lineWidth: t.lineWidth as number,
          });
          return special[key]?.(...args);
        };
      }
      return t[key];
    },
    set: (t, key: string, value) => {
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const T: HexBoardTokens = {
  face: ["#141419", "#18181f", "#1d1d25", "#23232c", "#2a2a35"],
  faceStale: ["#18150f", "#1c1812", "#221d15", "#282218", "#2f281b"],
  faceDomain: ["#20213a", "#16172a"],
  faceSelected: ["#2a2c55", "#1b1c36"],
  faceProject: ["#262219", "#15130f"],
  riser: "#060608",
  rim: "#74768a",
  rimDomain: "#7c80d8",
  rimSelected: "#a5abff",
  rimUnknown: "#7a7b88",
  hatch: "#2a2a33",
  bevel: ["rgba(255,255,255,0.16)", "rgba(0,0,0,0.25)"],
  plate: "rgba(94,106,210,0.06)",
  plateFocus: "rgba(94,106,210,0.12)",
  plateStroke: "rgba(136,144,224,0.22)",
  moat: "rgba(255,255,255,0.022)",
  glow: "rgba(94,106,210,0.08)",
  accent: "#9aa0f0",
  canal: "#5c5f79",
  canalHead: "#6d7090",
  inkMeta: "#a3a6ae",
  dimAlpha: 0.3,
  dimFarAlpha: 0.16,
  stale: "#f4b731",
  staleInk: "rgba(239,200,150,0.95)",
  usedBy: "rgba(200,210,255,0.66)",
  indigo: "#5e6ad2",
  indigoBright: "#8890e0",
  hub: "#d4b478",
  hubHairline: "rgba(212,180,120,0.35)",
  ink: "#d0d6e0",
  inkHi: "#f7f8f8",
  inkDim: "#82828a",
  canvas: "#08090a",
  ground: "#0a0a0d",
};

function measure(text: string, role: HexTextRole): number {
  return [...text].length * (role === "mono" ? 0.61 : 0.56) * HEX_TYPE[role === "capabilityStrong" ? "capability" : role];
}

function board(): HexBoardLayout {
  const nodes: TreeInputNode[] = [{ id: "p", label: "Atlas", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (const d of ["a", "b", "c"]) {
    nodes.push({ id: d, label: `Domain ${d}`, kind: "domain" });
    edges.push({ source: "p", target: d, kind: "contains", relationType: "contains" });
    for (let i = 0; i < 4; i += 1) {
      nodes.push({ id: `${d}${i}`, label: `Cap ${d}${i}`, kind: "capability" });
      edges.push({ source: d, target: `${d}${i}`, kind: "contains", relationType: "contains" });
    }
  }
  return computeHexBoard(nodes, edges, { aspect: 1.6 });
}

const layout = board();
const R = 60;

function stateFor(over: Partial<HexDrawState> = {}): HexDrawState {
  return {
    width: 1512,
    height: 982,
    R,
    ox: 756,
    oy: 491,
    band: "names",
    selectedId: null,
    hoverId: null,
    focusId: null,
    lit: null,
    staleOnly: false,
    focusRegion: null,
    dimT: 0,
    evidence: new Map(layout.capabilities.map((c) => [c.id, "current" as HexEvidenceState])),
    staleFiles: new Map(),
    staleByDomain: null,
    domainMeta: new Map(),
    projectMeta: null,
    plateSub: new Map(),
    routes: [],
    ports: new Map(),
    arrivalMs: null,
    reducedMotion: false,
    sweep: null,
    measure,
    ...over,
  };
}

function paint(over: Partial<HexDrawState> = {}) {
  const { ctx, calls } = recorder();
  const out = drawBoard(ctx, layout, stateFor(over), T, buildBoardScene(layout, null), { pitch: 0, pivotY: 0 });
  return { ...out, calls };
}

function route(sourceId: string, targetId: string, role: HexDrawRoute["role"], extra: Partial<HexDrawRoute> = {}): HexDrawRoute {
  const s = layout.byId.get(sourceId)!;
  const t = layout.byId.get(targetId)!;
  return { points: [{ x: s.x, y: s.y }, { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 + 1 }, { x: t.x, y: t.y - 1 }], sourceId, targetId, role, ...extra };
}

const RI = R - hexGutter(R);
const caps = layout.capabilities;
const lastTileFill = (calls: Call[]) => calls.findLastIndex((c) => c.op === "fill" && c.shadowBlur === 0 && typeof c.fillStyle === "string" && c.fillStyle.startsWith("rgb("));

describe("drawBoard at pitch 0", () => {
  it("draws every tile face on the vertices of the flat hexagon", () => {
    const { calls } = paint();
    const path = calls.filter((c) => c.op === "moveTo" || c.op === "lineTo").map((c) => c.args as [number, number]);
    for (const t of layout.tiles) {
      const X = 756 + t.x * R;
      const Y = 491 + t.y * R;
      const want = [0, 1, 2, 3, 4, 5].map((i) => [X + RI * Math.cos((i * Math.PI) / 3), Y + RI * Math.sin((i * Math.PI) / 3)]);
      const hit = path.some((_, k) => want.every(([x, y], i) => Math.abs(path[k + i]![0] - x!) < 1e-9 && Math.abs(path[k + i]![1] - y!) < 1e-9));
      expect(hit, t.id).toBe(true);
    }
  });

  it("puts arrival notches at a two-way canal's ends and a stub head on a stub", () => {
    const twoWay = paint({ band: "regions", R: 20, routes: [route("a", "b", "canal", { twoWay: true, count: 3 })] });
    expect(twoWay.calls.filter((c) => c.op === "fill" && c.fillStyle === T.canalHead)).toHaveLength(2);
    const stub = paint({ band: "regions", R: 20, routes: [route("a", "b", "canal", { stub: true, count: 1 })] });
    expect(stub.calls.filter((c) => c.op === "fill" && c.fillStyle === T.canalHead)).toHaveLength(0);
    expect(stub.calls.filter((c) => c.op === "stroke" && c.strokeStyle === T.canalHead && c.lineWidth === 1.6)).toHaveLength(1);
  });

  it("starts a focus route with a dot and ends it with a notch, both over the tiles, its stroke under them", () => {
    const { calls } = paint({ selectedId: caps[0]!.id, lit: new Set([caps[0]!.id, caps[5]!.id]), dimT: 1, routes: [route(caps[0]!.id, caps[5]!.id, "need")] });
    const arc = calls.findIndex((c) => c.op === "arc");
    expect(calls[arc]!.args[2]).toBeCloseTo(1.7 + 1.2, 9);
    const notchFill = calls.findIndex((c, i) => i > arc && c.op === "fill" && c.fillStyle === T.accent);
    const stroke = calls.findIndex((c) => c.op === "stroke" && c.strokeStyle === T.accent);
    const tiles = lastTileFill(calls);
    expect(stroke).toBeLessThan(tiles);
    expect(arc).toBeGreaterThan(tiles);
    expect(notchFill).toBeGreaterThan(arc);
  });

  it("lays stale-only and hover halos under the tiles", () => {
    const stale = new Map(caps.map((c, i) => [c.id, (i % 2 ? "stale" : "current") as HexEvidenceState]));
    const { calls } = paint({ staleOnly: true, dimT: 1, lit: new Set(caps.filter((_, i) => i % 2).map((c) => c.id)), evidence: stale, hoverId: caps[0]!.id });
    const staleHalos = calls.filter((c) => c.op === "fill" && c.shadowBlur === 16);
    expect(staleHalos).toHaveLength(caps.filter((_, i) => i % 2).length);
    expect(staleHalos[0]!.globalAlpha).toBeCloseTo(0.22, 9);
    const hover = calls.filter((c) => c.op === "fill" && c.shadowBlur === 14);
    expect(hover).toHaveLength(1);
    expect(hover[0]!.globalAlpha).toBeCloseTo(0.35, 9);
    expect(calls.findLastIndex((c) => c.shadowBlur === 16)).toBeLessThan(lastTileFill(calls));
  });

  it("sweeps one gradient across the stale tiles only while the sweep runs", () => {
    const evidence = new Map(caps.map((c) => [c.id, "stale" as HexEvidenceState]));
    const gradients = (sweep: number | null) => paint({ staleOnly: true, evidence, sweep }).calls.filter((c) => c.op === "createLinearGradient" || c.op === "createRadialGradient").length;
    expect(gradients(0.4)).toBe(2);
    expect(gradients(null)).toBe(1);
    expect(paint({ staleOnly: true, evidence, sweep: 0.4 }).calls.some((c) => c.op === "clip")).toBe(true);
  });

  it("writes the moved file under a stale name in stale-only mode, in the stale ink", () => {
    const evidence = new Map(caps.map((c) => [c.id, "stale" as HexEvidenceState]));
    const { calls } = paint({ R: 80, staleOnly: true, evidence, staleFiles: new Map([[caps[0]!.id, "graph.mjs"]]) });
    const file = calls.find((c) => c.op === "fillText" && c.args[0] === "graph.mjs");
    expect(file?.fillStyle).toBe(T.staleInk);
  });

  it("scales a tile up as it arrives", () => {
    const { calls } = paint({ arrivalMs: 110 });
    const p = layout.project!;
    const X = 756 + p.x * R;
    const firstX = calls.filter((c) => c.op === "moveTo").map((c) => (c.args[0] as number) - X);
    const scaled = firstX.find((dx) => dx > RI * 0.94 - 1e-9 && dx < RI - 1e-6);
    expect(scaled).toBeDefined();
  });

  it("places far-band nameplates clear of every tile and of each other", () => {
    const { plateBoxes, stats } = paint({ band: "regions", R: 20, ox: 756, oy: 491 });
    expect(stats.plates).toBe(layout.regions.length + 1);
    const ri = 20 - hexGutter(20);
    const fapo = (ri * SQRT3) / 2;
    for (const p of plateBoxes) {
      for (const t of layout.tiles) {
        const x = 756 + t.x * 20;
        const y = 491 + t.y * 20;
        const clear = x + ri <= p.x || x - ri >= p.x + p.w || y + fapo <= p.y || y - fapo >= p.y + p.h;
        expect(clear, `${p.id} over ${t.id}`).toBe(true);
      }
    }
  });

  it("rings a used-by tile at 0.8 of the dim", () => {
    const { calls } = paint({ selectedId: caps[5]!.id, lit: new Set([caps[0]!.id, caps[5]!.id]), dimT: 0.5, routes: [route(caps[0]!.id, caps[5]!.id, "use")] });
    const ring = calls.filter((c) => c.op === "stroke" && c.strokeStyle === T.usedBy && c.lineWidth === 1.4);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.globalAlpha).toBeCloseTo(0.4, 9);
  });

  it("makes one gradient per frame at rest, the ground glow", () => {
    const { calls } = paint({ band: "pips", R: 36 });
    expect(calls.filter((c) => c.op === "createLinearGradient" || c.op === "createRadialGradient")).toHaveLength(1);
  });

  it("reads the minified token forms the static build ships", () => {
    const ground = [10, 10, 13] as const;
    expect(cssOf(solid("#8890e038", ground))).toBe(cssOf(solid("rgba(136, 144, 224, 0.22)", ground)));
    expect(cssOf(solid("#fff", ground))).toBe("rgb(255, 255, 255)");
    expect(cssOf(solid("rgb(136 144 224 / 22%)", ground))).toBe(cssOf(solid("rgba(136, 144, 224, 0.22)", ground)));
    expect(() => solid("oklch(0.5 0.1 270)", ground)).toThrow();
  });

  it("rings a hovered tile in the slab band", () => {
    const { calls } = paint({ band: "regions", R: 10, hoverId: caps[2]!.id });
    expect(calls.filter((c) => c.op === "stroke" && c.strokeStyle === T.indigoBright && c.lineWidth === 2)).toHaveLength(1);
  });

  it("lays the selection halo under every tile at pitch 0", () => {
    const { calls } = paint({ selectedId: caps[0]!.id });
    const halo = calls.findIndex((c) => c.op === "fill" && c.shadowBlur === 20);
    const firstFace = calls.findIndex((c) => c.op === "fill" && c.fillStyle === T.riser);
    expect(halo).toBeGreaterThan(-1);
    expect(halo).toBeLessThan(firstFace);
  });
});
