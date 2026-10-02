import { describe, expect, it } from "vitest";
import type { DirectedDomainFlow } from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { buildFlowMarks, fanStubs, flowHeadSize, focusFlowWidth, restFlowWidth, type FlowMarksInput } from "./flow-marks";
import { crossfadeInk, mixOver, resolveDialInks } from "./ink";
import type { DialAttention, DialMarks, DialModel, DialScene, DialSector, DialTokens, Point } from "./types";

const TOKENS: DialTokens = {
  ringMin: 300, ringSingleRowMax: 430, rowGap: 17, pitch: 26, pitchMin: 11, pitchMax: 33.8, rowsMax: 4, sectorGap: 0.11, chipSlots: 1.8,
  hubClearance: 92, elementStart: 18, elementPitch: 9, orphanGap: 160, orphanPitch: 11, orphanRow: 30, chordHubMargin: 30, chordDepth: 0.8, chordBow: 1.4,
  flowRestBase: 0.9, flowRestGain: 1.15, flowRestMax: 4.6, flowFocusBase: 1, flowFocusGain: 1.5, flowFocusMax: 6, flowQuietRatio: 0.7, flowTaper: 0.45,
  flowSplitPx: 4.5, flowHeadBasePx: 4.2, flowHeadGain: 0.6, flowTrimStartPx: 4, flowTrimEndPx: 7,
  numeralSize: 10.5, numeralHaloPx: 4, numeralGapPx: 5,
  restNumbersShare: 0.6, restNumbersMin: 4, restNumbersMax: 9, restNumberMinCount: 2, restStrongMin: 6, restStrongMax: 14,
  stubEnterRatio: 1.3, stubFullRatio: 1.65, namesRatio: 1.25, namePitchPx: 13, pinMinPx: 6, pinsMax: 12, chordArrival: 0.7,
  stubGapDeg: 13, stubMinPx: 70, stubMaxPx: 170, stubRingShare: 0.34, stubShortShare: 0.72,
  discMinPx: 2.2, discMaxPx: 7, discPitchShare: 0.27, discCapShare: 0.46, discGlyphPx: 7.5, chipMinPx: 9, chipMaxPx: 22, hubMinPx: 14, hubMaxPx: 34,
  nameMaxPx: 160, ledgerRowPx: 14, ledgerGapPx: 24, attendedNameInk: "#f4f4f8",
};

const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "rgba(120, 130, 255, 0.8)", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", egoRestAlpha: 0.32,
} as unknown as OntologyMapTokens;

const IDS = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];

function flow(a: string, b: string, ab: number, ba: number, relatesOnly = false): DirectedDomainFlow {
  return { key: `${a}\0${b}`, a, b, ab, ba, total: ab + ba, relatesOnly };
}

function fixture(flows: DirectedDomainFlow[]) {
  const ring = 300;
  const sectors: DialSector[] = IDS.map((id, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / IDS.length;
    return { domainId: id, angle, start: angle - 0.2, end: angle + 0.2, chip: { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring }, rows: 1, petals: [] };
  });
  const positions = new Map<string, Point>(sectors.map((s) => [s.domainId, s.chip]));
  positions.set("p", { x: 0, y: 0 });
  const controls = new Map<string, Point>(flows.map((f) => {
    const a = positions.get(f.a)!;
    const b = positions.get(f.b)!;
    return [f.key, { x: (a.x + b.x) * 0.3, y: (a.y + b.y) * 0.3 }];
  }));
  const domains = IDS.map((id) => ({ id, label: `Domain ${id}`, capabilityIds: [], directElementIds: [], elementCount: 0 }));
  const model: DialModel = {
    projectId: "p", projectLabel: "P", domains, domainById: new Map(domains.map((d) => [d.id, d])), capabilityById: new Map(),
    domainOf: new Map(), capabilityOf: new Map(), flows, flowByKey: new Map(flows.map((f) => [f.key, f])), capabilityDependencies: [], orphanIds: [],
  };
  const scene: DialScene = {
    order: IDS, ringRadius: ring, outerRadius: ring, pitch: 26, rowGap: 17, hubClearance: 92, sectors, sectorByDomain: new Map(sectors.map((s) => [s.domainId, s])),
    petalById: new Map(), orphans: [], positions, controls, extent: { minX: -ring, minY: -ring, maxX: ring, maxY: ring },
  };
  return { model, scene, positions };
}

const REST: DialAttention = { key: "||", domainId: null, capabilityId: null, needsCaps: new Set(), usedByCaps: new Set(), partnerDomains: new Set(), selected: false };
const focus = (id: string): DialAttention => ({ ...REST, key: `${id}||true`, domainId: id, selected: true });

function marks(): DialMarks {
  return { inks: [], strips: [], discs: [], squares: [], ticks: [], rails: [], glyphs: [], texts: [], numerals: [], leaders: [] };
}

function run(flows: DirectedDomainFlow[], over: Partial<FlowMarksInput> = {}) {
  const { model, scene, positions } = fixture(flows);
  const toScreen = (x: number, y: number) => ({ x: x + 500, y: y + 400 });
  const input: FlowMarksInput = {
    model, scene, tokens: TOKENS, inks: resolveDialInks(MAP, TOKENS), attention: REST, previous: null, inkMix: 1, chordPresence: 1, domainProgress: 1,
    zoomRatio: 1, scale: 1, labelScale: 1, viewportWidth: 1000, viewportHeight: 800, chipRadiusPx: 12,
    nodeScreen: (id) => { const p = positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    measureText: (text) => text.length * 6, restNumberKeys: new Set(), restStrongKeys: new Set(flows.map((f) => f.key)), occupied: [], chords: [],
    ...over,
  };
  const out = marks();
  buildFlowMarks(input, out);
  return { out, input };
}

const near = (p: { x: number; y: number }, q: Point, d: number) => Math.hypot(p.x - q.x, p.y - q.y) < d;

describe("buildFlowMarks", () => {
  it("follows the width and head formulas", () => {
    expect(restFlowWidth(TOKENS, 3)).toBeCloseTo(0.9 + 1.15 * 2);
    expect(restFlowWidth(TOKENS, 1000)).toBe(4.6);
    expect(focusFlowWidth(TOKENS, 1)).toBeCloseTo(2.5);
    expect(focusFlowWidth(TOKENS, 1000)).toBe(6);
    expect(flowHeadSize(TOKENS, 2, 1)).toBeCloseTo(4.2 + 1.2);
    const { out } = run([flow("d0", "d1", 3, 0)], { restStrongKeys: new Set() });
    expect(out.strips[0]!.w0).toBeCloseTo(restFlowWidth(TOKENS, 3) * 0.7);
    expect(out.strips[0]!.w1).toBeCloseTo(out.strips[0]!.w0 * 0.45);
  });

  it("draws a two-way pair as one strip with two heads", () => {
    const { out } = run([flow("d0", "d2", 2, 3)]);
    expect(out.strips).toHaveLength(1);
    expect(out.strips[0]).toMatchObject({ headStart: true, headEnd: true });
    expect(out.strips[0]!.w0).toBeCloseTo(out.strips[0]!.w1);
  });

  it("splits an attended pair: needs leaves the attended domain, used by arrives at it", () => {
    const { out, input } = run([flow("d0", "d3", 2, 5)], { attention: focus("d3") });
    const d3 = input.nodeScreen("d3")!;
    const d0 = input.nodeScreen("d0")!;
    expect(out.strips).toHaveLength(2);
    const inks = input.inks;
    const needs = out.strips.find((s) => out.inks[s.ink] === inks.needs)!;
    const used = out.strips.find((s) => out.inks[s.ink] === inks.usedBy)!;
    expect(near({ x: needs.ax, y: needs.ay }, d3, 30)).toBe(true);
    expect(near({ x: needs.bx, y: needs.by }, d0, 30)).toBe(true);
    expect(near({ x: used.ax, y: used.ay }, d0, 30)).toBe(true);
    expect(near({ x: used.bx, y: used.by }, d3, 30)).toBe(true);
    expect(Math.hypot(needs.ax - used.bx, needs.ay - used.by)).toBeGreaterThan(4);
    expect(needs.w0).toBeCloseTo(focusFlowWidth(TOKENS, 5));
    expect(input.chords.map((c) => [c.sourceDomain, c.targetDomain])).toEqual([["d3", "d0"], ["d0", "d3"]]);
  });

  it("keeps rest numerals within the budget, on rest keys, and off occupied boxes", () => {
    const flows = [flow("d0", "d1", 4, 0), flow("d1", "d4", 3, 1), flow("d2", "d6", 5, 2), flow("d3", "d7", 2, 2), flow("d5", "d8", 6, 0)];
    const keys = new Set([flows[0]!.key, flows[2]!.key, flows[4]!.key]);
    const blocker = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    const blocked = run(flows, { restNumberKeys: keys, occupied: [blocker] });
    expect(blocked.out.numerals).toHaveLength(0);
    const { out, input } = run(flows, { restNumberKeys: keys });
    expect(out.numerals.length).toBeLessThanOrEqual(keys.size);
    expect(out.numerals.length).toBeGreaterThan(0);
    for (const n of out.numerals) {
      expect(keys.has(n.flowKey)).toBe(true);
      expect(n.halo).toBe(false);
      const others = input.occupied.filter((b) => b !== n.box);
      expect(others.some((b) => b.minX < n.box.maxX && b.maxX > n.box.minX && b.minY < n.box.maxY && b.maxY > n.box.minY)).toBe(false);
    }
  });

  it("forces attended numerals with a halo", () => {
    const blocker = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    const { out } = run([flow("d0", "d3", 2, 5)], { attention: focus("d0"), occupied: [blocker] });
    expect(out.numerals.map((n) => n.text).sort()).toEqual(["2", "5"]);
    expect(out.numerals.every((n) => n.halo)).toBe(true);
  });

  it("draws relates-only dashed with no numeral, hidden while another domain is attended", () => {
    const f = flow("d0", "d4", 0, 0, true);
    const { out } = run([f], { restNumberKeys: new Set([f.key]) });
    expect(out.strips).toHaveLength(1);
    expect(out.strips[0]).toMatchObject({ role: "relates", dashed: true, w0: 1, w1: 1 });
    expect(out.numerals).toHaveLength(0);
    expect(run([f], { attention: focus("d2") }).out.strips).toHaveLength(0);
    expect(run([f], { attention: focus("d0") }).out.strips).toHaveLength(1);
  });

  it("labels stubs with ab and ba and fans them at least stub-gap-deg apart", () => {
    const flows = [flow("d0", "d1", 3, 2), flow("d0", "d2", 1, 0), flow("d0", "d3", 0, 4), flow("d0", "d5", 2, 2)];
    const { model, scene } = fixture(flows);
    const fan = fanStubs(model, scene, "d0", TOKENS.stubGapDeg);
    for (let k = 1; k < fan.length; k += 1) expect(fan[k]!.dir - fan[k - 1]!.dir).toBeGreaterThanOrEqual((13 * Math.PI) / 180 - 1e-9);
    const { out } = run(flows, { zoomRatio: 2, attention: focus("d0"), viewportWidth: 4000, viewportHeight: 4000 });
    const texts = out.texts.map((t) => t.text);
    expect(texts).toContain("Domain d1 →3 ←2");
    expect(texts).toContain("Domain d3 ←4");
    expect(out.strips.every((s) => s.role === "stub")).toBe(true);
  });

  it("drops a stub label that another stub of the same chip crosses", () => {
    const flows = [flow("d0", "d4", 3, 0), flow("d0", "d5", 2, 0)];
    const long = (text: string) => (text.startsWith("Domain d5") ? 400 : text.length * 6);
    const { out } = run(flows, { zoomRatio: 2, attention: focus("d0"), measureText: long, viewportWidth: 4000, viewportHeight: 4000 });
    const texts = out.texts.map((t) => t.text);
    expect(texts.some((t) => t.startsWith("Domain d5"))).toBe(false);
    expect(texts.some((t) => t.startsWith("Domain d4"))).toBe(true);
    expect(run(flows, { zoomRatio: 2, attention: focus("d0"), measureText: () => 8, viewportWidth: 4000, viewportHeight: 4000 }).out.texts).toHaveLength(2);
  });

  it("draws no strip at presence 0", () => {
    const flows = [flow("d0", "d1", 3, 2), flow("d2", "d5", 1, 0, false)];
    expect(run(flows, { chordPresence: 0 }).out.strips).toHaveLength(0);
    expect(run(flows, { chordPresence: 0, zoomRatio: 2 }).out.strips).toHaveLength(0);
  });

  it("crossfades to the midpoint ink at inkMix 0.5", () => {
    const { out, input } = run([flow("d0", "d3", 2, 0)], { attention: focus("d0"), previous: REST, inkMix: 0.5 });
    expect(out.inks[out.strips[0]!.ink]).toBe(crossfadeInk(input.inks.flow, input.inks.needs, 0.5));
    expect(crossfadeInk("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("paints no ink outside the token set", () => {
    const inks = resolveDialInks(MAP, TOKENS);
    const allowed = new Set(Object.values(inks));
    const flows = [flow("d0", "d1", 3, 2), flow("d0", "d4", 0, 0, true), flow("d2", "d6", 4, 0), flow("d3", "d7", 1, 1)];
    for (const attention of [REST, focus("d0"), focus("d3")]) {
      for (const zoomRatio of [1, 2]) {
        const { out } = run(flows, { attention, zoomRatio, restNumberKeys: new Set(flows.map((f) => f.key)), viewportWidth: 4000, viewportHeight: 4000 });
        for (const ink of out.inks) expect(allowed.has(ink)).toBe(true);
      }
    }
    expect(inks.flowReceded).toBe(mixOver(MAP.edgeDepends, inks.bg, MAP.egoRestAlpha));
    expect(inks.domainLabelAttended).toBe(mixOver(TOKENS.attendedNameInk, inks.bg));
    expect(resolveDialInks(MAP, TOKENS)).toBe(inks);
  });
});
