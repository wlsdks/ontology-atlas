import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { numeralFont } from "../../render/labels";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../model/containment-tree";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, resolveDialAttention } from "../dial-model";
import { mixOver, resolveDialInks } from "../ink";
import { layoutPackedDial } from "../layout";
import { buildDialMarks, emptyDialFrameMarks, type DialMarksInput } from "./marks";
import { circularDomainOrder } from "../order";
import { knockoutRects, paintDialMarks } from "./paint";
import { resolveDialDisclosure } from "./disclosure";
import { resolveDialTokens } from "../tokens";
import type { DialLabels, DialModel } from "../types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));

const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", nodeFillProject: "#2a2a30", nodeStrokeDomain: "#8a8ea8",
  amberHub: "#d8a040", recentChange: "#d8a040", numeralShadow: "#000000", numeralFace: "#e8e8f0", projectHairlineInner: "#806030",
  projectPinTick: "#806030", selectionRingIndigo: "#8b8cff", selectionRingHairline: "#5a5cc0", hoverRing: "#8b8cff", hoverShimmerSeg: 0.2,
  hoverShimmerPeriodMs: 2400, nodeSheenTint: "#232329", nodeSheenBlend: 0.6, egoRestAlpha: 0.32, radiusProject: 22,
} as unknown as OntologyMapTokens;

const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} loose`, more: (n) => `+${n} more`,
  ring: (min, max) => (max === null ? `${min}+ depend on these` : `${min}–${max} depend on these`), reading: (r, t) => `${r}/${t}`, settling: () => "settling", linksShown: (s, t) => `${s} of ${t}`,
};

const DRAW_CALLS = new Set(["fill", "stroke", "fillText", "strokeText", "fillRect", "strokeRect", "drawImage"]);

function recordingContext() {
  const calls: { name: string; args: unknown[]; font: string; composite: string; strokeStyle: string }[] = [];
  const state: Record<string, unknown> = { globalCompositeOperation: "source-over", globalAlpha: 1, font: "10px sans-serif", lineWidth: 1 };
  const stack: Record<string, unknown>[] = [];
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop() ?? {}),
    measureText: (text) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    getLineDash: () => [],
  };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in methods) return methods[key];
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ name: key, args, font: String(target.font), composite: String(target.globalCompositeOperation), strokeStyle: String(target.strokeStyle) });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, state };
}

function hash(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function overviewModel(domains: number, capabilities: number, elementsPer: number): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contains = (s: string, t: string) => edges.push({ source: s, target: t, kind: "contains", relationType: "contains" });
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    contains("p", `d${d}`);
  }
  const caps: string[] = [];
  for (let c = 0; c < capabilities; c += 1) {
    const d = Math.floor(Math.pow(hash(c), 1.6) * domains);
    const id = `c${c}`;
    caps.push(id);
    nodes.push({ id, label: `Capability ${c}`, kind: "capability" });
    contains(`d${d}`, id);
    for (let e = 0; e < elementsPer; e += 1) {
      nodes.push({ id: `${id}e${e}`, label: `Element ${c}.${e}`, kind: "element" });
      contains(id, `${id}e${e}`);
    }
  }
  for (let k = 0; k < capabilities * 2; k += 1) {
    const a = caps[Math.floor(hash(k * 3 + 1) * caps.length)]!;
    const b = caps[Math.floor(hash(k * 3 + 2) * caps.length)]!;
    if (a !== b) edges.push({ source: a, target: b, kind: "depends", relationType: "depends_on" });
  }
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)), elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id) });
}

const W = 1512;
const H = 900;

function frame(model: DialModel, focusId: string | null, zoom = 1) {
  const scene = layoutPackedDial(model, circularDomainOrder(model, null).order, TOKENS, null);
  const e = scene.extent;
  const scale = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY)) * 0.9 * zoom;
  const cx = (e.minX + e.maxX) / 2;
  const cy = (e.minY + e.maxY) / 2;
  const toScreen = (x: number, y: number) => ({ x: W / 2 + (x - cx) * scale, y: H / 2 + (y - cy) * scale });
  const input: DialMarksInput = {
    model, scene, tokens: TOKENS, mapTokens: MAP, inks: resolveDialInks(MAP, TOKENS), labels: LABELS, evidence: null,
    attention: resolveDialAttention(model, null, focusId), inkAttention: resolveDialAttention(model, null, focusId), previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: zoom, viewportWidth: W, viewportHeight: H, freeRect: { minX: 8, minY: 70, maxX: W - 64, maxY: H - 36 },
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    appearOf: () => 1, measureText: (text) => text.length * 6, elementLabel: (id) => id,
    hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: "10k",
    disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: W, viewportHeight: H, toScreen }, { minX: 8, minY: 70, maxX: W - 64, maxY: H - 36 }, resolveDialAttention(model, null, focusId), TOKENS),
  };
  const marks = emptyDialFrameMarks();
  const result = buildDialMarks(input, marks);
  const rec = recordingContext();
  paintDialMarks(rec.ctx, marks, MAP, { now: 0, reducedMotion: true, numeralHaloPx: TOKENS.numeralHaloPx });
  return { marks, result, scale, ...rec };
}

const D = 33;
const big = overviewModel(D, 1500, 5);

describe("paintDialMarks", () => {
  it("paints the 33-domain, 1,500-capability overview within 40 + 14·D draw calls and 0 capability discs", () => {
    const { calls, marks, scale } = frame(big, null);
    expect(TOKENS.pitch * scale).toBeLessThan(TOKENS.capOnFrom);
    expect(marks.discs).toHaveLength(0);
    expect(marks.glyphs.filter((g) => g.kind === "domain")).toHaveLength(D);
    const draws = calls.filter((c) => DRAW_CALLS.has(c.name)).length;
    expect(draws).toBeGreaterThan(D);
    expect(draws).toBeLessThanOrEqual(40 + 14 * D);
  });

  it("paints every plate as one path under the rings", () => {
    const { calls, marks } = frame(big, null);
    expect(marks.plates.length).toBeGreaterThan(1);
    const arcs = calls.findIndex((c) => c.name === "arc");
    const firstFill = calls.findIndex((c) => c.name === "fill");
    const firstStroke = calls.findIndex((c) => c.name === "stroke");
    const plateArcs = calls.slice(arcs, firstFill).filter((c) => c.name === "arc").length;
    expect(plateArcs).toBe(marks.plates.length);
    expect(calls.slice(0, firstFill).filter((c) => c.name === "beginPath")).toHaveLength(1);
    expect(firstStroke).toBe(firstFill + 1);
    const ringArc = calls.findIndex((c, i) => i > firstStroke && c.name === "arc");
    expect(ringArc).toBeGreaterThan(firstStroke);
  });

  it("knocks overlapping and repeated boxes out once, so no overlap is drawn back in", () => {
    const name = { minX: 20, minY: 20, maxX: 80, maxY: 40 };
    const units = { minX: 30.4, minY: 36, maxX: 70, maxY: 56 };
    const count = { minX: 20, minY: 70, maxX: 80, maxY: 80 };
    const rects = knockoutRects([name, units, count, { ...count }]);
    const cover = (x: number, y: number) => rects.filter((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h).length;
    for (let x = 0; x < 100; x += 1) {
      for (let y = 0; y < 100; y += 1) {
        const inside = [name, units, count].some((b) => x >= Math.floor(b.minX) && x < Math.ceil(b.maxX) && y >= Math.floor(b.minY) && y < Math.ceil(b.maxY));
        expect(cover(x + 0.5, y + 0.5)).toBe(inside ? 1 : 0);
      }
    }
  });

  it("stops the rings at every name and count box, and strokes every name in the ground", () => {
    const { calls, marks } = frame(big, "d0", 1);
    const clip = calls.findIndex((c) => c.name === "clip");
    expect(calls[clip]!.args).toEqual(["evenodd"]);
    const opened = calls.slice(0, clip).findLastIndex((c) => c.name === "beginPath");
    const rects = calls.slice(opened, clip).filter((c) => c.name === "rect").slice(1).map((c) => c.args as number[]);
    for (const m of [...marks.texts, ...marks.extraTexts, ...marks.numerals]) {
      const cx = (m.box.minX + m.box.maxX) / 2;
      const cy = (m.box.minY + m.box.maxY) / 2;
      expect(rects.filter(([x, y, w, h]) => cx >= x! && cx < x! + w! && cy >= y! && cy < y! + h!)).toHaveLength(1);
    }
    expect(calls.findIndex((c, i) => i > clip && c.name === "arc")).toBeGreaterThan(clip);
    const ground = mixOver(MAP.canvasBgNear, MAP.canvasBgNear);
    for (const t of marks.texts.filter((m) => m.parts === null)) {
      expect(calls.some((c) => c.name === "strokeText" && c.args[0] === t.text && c.strokeStyle === ground)).toBe(true);
    }
  });

  it("batches element squares per alpha step", () => {
    const { calls, marks } = frame(overviewModel(6, 60, 6), null, 3);
    const elements = marks.squares.filter((q) => q.id !== null);
    expect(elements.length).toBeGreaterThan(10);
    const steps = new Set(marks.squares.map((q) => `${q.fill}|${q.rim}`)).size;
    const clipped = calls.findLastIndex((c) => c.name === "clip");
    expect(calls.filter((c, i) => c.name === "rect" && i > clipped)).toHaveLength(marks.squares.length);
    expect(calls.filter((c) => c.name === "fillRect")).toHaveLength(0);
    const rectRuns = calls.filter((c, i) => c.name === "fill" && calls[i - 1]?.name === "rect").length;
    expect(rectRuns).toBe(steps);
  });

  it("writes no ellipsis, numerals in the token font, and never touches the composite", () => {
    for (const [focus, zoom] of [[null, 1], ["d0", 1], [null, 4], ["d3", 6]] as const) {
      const { calls, marks, state } = frame(big, focus, zoom);
      for (const c of calls) {
        if (c.name === "fillText" || c.name === "strokeText") expect(String(c.args[0])).not.toContain("…");
        expect(c.composite).toBe("source-over");
      }
      expect(state.globalCompositeOperation).toBe("source-over");
      const font = numeralFont();
      for (const n of marks.numerals) expect(n.font).toBe(font);
      const glyphs = marks.numerals.reduce((sum, n) => sum + [...n.text].length, 0);
      const fills = calls.filter((c) => c.name === "fillText");
      for (const c of fills.slice(fills.length - glyphs)) expect(c.font).toBe(font);
    }
  });

  it("paints numerals last, one glyph per tabular cell", () => {
    const { calls, marks } = frame(big, "d0", 1);
    expect(marks.numerals.length).toBeGreaterThan(0);
    const glyphs = marks.numerals.reduce((sum, n) => sum + [...n.text].length, 0);
    const texts = calls.filter((c) => c.name === "fillText");
    const tail = texts.slice(texts.length - glyphs).map((c) => c.args[0]);
    expect(tail.join("")).toBe(marks.numerals.map((n) => n.text).join(""));
  });
});
