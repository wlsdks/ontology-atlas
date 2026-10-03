import { describe, expect, it } from "vitest";
import { buildLabelMarks, crossesBox, domainLabelBlock, overlaps, wrapDialName, type Circle, type LabelMarksInput, type LabelMarksOut } from "./label-marks";
import type { Box, DialAttention, DialCluster, DialItem, DialLabels, DialModel, DialRing, DialScene, DialTokens, Point } from "./types";

const TOKENS = { nameMaxPx: 160, labelScale: 1.1, pitch: 34, capName: 22, elementName: 26 } as DialTokens;
const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} without a domain`,
  more: (n) => `+${n} more`,
  ring: (min, max) => (max === null ? `used by ${min}+` : `used by ${min}–${max}`),
  reading: (r, t) => `${r}/${t}`,
  settling: () => "settling",
  linksShown: (s, t) => `${s} of ${t}`,
};
const measure = (text: string) => text.length * 6;
const REST: DialAttention = { key: "||", domainId: null, capabilityId: null, needsCaps: new Set(), usedByCaps: new Set(), partnerDomains: new Set(), selected: false };
const WIDE: Box = { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 };

function fixture(names: string[], caps = 0, ring = 300) {
  const capabilities: { id: string; label: string; domainId: string }[] = [];
  const positions = new Map<string, Point>();
  const clusters: DialCluster[] = names.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
    const chip = { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
    const items: DialItem[] = Array.from({ length: caps }, (_, k) => {
      const id = `d${i}c${k}`;
      capabilities.push({ id, label: `Capability ${i}.${k}`, domainId: `d${i}` });
      const a = (k * 2 * Math.PI) / Math.max(1, caps);
      const p = { x: chip.x + Math.cos(a) * 120, y: chip.y + Math.sin(a) * 120 };
      positions.set(id, p);
      const elementIds = [`${id}e0`, `${id}e1`];
      elementIds.forEach((e, j) => positions.set(e, { x: p.x + 6 + j * 10, y: p.y + 14 }));
      return { id, direct: false, x: p.x, y: p.y, elementIds, elementPitch: 10 };
    });
    positions.set(`d${i}`, chip);
    return { domainId: `d${i}`, step: 0, angle, chip, footprint: 140, items };
  });
  const domains = names.map((label, i) => ({ id: `d${i}`, label, capabilityIds: capabilities.filter((c) => c.domainId === `d${i}`).map((c) => c.id), directElementIds: [], elementCount: 5 }));
  const model = {
    projectId: "p", projectLabel: "Project", domains, domainById: new Map(domains.map((d) => [d.id, d])),
    capabilityById: new Map(capabilities.map((c) => [c.id, { ...c, elementIds: [], needsAcross: 0, usedAcross: 0 }])),
  } as unknown as DialModel;
  const rings: DialRing[] = [{ step: 0, min: 2, max: 3, radius: ring }];
  const scene = {
    order: domains.map((d) => d.id), rings, clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
    orphans: { ids: [], centre: { x: 0, y: ring + 120 }, pitch: 5, radius: 20 }, axisAngle: -Math.PI / 4,
    extent: { minX: -ring - 140, minY: -ring - 140, maxX: ring + 140, maxY: ring + 140 }, positions,
  } as unknown as DialScene;
  return { model, scene };
}

interface Run extends Partial<LabelMarksInput> { names?: string[]; caps?: number }

function run({ names = ["Payments", "Catalog", "Shipping", "Accounts"], caps = 0, ...over }: Run = {}) {
  const { model, scene } = fixture(names, caps);
  const inks: string[] = [];
  const chips = new Map<string, Circle>(scene.clusters.map((c) => [c.domainId, { ...c.chip, r: 12 }]));
  const discs = new Map<string, Circle>();
  for (const c of scene.clusters) for (const it of c.items) discs.set(it.id, { x: it.x, y: it.y, r: 4 });
  const input: LabelMarksInput = {
    model, scene, labels: LABELS, evidence: null, attention: REST, tokens: TOKENS,
    inks: { project: "#1", domain: "#2", domainReceded: "#3", domainAttended: "#4", units: "#5", stale: "#6", capability: "#7", needs: "#8", usedBy: "#9", orphans: "#a", ring: "#b", element: "#c", halo: "#d" },
    ink: (c) => { const i = inks.indexOf(c); return i >= 0 ? i : inks.push(c) - 1; },
    measureText: measure, scale: 1, toScreen: (x, y) => ({ x, y }),
    hub: { x: 0, y: 0, r: 20 }, chips, discs, capAlpha: caps > 0 ? 1 : 0, lines: [], occupied: [], freeRect: WIDE, ledgerIds: new Set(),
    elementLabel: (id) => `el ${id}`,
    ...over,
  };
  const out: LabelMarksOut = { texts: [], extraTexts: [] };
  buildLabelMarks(input, out);
  return { ...out, all: [...out.texts, ...out.extraTexts] };
}

function overlapCount(texts: { id: string | null; box: Box }[]): number {
  let n = 0;
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (a.id !== null && a.id === b.id) continue;
      if (overlaps(a.box, b.box)) n += 1;
    }
  }
  return n;
}

describe("wrapDialName", () => {
  it("keeps words whole, never adds an ellipsis, and stays within two lines", () => {
    expect(wrapDialName("Payments", 160, "x", measure)).toEqual(["Payments"]);
    const lines = wrapDialName("Order fulfilment and warehouse routing service", 160, "x", measure);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(" ")).toBe("Order fulfilment and warehouse routing service");
    expect(wrapDialName("Supercalifragilisticexpialidocious", 60, "x", measure)).toEqual(["Supercalifragilisticexpialidocious"]);
    for (const line of lines) expect(line).not.toContain("…");
  });
});

describe("buildLabelMarks", () => {
  it("names the project and every domain with its units line, whole", () => {
    const { texts } = run();
    expect(texts.find((t) => t.role === "project")?.text).toBe("Project");
    expect(texts.filter((t) => t.role === "domain").map((t) => t.text).sort()).toEqual(["Accounts", "Catalog", "Payments", "Shipping"]);
    expect(texts.filter((t) => t.role === "units")).toHaveLength(4);
    expect(texts.some((t) => t.text.includes("…"))).toBe(false);
  });

  it("moves the project name off a stroke under the hub, and never lays it on one", () => {
    const under = [{ x: -200, y: 33 }, { x: 200, y: 33 }];
    const project = run({ lines: [under] }).texts.find((t) => t.role === "project")!;
    expect(project.box.maxY < 33 || project.box.minY > 33).toBe(true);
    const hatched = Array.from({ length: 41 }, (_, i) => [{ x: -400, y: -240 + i * 12 }, { x: 400, y: -240 + i * 12 }]);
    expect(run({ lines: hatched }).texts.some((t) => t.role === "project")).toBe(false);
  });

  it("keeps domain names clear of the hub", () => {
    const { texts } = run();
    for (const t of texts.filter((x) => x.role === "domain" || x.role === "units")) {
      const nx = Math.max(t.box.minX, Math.min(0, t.box.maxX));
      const ny = Math.max(t.box.minY, Math.min(0, t.box.maxY));
      expect(Math.hypot(nx, ny)).toBeGreaterThan(20 + 14 - 1);
    }
  });

  it("drops the units line before the name when crowded, and nothing overlaps", () => {
    const names = Array.from({ length: 24 }, (_, i) => `Domain ${i}`);
    const { texts, all } = run({ names });
    expect(new Set(texts.filter((t) => t.role === "domain").map((t) => t.id)).size).toBe(24);
    expect(texts.filter((t) => t.role === "units").length).toBeLessThan(24);
    expect(overlapCount(all)).toBe(0);
  });

  it("steps to another candidate to stay clear of a planned line", () => {
    const lines: Point[][] = [[{ x: -40, y: -300 }, { x: 40, y: -370 }, { x: 40, y: -420 }, { x: -40, y: -420 }]];
    const { texts } = run({ lines });
    for (const t of texts.filter((x) => x.role === "domain" || x.role === "units")) expect(crossesBox(lines, t.box)).toBe(false);
    expect(texts.some((t) => t.id === "d0" && t.role === "domain")).toBe(true);
  });

  it("keeps the name over a line only when every candidate crosses one, units yielding first", () => {
    const lines: Point[][] = [];
    for (let y = -460; y <= -200; y += 6) lines.push([{ x: -300, y }, { x: 300, y }]);
    const { texts } = run({ lines });
    expect(texts.some((t) => t.id === "d0" && t.role === "domain")).toBe(true);
    expect(texts.some((t) => t.id === "d0" && t.role === "units")).toBe(false);
  });

  it("drops every text whose box leaves the free rect", () => {
    const freeRect = { minX: -1000, minY: -250, maxX: 1000, maxY: 1000 };
    const { all } = run({ freeRect });
    expect(all.some((t) => t.id === "d0")).toBe(false);
    for (const t of all) {
      expect(t.box.minX).toBeGreaterThanOrEqual(freeRect.minX);
      expect(t.box.minY).toBeGreaterThanOrEqual(freeRect.minY);
      expect(t.box.maxX).toBeLessThanOrEqual(freeRect.maxX);
      expect(t.box.maxY).toBeLessThanOrEqual(freeRect.maxY);
    }
  });

  it("adds the stale count only when evidence is measured", () => {
    const evidence = { measured: true, stateOf: () => "stale" as const, staleByDomain: new Map([["d1", 2]]) };
    const units = run({ evidence }).texts.filter((t) => t.role === "units");
    expect(units.find((t) => t.id === "d1")?.text).toBe("0 capabilities · 5 elements · 2 stale");
    expect(units.find((t) => t.id === "d1")?.parts).toHaveLength(2);
    expect(run({ evidence: { ...evidence, measured: false } }).texts.some((t) => t.text.includes("stale"))).toBe(false);
  });

  it("appends each placed box to occupied", () => {
    const occupied: Box[] = [];
    const { all } = run({ occupied });
    expect(occupied.length).toBe(all.length);
  });

  it("leaves units and ring labels out without labels", () => {
    const { model } = fixture(["Payments"]);
    expect(domainLabelBlock("d0", model, null, null, measure, TOKENS).units).toBeNull();
    const { all } = run({ labels: null });
    expect(all.some((t) => t.role === "units" || t.role === "ring")).toBe(false);
  });

  it("labels a ring near its axis with a halo, clear of names", () => {
    const { extraTexts } = run();
    const ring = extraTexts.find((t) => t.role === "ring");
    expect(ring?.text).toBe("used by 2–3");
    expect(ring?.halo).not.toBeNull();
    expect(Math.abs(Math.atan2(ring!.y, ring!.x) - -Math.PI / 4)).toBeLessThan(1);
  });

  it("leaves the ring label out when every slot on its axis crosses a line", () => {
    const lines: Point[][] = [];
    for (let y = -600; y <= 600; y += 5) lines.push([{ x: -600, y }, { x: 600, y }]);
    expect(run({ lines }).extraTexts.some((t) => t.role === "ring")).toBe(false);
  });

  it("names capabilities only from cap-name px of pitch, skipping the ledger", () => {
    expect(run({ caps: 3, scale: 0.5 }).texts.some((t) => t.role === "capability")).toBe(false);
    expect(run({ caps: 3 }).texts.filter((t) => t.role === "capability").length).toBeGreaterThan(0);
    expect(run({ caps: 3, ledgerIds: new Set(["d0c0"]) }).texts.some((t) => t.id === "d0c0")).toBe(false);
  });

  it("keeps capability names clear of lines when another side is free", () => {
    const lines: Point[][] = [[{ x: 124, y: -300 }, { x: 240, y: -300 }]];
    const cap = run({ caps: 1, lines, names: ["Payments"] }).texts.find((t) => t.id === "d0c0");
    expect(cap).toBeDefined();
    expect(crossesBox(lines, cap!.box)).toBe(false);
  });

  it("names the attended domain's partners and leaves other domains' capabilities unnamed", () => {
    const attention: DialAttention = { ...REST, key: "d0||1", domainId: "d0", usedByCaps: new Set(["d1c0", "d1c1"]), partnerDomains: new Set(["d1"]) };
    const caps = run({ caps: 2, attention }).texts.filter((t) => t.role === "capability").map((t) => t.id);
    expect(caps.some((id) => id?.startsWith("d1"))).toBe(true);
    expect(caps.some((id) => id?.startsWith("d2") || id?.startsWith("d3"))).toBe(false);
  });

  it("names elements from element-name px of element pitch", () => {
    expect(run({ caps: 2 }).extraTexts.some((t) => t.role === "element")).toBe(false);
    const zoomed = run({ caps: 2, scale: 3, toScreen: (x, y) => ({ x: x * 3, y: y * 3 }), names: ["Payments"] });
    expect(zoomed.extraTexts.some((t) => t.role === "element")).toBe(true);
  });

  it("places no two texts over each other with capabilities shown", () => {
    const { all } = run({ caps: 6, names: Array.from({ length: 12 }, (_, i) => `Domain ${i}`) });
    expect(all.length).toBeGreaterThan(12);
    expect(overlapCount(all)).toBe(0);
    expect(all.some((t) => t.text.includes("…"))).toBe(false);
  });
});
