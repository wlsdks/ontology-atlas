import { describe, expect, it } from "vitest";
import { buildLabelMarks, domainLabelBlock, wrapDialName, type LabelMarksInput } from "./label-marks";
import type { Box, DialAttention, DialLabels, DialModel, DialScene, DialSector, DialTokens, Point, TextMark } from "./types";

const TOKENS = { nameMaxPx: 160, namePitchPx: 13, namesRatio: 1.25 } as DialTokens;
const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} without a domain`,
  more: (n) => `+${n} more`,
};
const measure = (text: string) => text.length * 6;
const REST: DialAttention = { key: "||", domainId: null, capabilityId: null, needsCaps: new Set(), usedByCaps: new Set(), partnerDomains: new Set(), selected: false };
const WIDE: Box = { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 };

function fixture(names: string[], ring = 300) {
  const sectors: DialSector[] = names.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
    return { domainId: `d${i}`, angle, start: angle - 0.3, end: angle + 0.3, chip: { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring }, rows: 1, petals: [] };
  });
  const domains = names.map((label, i) => ({ id: `d${i}`, label, capabilityIds: ["a", "b"], directElementIds: [], elementCount: 5 }));
  const positions = new Map<string, Point>(sectors.map((s) => [s.domainId, s.chip]));
  positions.set("p", { x: 0, y: 0 });
  const model: DialModel = {
    projectId: "p", projectLabel: "Project", domains, domainById: new Map(domains.map((d) => [d.id, d])), capabilityById: new Map(),
    domainOf: new Map(), capabilityOf: new Map(), flows: [], flowByKey: new Map(), capabilityDependencies: [], orphanIds: [],
  };
  const scene: DialScene = {
    order: domains.map((d) => d.id), ringRadius: ring, outerRadius: ring, pitch: 26, rowGap: 17, hubClearance: 92, sectors,
    sectorByDomain: new Map(sectors.map((s) => [s.domainId, s])), petalById: new Map(), orphans: [], positions, controls: new Map(),
    extent: { minX: -ring, minY: -ring, maxX: ring, maxY: ring },
  };
  return { model, scene, positions };
}

function run(names: string[], over: Partial<LabelMarksInput> = {}): TextMark[] {
  const { model, scene, positions } = fixture(names);
  const inks: string[] = [];
  const input: LabelMarksInput = {
    model, scene, labels: LABELS, evidence: null, attention: REST, tokens: TOKENS,
    inks: { project: "#1", domain: "#2", domainReceded: "#3", domainAttended: "#4", units: "#5", stale: "#6", capability: "#7", needs: "#8", usedBy: "#9", orphans: "#a" },
    ink: (c) => { const i = inks.indexOf(c); return i >= 0 ? i : inks.push(c) - 1; },
    measureText: measure, labelScale: 1, scale: 1, zoomRatio: 1,
    nodeScreen: (id) => positions.get(id) ?? null, toScreen: (x, y) => ({ x, y }),
    chipRadiusPx: 12, hubRadiusPx: 20, discRadiusPx: 4, petalBoxes: [], occupied: [], freeRect: WIDE, ledgerIds: new Set(),
    ...over,
  };
  const out = { texts: [] as TextMark[] };
  buildLabelMarks(input, out);
  return out.texts;
}

describe("wrapDialName", () => {
  it("keeps words whole, never adds an ellipsis, and stays within two lines", () => {
    const font = "x";
    expect(wrapDialName("Payments", 160, font, measure)).toEqual(["Payments"]);
    const lines = wrapDialName("Order fulfilment and warehouse routing service", 160, font, measure);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(" ")).toBe("Order fulfilment and warehouse routing service");
    expect(lines[0]!.length * 6).toBeLessThanOrEqual(160);
    expect(wrapDialName("Supercalifragilisticexpialidocious", 60, font, measure)).toEqual(["Supercalifragilisticexpialidocious"]);
    for (const line of lines) expect(line).not.toContain("…");
  });
});

describe("buildLabelMarks", () => {
  it("names the project and every domain with its units line", () => {
    const texts = run(["Payments", "Catalog", "Shipping", "Accounts"]);
    expect(texts.find((t) => t.role === "project")?.text).toBe("Project");
    expect(texts.filter((t) => t.role === "domain").map((t) => t.text).sort()).toEqual(["Accounts", "Catalog", "Payments", "Shipping"]);
    expect(texts.filter((t) => t.role === "units")).toHaveLength(4);
    expect(texts.some((t) => t.text.includes("…"))).toBe(false);
  });

  it("drops the units line before the name when it touches a neighbour", () => {
    const names = Array.from({ length: 24 }, (_, i) => `Domain number ${i}`);
    const texts = run(names);
    expect(texts.filter((t) => t.role === "domain").map((t) => t.id).filter((v, i, a) => a.indexOf(v) === i)).toHaveLength(24);
    expect(texts.filter((t) => t.role === "units").length).toBeLessThan(24);
  });

  it("drops every text whose box leaves the free rect", () => {
    const freeRect = { minX: -1000, minY: -260, maxX: 1000, maxY: 1000 };
    const texts = run(["Payments", "Catalog", "Shipping", "Accounts"], { freeRect });
    expect(texts.some((t) => t.id === "d0")).toBe(false);
    for (const t of texts) {
      expect(t.box.minX).toBeGreaterThanOrEqual(freeRect.minX);
      expect(t.box.minY).toBeGreaterThanOrEqual(freeRect.minY);
      expect(t.box.maxX).toBeLessThanOrEqual(freeRect.maxX);
      expect(t.box.maxY).toBeLessThanOrEqual(freeRect.maxY);
    }
  });

  it("adds the stale count only when evidence is measured", () => {
    const evidence = { measured: true, stateOf: () => "stale" as const, staleByDomain: new Map([["d1", 2]]) };
    const units = run(["Payments", "Catalog", "Shipping", "Accounts"], { evidence }).filter((t) => t.role === "units");
    expect(units.find((t) => t.id === "d1")?.text).toBe("2 capabilities · 5 elements · 2 stale");
    expect(units.find((t) => t.id === "d1")?.parts).toHaveLength(2);
    const unmeasured = run(["Payments", "Catalog", "Shipping", "Accounts"], { evidence: { ...evidence, measured: false } });
    expect(unmeasured.some((t) => t.text.includes("stale"))).toBe(false);
  });

  it("appends each placed box to occupied", () => {
    const occupied: Box[] = [];
    const texts = run(["Payments", "Catalog"], { occupied });
    expect(occupied.length).toBe(texts.length);
  });

  it("leaves units out without labels", () => {
    const { model, scene } = fixture(["Payments"]);
    const block = domainLabelBlock(scene.sectors[0]!, model, null, null, measure, 1, TOKENS);
    expect(block.units).toBeNull();
    expect(run(["Payments"], { labels: null }).some((t) => t.role === "units")).toBe(false);
  });
});
