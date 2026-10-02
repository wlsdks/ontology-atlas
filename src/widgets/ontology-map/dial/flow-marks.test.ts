import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { buildDialModel, resolveDialAttention } from "./dial-model";
import { buildFlowMarks, fanAngles, flowHeadSize, focusFlowWidth, rampedFocusWidth, rampedRestWidth, restFlowWidth, stubText, type FlowMarksInput } from "./flow-marks";
import { crossfadeInk, mixOver, resolveDialInks } from "./ink";
import { resolveDialTokens } from "./tokens";
import type { Box, DialAttention, DialCluster, DialItem, DialMarks, DialModel, DialScene, Point } from "./types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));

const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "rgba(120, 130, 255, 0.8)", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", egoRestAlpha: 0.32,
} as unknown as OntologyMapTokens;

const DOMAINS = 9;
const RING = 300;
const CAP_OFFSET = 40;

function modelOf(deps: [string, string][], relates: [string, string][] = []): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (let d = 0; d < DOMAINS; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < 2; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `Cap ${d}.${c}`, kind: "capability" });
      edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" });
    }
  }
  for (const [s, t] of deps) edges.push({ source: s, target: t, kind: "depends", relationType: "depends_on" });
  for (const [s, t] of relates) edges.push({ source: s, target: t, kind: "depends", relationType: "related_to" });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)) });
}

function sceneOf(model: DialModel): DialScene {
  const positions = new Map<string, Point>([["p", { x: 0, y: 0 }]]);
  const clusters: DialCluster[] = model.domains.map((d, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / DOMAINS;
    const chip = { x: Math.cos(angle) * RING, y: Math.sin(angle) * RING };
    positions.set(d.id, chip);
    const items: DialItem[] = d.capabilityIds.map((id, k) => {
      const a = angle + (k === 0 ? 1 : -1) * 1.2;
      const p = { x: chip.x + Math.cos(a) * CAP_OFFSET, y: chip.y + Math.sin(a) * CAP_OFFSET };
      positions.set(id, p);
      return { id, direct: false, x: p.x, y: p.y, elementIds: [], elementPitch: 8 };
    });
    return { domainId: d.id, step: i < 3 ? 1 : 0, angle, chip, footprint: 50, items };
  });
  const itemById = new Map<string, DialItem>();
  for (const c of clusters) for (const it of c.items) itemById.set(it.id, it);
  return {
    order: model.domains.map((d) => d.id), rings: [{ step: 1, min: 2, max: 3, radius: RING }, { step: 0, min: 0, max: 1, radius: RING }],
    clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])), itemById,
    orphans: { ids: [], centre: { x: 0, y: 0 }, pitch: 1, radius: 0 }, axisAngle: 0, extent: { minX: -RING, minY: -RING, maxX: RING, maxY: RING },
    positions, medianElementPitch: 8, memory: { order: [], radiusByStep: new Map(), angleById: new Map(), itemOrder: new Map() },
  };
}

const WIDE: Box = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

function marks(): DialMarks {
  return { inks: [], strips: [], discs: [], squares: [], ticks: [], rails: [], glyphs: [], texts: [], numerals: [], leaders: [] };
}

function run(model: DialModel, over: Partial<FlowMarksInput> & { focusId?: string } = {}) {
  const scene = sceneOf(model);
  const scale = over.scale ?? 0.5;
  const toScreen = (x: number, y: number) => ({ x: x + 500, y: y + 400 });
  const input: FlowMarksInput = {
    model, scene, tokens: TOKENS, inks: resolveDialInks(MAP, TOKENS), attention: resolveDialAttention(model, null, over.focusId ?? null), previous: null,
    inkMix: 1, chordPresence: 1, scale, labelScale: 1, viewportWidth: 1000, viewportHeight: 800, freeRect: WIDE,
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    endRadiusPx: (id) => (model.domainById.has(id) ? 12 : 4), appearOf: () => 1,
    measureText: (text) => text.length * 6, occupied: [], chords: [], resolution: { entered: null, resolved: false, endpointSlide: 0 },
    ...over,
  };
  const out = marks();
  const result = buildFlowMarks(input, out);
  return { out, input, result };
}

const near = (p: Point, q: Point, d: number) => Math.hypot(p.x - q.x, p.y - q.y) < d;
const overlap = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

const BASE: [string, string][] = [
  ["d0c0", "d2c0"], ["d0c1", "d2c0"], ["d2c1", "d0c0"], ["d0", "d2"],
  ["d1c0", "d4c0"], ["d1c0", "d4c1"], ["d1c1", "d4c0"],
  ["d3c0", "d7c0"], ["d5c0", "d8c0"], ["d5c1", "d8c0"], ["d6c0", "d1c1"], ["d6c1", "d1c0"],
];

describe("buildFlowMarks", () => {
  it("ramps width by log share of the strongest drawn link", () => {
    expect(restFlowWidth(TOKENS, 3)).toBeCloseTo(0.9 + 1.15 * 2);
    expect(rampedRestWidth(TOKENS, 3, 3)).toBeCloseTo(Math.min(restFlowWidth(TOKENS, 3), 4.6));
    expect(rampedRestWidth(TOKENS, 1, 1000)).toBeCloseTo(0.9 + 3.7 * (1 / Math.log2(1001)));
    expect(rampedFocusWidth(TOKENS, 1000, 1000)).toBe(6);
    expect(focusFlowWidth(TOKENS, 1)).toBeCloseTo(2.5);
    expect(flowHeadSize(TOKENS, 2, 1)).toBeCloseTo(4.2 + 1.2);
    const { out } = run(modelOf([["d0c0", "d2c0"], ["d0c1", "d2c0"], ["d0c0", "d2c1"], ["d3c0", "d5c0"]]));
    const strong = out.strips.find((s) => s.flowKey === "d0\0d2")!;
    const weak = out.strips.find((s) => s.flowKey === "d3\0d5")!;
    expect(strong.w0).toBeCloseTo(rampedRestWidth(TOKENS, 3, 3));
    expect(weak.w0).toBeCloseTo(rampedRestWidth(TOKENS, 1, 3));
    expect(weak.w1).toBeCloseTo(weak.w0 * TOKENS.flowTaper);
  });

  it("draws a two-way pair as one strip with two heads", () => {
    const { out } = run(modelOf([["d0c0", "d2c0"], ["d2c1", "d0c1"]]));
    expect(out.strips).toHaveLength(1);
    expect(out.strips[0]).toMatchObject({ headStart: true, headEnd: true });
  });

  it("splits an attended pair: needs leaves the attended domain, used by arrives at it", () => {
    const model = modelOf([["d0c0", "d3c0"], ["d0c1", "d3c0"], ["d3c1", "d0c0"]]);
    const { out, input } = run(model, { focusId: "d3" });
    const d3 = input.nodeScreen("d3")!;
    const d0 = input.nodeScreen("d0")!;
    expect(out.strips).toHaveLength(2);
    const needs = out.strips.find((s) => out.inks[s.ink] === input.inks.needs)!;
    const used = out.strips.find((s) => out.inks[s.ink] === input.inks.usedBy)!;
    expect(near({ x: needs.ax, y: needs.ay }, d3, 30) && near({ x: needs.bx, y: needs.by }, d0, 30)).toBe(true);
    expect(near({ x: used.ax, y: used.ay }, d0, 30) && near({ x: used.bx, y: used.by }, d3, 30)).toBe(true);
    expect(input.chords.map((c) => [c.sourceDomain, c.targetDomain])).toEqual([["d3", "d0"], ["d0", "d3"]]);
  });

  it("puts focus numbers near the partner end, drops them on collision, and never forces them", () => {
    const model = modelOf([["d0c0", "d3c0"], ["d0c1", "d3c0"], ["d3c1", "d0c0"]]);
    const { out, input } = run(model, { focusId: "d3" });
    const d0 = input.nodeScreen("d0")!;
    const d3 = input.nodeScreen("d3")!;
    expect(out.numerals.map((n) => n.text).sort()).toEqual(["1", "2"]);
    for (const n of out.numerals) expect(Math.hypot(n.x - d0.x, n.y - d0.y)).toBeLessThan(Math.hypot(n.x - d3.x, n.y - d3.y));
    expect(run(model, { focusId: "d3", occupied: [WIDE] }).out.numerals).toHaveLength(0);
  });

  it("keeps rest numbers within clamp(0.6 × domains on screen, 4, 9), counts ≥ 2, off occupied boxes", () => {
    const model = modelOf(BASE);
    const { out } = run(model);
    expect(out.numerals.length).toBeGreaterThan(0);
    expect(out.numerals.length).toBeLessThanOrEqual(Math.max(4, Math.min(9, Math.round(0.6 * DOMAINS))));
    for (const n of out.numerals) expect(Number(n.text)).toBeGreaterThanOrEqual(2);
    expect(run(model, { occupied: [WIDE] }).out.numerals).toHaveLength(0);
  });

  it("leaves 0 overlapping numeral boxes in every focus state", () => {
    const model = modelOf(BASE);
    const states = [null, ...model.domains.map((d) => d.id), ...[...model.capabilityById.keys()]];
    for (const focusId of states) {
      const { out } = run(model, { focusId: focusId ?? undefined });
      for (let i = 0; i < out.numerals.length; i += 1) {
        for (let j = i + 1; j < out.numerals.length; j += 1) expect(overlap(out.numerals[i]!.box, out.numerals[j]!.box)).toBe(false);
      }
    }
  });

  it("draws relates-only dashed with no numeral, hidden while another domain is attended", () => {
    const model = modelOf([], [["d0", "d4"]]);
    const { out } = run(model);
    expect(out.strips).toHaveLength(1);
    expect(out.strips[0]).toMatchObject({ role: "relates", dashed: true, w0: 1, w1: 1 });
    expect(out.numerals).toHaveLength(0);
    expect(run(model, { focusId: "d2" }).out.strips).toHaveLength(0);
    expect(run(model, { focusId: "d0" }).out.strips).toHaveLength(1);
  });

  it("draws no stroke when both ends leave the free rect", () => {
    const model = modelOf([["d0c0", "d4c0"]]);
    const free = { minX: 480, minY: 380, maxX: 520, maxY: 420 };
    const { out, result } = run(model, { freeRect: free });
    expect(out.strips).toHaveLength(0);
    expect(result.stubs).toHaveLength(0);
  });

  it("turns a link with one end outside the free rect into a stub whose text equals the counts", () => {
    const model = modelOf([["d0c0", "d1c0"], ["d0c1", "d1c0"], ["d1c1", "d0c0"], ["d0c0", "d5c0"], ["d4c0", "d0c0"]]);
    const chip = { x: 500, y: 100 };
    const free = { minX: chip.x - 150, minY: 20, maxX: chip.x + 150, maxY: 300 };
    const { out, result } = run(model, { freeRect: free, viewportWidth: 4000, viewportHeight: 4000 });
    const expected = new Set([stubText("Domain 1", 2, 1), stubText("Domain 4", 0, 1), stubText("Domain 5", 1, 0)]);
    const texts = result.stubs.map((s) => s.text);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    for (const t of texts) expect(expected.has(t)).toBe(true);
    expect(texts).toContain("Domain 1 →2 ←1");
    expect(new Set(out.strips.map((s) => s.flowKey))).toEqual(new Set(["d0\0d1", "d0\0d4", "d0\0d5"]));
    expect(out.strips.every((s) => s.role === "stub")).toBe(true);
    for (const s of result.stubs) expect(s.box.minX >= free.minX && s.box.maxX <= free.maxX).toBe(true);
  });

  it("fans stubs at least stub-gap-deg apart", () => {
    const fanned = fanAngles([0.1, 0.12, 0.13, 2], TOKENS.stubGapDeg);
    const sorted = [...fanned].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k += 1) expect(sorted[k]! - sorted[k - 1]!).toBeGreaterThanOrEqual((TOKENS.stubGapDeg * Math.PI) / 180 - 1e-9);
  });

  it("drops a stub label that is not whole", () => {
    const model = modelOf([["d0c0", "d1c0"], ["d0c0", "d5c0"]]);
    const free = { minX: 350, minY: 20, maxX: 650, maxY: 300 };
    const long = (text: string) => (text.startsWith("Domain 5") ? 900 : text.length * 6);
    const { result } = run(model, { freeRect: free, measureText: long, viewportWidth: 4000, viewportHeight: 4000 });
    expect(result.stubs.map((s) => s.text)).toEqual(["Domain 1 →1"]);
  });

  it("draws nothing at presence 0, and waits for the later end's appear", () => {
    const model = modelOf(BASE, [["d2", "d6"]]);
    expect(run(model, { chordPresence: 0 }).out.strips).toHaveLength(0);
    expect(run(model, { appearOf: () => TOKENS.chordArrival }).out.strips).toHaveLength(0);
    const late = run(model, { appearOf: (id) => (id === "d2" ? 0.5 : 1) }).out.strips;
    expect(late.some((s) => s.flowKey.includes("d2"))).toBe(false);
    expect(late.length).toBeGreaterThan(0);
  });

  it("crossfades to the midpoint ink at inkMix 0.5", () => {
    const model = modelOf([["d0c0", "d3c0"]]);
    const { out, input } = run(model, { focusId: "d0", previous: resolveDialAttention(model, null, null), inkMix: 0.5 });
    expect(out.inks[out.strips[0]!.ink]).toBe(crossfadeInk(input.inks.flow, input.inks.needs, 0.5));
  });

  it("resolves the entered domain's capabilities, sliding from the chip", () => {
    const model = modelOf(BASE);
    const free = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    const scale = (TOKENS.resolve + 6) / TOKENS.pitch;
    const toScreen = (x: number, y: number) => ({ x: (x - 0) * scale + 500, y: (y + RING) * scale + 400 });
    const scene = sceneOf(model);
    const nodeScreen = (id: string) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; };
    const { result, out } = run(model, { scale, toScreen, nodeScreen, freeRect: free, resolution: { entered: "d0", resolved: true, endpointSlide: 0.5 } });
    expect(result).toMatchObject({ entered: "d0", resolved: true });
    expect(result.links.some((l) => l.u.startsWith("d0c") || l.v.startsWith("d0c"))).toBe(true);
    const chip = nodeScreen("d0")!;
    const cap = nodeScreen("d0c0")!;
    const mid = { x: (chip.x + cap.x) / 2, y: (chip.y + cap.y) / 2 };
    const fromCap = out.strips.filter((s) => s.flowKey.startsWith("d0c0\0"));
    expect(fromCap.length).toBeGreaterThan(0);
    expect(fromCap.some((s) => near({ x: s.ax, y: s.ay }, mid, 20) || near({ x: s.bx, y: s.by }, mid, 20))).toBe(true);
  });

  it("paints no ink outside the token set", () => {
    const inks = resolveDialInks(MAP, TOKENS);
    const allowed = new Set(Object.values(inks));
    const model = modelOf(BASE, [["d2", "d6"]]);
    const attentions: (DialAttention | null)[] = [null, resolveDialAttention(model, null, "d0"), resolveDialAttention(model, null, "d1c0")];
    for (const attention of attentions) {
      for (const free of [WIDE, { minX: 300, minY: 20, maxX: 700, maxY: 330 }]) {
        const { out } = run(model, { attention: attention ?? resolveDialAttention(model, null, null), freeRect: free });
        for (const ink of out.inks) expect(allowed.has(ink)).toBe(true);
      }
    }
    expect(inks.flowReceded).toBe(mixOver(MAP.edgeDepends, inks.bg, MAP.egoRestAlpha));
  });
});
