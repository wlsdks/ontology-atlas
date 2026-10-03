import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../model/containment-tree";
import { easeOutCubic } from "../../model/camera-easing";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, resolveDialAttention } from "../dial-model";
import {
  clearDialFrame,
  countCrossings,
  describeLastDialFrame,
  dialFrameSummary,
  dialChordPresence,
  dialLightFrame,
  dialOwnsFlatPaint,
  focusInkMix,
  markFocusPainted,
  lastDialFrame,
  namesCrossed,
  paintDialFrame,
  sampleStrips,
} from "./frame";
import { layoutDial } from "../layout";
import { circularDomainOrder } from "../order";
import { resolveDialTokens } from "../tokens";
import type { DialFrameInput, DialLabels, DialModel, DialOwnershipInput, Point } from "../types";

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
  ring: (min, max) => (max === null ? `${min}+` : `${min}–${max}`), reading: (r, t) => `${r}/${t}`, settling: () => "settling", linksShown: (s, t) => `${s} of ${t}`,
};

function recordingContext(): CanvasRenderingContext2D {
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
  return new Proxy(state, {
    get: (target, key: string) => (key in methods ? methods[key] : key in target ? target[key] : () => undefined),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function modelOf(): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contains = (s: string, t: string) => edges.push({ source: s, target: t, kind: "contains", relationType: "contains" });
  for (let d = 0; d < 5; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    contains("p", `d${d}`);
    for (let c = 0; c < 4; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `Capability ${d}.${c}`, kind: "capability" });
      contains(`d${d}`, `d${d}c${c}`);
    }
  }
  for (let d = 0; d < 5; d += 1) edges.push({ source: `d${d}c0`, target: `d${(d + 1) % 5}c1`, kind: "depends", relationType: "depends_on" });
  edges.push({ source: "d1c2", target: "d0c3", kind: "depends", relationType: "depends_on" }, { source: "d2c2", target: "d0c3", kind: "depends", relationType: "depends_on" });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)) });
}

const W = 1200;
const H = 800;

function frameInput(model: DialModel, over: Partial<DialFrameInput> = {}): DialFrameInput {
  const scene = layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
  const e = scene.extent;
  const scale = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY)) * 0.8;
  const toScreen = (x: number, y: number): Point => ({ x: W / 2 + x * scale, y: H / 2 + y * scale });
  return {
    ctx: recordingContext(), dial: { model, scene, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 } }, worldKey: {},
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, labelScale: TOKENS.labelScale, zoomRatio: 1,
    viewportWidth: W, viewportHeight: H, freeRect: { minX: 8, minY: 60, maxX: W - 60, maxY: H - 30 },
    mapTokens: MAP, dialTokens: TOKENS, labels: LABELS, evidence: null,
    hoveredNodeId: null, focusedNodeId: null, agentFocusNodeId: null, selectionPulse: null, appearOf: () => 1, hubCount: null,
    now: 0, reducedMotion: false, domainAppear: 1, elementLabel: (id) => id,
    ...over,
  };
}

afterEach(() => clearDialFrame());

describe("dialOwnsFlatPaint", () => {
  const owning: DialOwnershipInput = {
    hasDial: true, galaxyOn: false, realmActive: false, edgeSelected: false, edgePreviewed: false,
    trailLensOpen: false, spotlightActive: false, pathLensActive: false, impactLensActive: false, focusedIsElement: false, focusedRelationsCaptioned: false, brushedIsElement: false,
  };

  it("owns Flat only when the dial exists and nothing else claims the paint", () => {
    expect(dialOwnsFlatPaint(owning)).toBe(true);
    expect(dialOwnsFlatPaint({ ...owning, hasDial: false })).toBe(false);
    for (const key of ["galaxyOn", "realmActive", "edgeSelected", "edgePreviewed", "trailLensOpen", "spotlightActive", "pathLensActive", "impactLensActive", "focusedIsElement", "focusedRelationsCaptioned", "brushedIsElement"] as const) {
      expect(dialOwnsFlatPaint({ ...owning, [key]: true }), key).toBe(false);
    }
  });
});

describe("focus clock", () => {
  const model = modelOf();
  const rest = resolveDialAttention(model, null, null);
  const onD1 = resolveDialAttention(model, "d1", null);

  it("mixes inks from 0 at the first painted frame to 1 at 120 ms on easeOutCubic", () => {
    const key = {};
    expect(focusInkMix(key, rest, 0, false).inkMix).toBe(1);
    expect(focusInkMix(key, onD1, 1000, false).inkMix).toBe(0);
    markFocusPainted(key, 1000);
    expect(focusInkMix(key, onD1, 1060, false).inkMix).toBeCloseTo(easeOutCubic(0.5));
    expect(focusInkMix(key, onD1, 1120, false).inkMix).toBe(1);
    expect(focusInkMix(key, onD1, 1400, false).inkMix).toBe(1);
  });

  it("counts from when the first focused frame finished painting, so a long first frame skips nothing", () => {
    const key = {};
    focusInkMix(key, rest, 0, false);
    expect(focusInkMix(key, onD1, 1006, false).inkMix).toBe(0);
    markFocusPainted(key, 1057);
    markFocusPainted(key, 1090);
    expect(focusInkMix(key, onD1, 1073, false).inkMix).toBeCloseTo(easeOutCubic(16 / 120));
  });

  it("is 1 at once under reduced motion", () => {
    const key = {};
    focusInkMix(key, rest, 0, true);
    expect(focusInkMix(key, onD1, 500, true).inkMix).toBe(1);
  });

  it("crossfades from the previous attention", () => {
    const key = {};
    focusInkMix(key, onD1, 0, false);
    const onD2 = resolveDialAttention(model, "d2", null);
    expect(focusInkMix(key, onD2, 500, false).previous?.key).toBe(onD1.key);
    markFocusPainted(key, 500);
    expect(focusInkMix(key, onD2, 560, false).previous?.key).toBe(onD1.key);
    expect(focusInkMix(key, onD2, 700, false).previous).toBeNull();
  });
});

describe("focus on a new world", () => {
  it("keeps an unchanged focus settled: the ink stays mixed and nothing crossfades", () => {
    const model = modelOf();
    const first = frameInput(model, { focusedNodeId: "d1", now: 0, worldKey: {} });
    paintDialFrame(first);
    expect(paintDialFrame({ ...first, now: 400 }).inkMix).toBe(1);
    const refreshed = paintDialFrame({ ...first, worldKey: {}, now: 416 });
    expect(refreshed.inkMix).toBe(1);
    expect(refreshed.light).toMatchObject({ focused: true, inkMix: 1 });
    expect(focusInkMix(first.worldKey, resolveDialAttention(model, null, "d1"), 420, false)).toEqual({ inkMix: 1, previous: null });
  });
});

describe("dialChordPresence", () => {
  it("is 0 until the chord arrival share of the domain rise, then eases to 1", () => {
    expect(dialChordPresence(TOKENS, 0)).toBe(0);
    expect(dialChordPresence(TOKENS, TOKENS.chordArrival)).toBe(0);
    const mid = dialChordPresence(TOKENS, (TOKENS.chordArrival + 1) / 2);
    expect(mid).toBeCloseTo(0.5);
    expect(dialChordPresence(TOKENS, 1)).toBe(1);
  });
});

describe("frame registry", () => {
  it("sets the last frame and the light frame, and clears both", () => {
    const model = modelOf();
    expect(lastDialFrame()).toBeNull();
    const result = paintDialFrame(frameInput(model, { focusedNodeId: "d1", now: 10 }));
    expect(lastDialFrame()).toBe(result);
    expect(dialLightFrame()).toMatchObject({ attentionKey: resolveDialAttention(model, null, "d1").key, focused: true });
    expect(result.labelBoxes.some((b) => b.nodeId === "d1")).toBe(true);
    clearDialFrame();
    expect(lastDialFrame()).toBeNull();
    expect(dialLightFrame()).toBeNull();
    expect(describeLastDialFrame(W, H)).toBeNull();
  });

  it("describes the last frame with rings, disclosure, budget and placement", () => {
    const model = modelOf();
    const input = frameInput(model);
    paintDialFrame(input);
    const probe = describeLastDialFrame(W, H)!;
    expect(probe.owns).toBe(true);
    expect(probe.rings).toEqual(input.dial.scene.rings);
    expect(probe.disclosure.capAlpha).toBeGreaterThanOrEqual(0);
    expect(probe.budget.total).toBe(probe.flows.filter((f) => !f.relatesOnly).length);
    expect(probe.flows.filter((f) => f.drawn).length).toBeGreaterThan(0);
    expect(probe.placement).toEqual({ state: "settled", held: 0 });
    expect(probe.clusters).toHaveLength(5);
    expect(probe.textOverlaps).toBe(0);
    const last = lastDialFrame()!;
    expect(probe.discs.map((d) => d.ink)).toEqual(last.marks.discs.map((d) => last.marks.inks[d.rim]));
    expect(probe.discs.every((d) => d.ink.startsWith("#"))).toBe(true);
    expect(probe.squares).toBe(last.marks.squares.filter((q) => q.id !== null && !input.dial.scene.orphans.ids.includes(q.id)).length);
  });
});

describe("frame slot", () => {
  it("keeps nothing of the painted input: the context, the world and the closures can go once the frame is painted", () => {
    const model = modelOf();
    const input = frameInput(model, { focusedNodeId: "d1" });
    const revokers: (() => void)[] = [];
    const revocable = <T extends object>(target: T): T => {
      const { proxy, revoke } = Proxy.revocable(target, {});
      revokers.push(revoke);
      return proxy;
    };
    paintDialFrame({
      ...input,
      ctx: revocable(input.ctx),
      dial: { model: revocable(input.dial.model), scene: revocable(input.dial.scene), overviewPadPx: input.dial.overviewPadPx },
      worldKey: revocable({}),
      nodeScreen: revocable(input.nodeScreen),
      toScreen: revocable(input.toScreen),
      appearOf: revocable(input.appearOf),
      elementLabel: revocable(input.elementLabel),
    });
    const probe = describeLastDialFrame(W, H);
    const summary = dialFrameSummary();
    expect(probe?.clusters).toHaveLength(5);
    for (const revoke of revokers) revoke();
    expect(describeLastDialFrame(W, H)).toEqual(probe);
    expect(dialFrameSummary()).toEqual(summary);
    expect(lastDialFrame()?.light.attentionKey).toBe(resolveDialAttention(model, null, "d1").key);
  });
});

describe("probe metrics", () => {
  const strip = (ax: number, ay: number, bx: number, by: number) => ({ ax, ay, cx: (ax + bx) / 2, cy: (ay + by) / 2, bx, by });

  it("counts one crossing between two crossing strips", () => {
    expect(countCrossings(sampleStrips([strip(0, 100, 200, 104), strip(103, 0, 97, 200)]), W, H)).toBe(1);
  });

  it("ignores an intersection within 16 px of an end", () => {
    expect(countCrossings(sampleStrips([strip(0, 100, 200, 100), strip(190, 90, 190, 300)]), W, H)).toBe(0);
  });

  it("counts a strip through a text box as one name crossed", () => {
    const lines = sampleStrips([strip(0, 100, 400, 100)]);
    const crossed = namesCrossed(lines, [{ text: "Orders", box: { minX: 150, minY: 90, maxX: 210, maxY: 110 } }, { text: "Billing", box: { minX: 150, minY: 200, maxX: 210, maxY: 220 } }]);
    expect(crossed).toEqual({ count: 1, names: ["Orders"] });
  });
});
