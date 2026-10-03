import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../model/containment-tree";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, dialEvidenceView, resolveDialAttention } from "../dial-model";
import { mixOver, resolveDialInks } from "../ink";
import { buildDialMarks, dialChipRadiusPx, dialDiscRadiusPx, dialHubRadiusPx, emptyDialFrameMarks, type DialDisclosureInput, type DialMarksInput } from "./marks";
import { resolveDialDisclosure } from "./disclosure";
import { resolveDialTokens } from "../tokens";
import type { DialCluster, DialEvidence, DialItem, DialLabels, DialModel, DialScene, Point } from "../types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));

const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", egoRestAlpha: 0.32, radiusProject: 22, cameraMaxZoomRatio: 3.2,
} as unknown as OntologyMapTokens;
const INKS = resolveDialInks(MAP, TOKENS);

const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} loose`, more: (n) => `+${n} more`,
  ring: (min, max) => (max === null ? `${min}+` : `${min}–${max}`), reading: (r, t) => `${r}/${t}`, settling: () => "settling", linksShown: (s, t) => `${s} of ${t}`,
};

const DOMAINS = 9;
const RING = 300;
const CAP_OFFSET = 40;

function modelOf(caps = 2, relates: readonly [string, string][] = []): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contains = (s: string, t: string) => edges.push({ source: s, target: t, kind: "contains", relationType: "contains" });
  for (let d = 0; d < DOMAINS; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    contains("p", `d${d}`);
    for (let c = 0; c < caps; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `Capability ${d}.${c}`, kind: "capability" });
      contains(`d${d}`, `d${d}c${c}`);
      for (let e = 0; e < 3; e += 1) {
        nodes.push({ id: `d${d}c${c}e${e}`, label: `El ${d}.${c}.${e}`, kind: "element" });
        contains(`d${d}c${c}`, `d${d}c${c}e${e}`);
      }
    }
  }
  for (let d = 0; d < DOMAINS; d += 1) edges.push({ source: `d${d}c0`, target: `d${(d + 1) % DOMAINS}c1`, kind: "depends", relationType: "depends_on" });
  for (const [s, t] of relates) edges.push({ source: s, target: t, kind: "depends", relationType: "related_to" });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)),
    elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id), relates: rollRelatesCapabilityPairs(tree, edges),
  });
}

function sceneOf(model: DialModel, capOffset = CAP_OFFSET): DialScene {
  const positions = new Map<string, Point>([["p", { x: 0, y: 0 }]]);
  const clusters: DialCluster[] = model.domains.map((d, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / DOMAINS;
    const chip = { x: Math.cos(angle) * RING, y: Math.sin(angle) * RING };
    positions.set(d.id, chip);
    const items: DialItem[] = d.capabilityIds.map((id, k) => {
      const a = angle + (k * 2 * Math.PI) / d.capabilityIds.length;
      const p = { x: chip.x + Math.cos(a) * capOffset, y: chip.y + Math.sin(a) * capOffset };
      positions.set(id, p);
      const elementIds = model.capabilityById.get(id)!.elementIds;
      elementIds.forEach((el, j) => positions.set(el, { x: p.x + 8 * Math.cos(j * 2.1), y: p.y + 8 * Math.sin(j * 2.1) }));
      return { id, direct: false, x: p.x, y: p.y, elementIds, elementPitch: 8 };
    });
    return { domainId: d.id, step: 0, angle, chip, footprint: capOffset + 10, items };
  });
  const itemById = new Map<string, DialItem>();
  for (const c of clusters) for (const it of c.items) itemById.set(it.id, it);
  return {
    order: model.domains.map((d) => d.id), rings: [{ step: 0, min: 0, max: 1, radius: RING }],
    clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])), itemById,
    orphans: { ids: [], centre: { x: 0, y: 0 }, pitch: 1, radius: 0 }, axisAngle: -2.4, extent: { minX: -RING, minY: -RING, maxX: RING, maxY: RING },
    positions, medianElementPitch: 8, memory: { order: [], radiusByStep: new Map(), angleById: new Map(), itemOrder: new Map() },
  };
}

interface RunOptions {
  scale?: number;
  focusId?: string | null;
  evidence?: Map<string, DialEvidence> | null;
  caps?: number;
  capOffset?: number;
  centre?: Point;
  disclosure?: Partial<DialDisclosureInput>;
  appearOf?: (id: string) => number;
  relates?: [string, string][];
  hoverId?: string | null;
}

function run(o: RunOptions = {}) {
  const model = modelOf(o.caps ?? 2, o.relates);
  const scene = sceneOf(model, o.capOffset);
  const scale = o.scale ?? 1;
  const centre = o.centre ?? { x: 500, y: 400 };
  const toScreen = (x: number, y: number) => ({ x: centre.x + x * scale, y: centre.y + y * scale });
  const input: DialMarksInput = {
    model, scene, tokens: TOKENS, mapTokens: MAP, inks: INKS, labels: LABELS,
    evidence: o.evidence === undefined ? null : dialEvidenceView(model, o.evidence),
    attention: resolveDialAttention(model, o.hoverId ?? null, o.focusId ?? null), previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: 1, labelScale: 1, viewportWidth: 1000, viewportHeight: 800, freeRect: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    appearOf: o.appearOf ?? (() => 1), measureText: (text) => text.length * 6, elementLabel: (id) => id,
    hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    disclosure: { ...resolveDialDisclosure(model, scene, { scale, viewportWidth: 1000, viewportHeight: 800, toScreen }, { minX: 0, minY: 0, maxX: 1000, maxY: 800 }, resolveDialAttention(model, o.hoverId ?? null, o.focusId ?? null), TOKENS), ...o.disclosure },
  };
  const out = emptyDialFrameMarks();
  const result = buildDialMarks(input, out);
  return { model, scene, out, result, input };
}

describe("buildDialMarks", () => {
  it("culls clusters off the viewport: no chip, no disc, alpha 0", () => {
    const { out, result, model } = run({ scale: 1, centre: { x: 500, y: 1050 } });
    const chips = out.glyphs.filter((g) => g.kind === "domain").map((g) => g.id);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThan(DOMAINS);
    for (const d of model.domains) {
      if (chips.includes(d.id)) continue;
      expect(result.alphas.get(d.id)).toBe(0);
      expect(out.discs.some((x) => d.capabilityIds.includes(x.id))).toBe(false);
    }
    for (const g of out.glyphs) expect(g.y + g.r).toBeGreaterThanOrEqual(0);
  });

  it("sizes discs by pitch and elements, and scales them by disclosure and appear", () => {
    expect(dialDiscRadiusPx(TOKENS, 0.1, 0)).toBeCloseTo(Math.min(3.4 * 0.32, 2.6 * 0.8));
    expect(dialDiscRadiusPx(TOKENS, 1, 9)).toBeCloseTo(Math.min(34 * 0.32, 6.8 * 1.4));
    expect(dialDiscRadiusPx(TOKENS, 4, 100)).toBeCloseTo(Math.min(136 * 0.32, 7 * 1.4));
    expect(dialChipRadiusPx(TOKENS, 4, 16)).toBeCloseTo(8 + 9 * 0.5);
    expect(dialHubRadiusPx(TOKENS, MAP, 0.1)).toBe(14);
    expect(dialHubRadiusPx(TOKENS, MAP, 10)).toBe(34);

    const full = run().out.discs[0]!;
    const half = run({ disclosure: { capAlpha: 0.5 } }).out.discs[0]!;
    expect(half.r / full.r).toBeCloseTo(0.8);
    const appearing = run({ appearOf: (id) => (id === "d0" ? 0.5 : 1) });
    const chip = appearing.out.glyphs.find((g) => g.id === "d0")!;
    expect(chip.r).toBeCloseTo(dialChipRadiusPx(TOKENS, 2, 2) * 0.5);
    expect(appearing.out.discs.find((d) => d.id === "d0c1")!.r).toBeCloseTo(full.r * 0.5);
  });

  it("draws elements only past their threshold, and the tier follows", () => {
    const rest = run({ scale: 1 });
    expect(rest.out.squares).toHaveLength(0);
    expect(rest.result.tier).toBe("circuit");
    expect(rest.result.drawnCount).toBe(1 + DOMAINS + DOMAINS * 2);

    const near = run({ scale: 2, centre: { x: 500, y: 1000 } });
    const squares = near.out.squares.filter((q) => q.id !== null);
    expect(squares.length).toBeGreaterThan(0);
    expect(near.result.tier).toBe("element");
    const chips = near.out.glyphs.filter((g) => g.kind === "domain").length;
    const discs = near.out.discs.length;
    expect(near.result.drawnCount).toBe(1 + chips + discs + squares.length);
    for (const q of squares) expect(near.result.alphas.get(q.id!)).toBe(1);
  });

  it("draws element squares only in the entered domain and for the attended capability", () => {
    const domainOfSquare = (id: string) => id.slice(0, id.indexOf("c"));
    const near = run({ scale: 2, centre: { x: 500, y: 1000 } });
    const entered = near.input.disclosure.entered;
    expect(entered).not.toBeNull();
    const ids = near.out.squares.filter((q) => q.id !== null).map((q) => q.id!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => domainOfSquare(id) !== entered)).toEqual([]);
    const other = near.out.glyphs.find((g) => g.kind === "domain" && g.id !== entered)!.id;
    const focused = run({ scale: 2, centre: { x: 500, y: 1000 }, focusId: `${other}c0`, disclosure: { entered } });
    const focusedIds = focused.out.squares.filter((q) => q.id !== null).map((q) => q.id!);
    expect(focusedIds.filter((id) => id.startsWith(`${other}c0e`)).length).toBeGreaterThan(0);
    expect(focusedIds.filter((id) => domainOfSquare(id) !== entered && !id.startsWith(`${other}c0e`))).toEqual([]);
  });

  it("uses the glyph only for the hub, the chips and the attended capability", () => {
    const idle = run();
    expect(idle.out.glyphs.map((g) => g.kind).sort()).toEqual(["project", ...Array(DOMAINS).fill("domain")].sort());
    const focused = run({ focusId: "d3c1" });
    const caps = focused.out.glyphs.filter((g) => g.kind === "capability");
    expect(caps.map((g) => g.id)).toEqual(["d3c1"]);
    expect(caps[0]!.egoState).toBe("center");
    expect(focused.out.discs.some((d) => d.id === "d3c1")).toBe(false);
  });

  it("shows the ledger only when in-place names leave some unnamed below reach-cap", () => {
    const crowded = run({ caps: 14, capOffset: 22, scale: 1, focusId: "d0" });
    expect(crowded.result.ledger).not.toBeNull();
    const rows = crowded.out.texts.filter((t) => t.role === "ledger");
    expect(rows.length).toBeGreaterThan(0);
    expect(crowded.result.rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(crowded.out.leaders).toHaveLength(rows.length);
    expect(crowded.result.ledger!.leaderCrossings).toBe(0);
    expect(crowded.out.texts.some((t) => t.role === "capability" && t.id?.startsWith("d0c"))).toBe(false);

    const roomy = run({ caps: 14, capOffset: 22, scale: 3, focusId: "d0", centre: { x: 500, y: 1300 } });
    expect(TOKENS.pitch * 3).toBeGreaterThanOrEqual(TOKENS.reachCap);
    expect(roomy.result.ledger).toBeNull();
    expect(roomy.out.leaders).toHaveLength(0);
  });

  it("gives drawn marks alpha 1, receded ones the rest alpha, absent ones 0", () => {
    const { result, model } = run({ focusId: "d0" });
    expect(result.alphas.get("d0")).toBe(1);
    const partners = resolveDialAttention(model, null, "d0").partnerDomains;
    for (const d of model.domains) {
      if (d.id === "d0") continue;
      expect(result.alphas.get(d.id)).toBe(partners.has(d.id) ? 1 : MAP.egoRestAlpha);
    }
    expect(result.alphas.get("d4c0")).toBe(MAP.egoRestAlpha);
    expect(result.alphas.get("d0c0")).toBe(1);
    const far = run({ scale: 0.15 });
    expect(far.out.discs).toHaveLength(0);
    expect(far.result.alphas.get("d0c0")).toBeUndefined();
  });

  it("recedes a focused capability's siblings to the rest alpha and keeps its partners", () => {
    const { result, out } = run({ focusId: "d3c1" });
    expect(result.alphas.get("d3c1")).toBe(1);
    expect(result.alphas.get("d2c0")).toBe(1);
    expect(result.alphas.get("d3c0")).toBe(MAP.egoRestAlpha);
    expect(result.alphas.get("d3")).toBe(1);
    const sibling = out.discs.find((d) => d.id === "d3c0")!;
    const partner = out.discs.find((d) => d.id === "d2c0")!;
    expect(out.inks[sibling.rim]).toBe(mixOver(INKS.capabilityReceded, INKS.bg, 1));
    expect(out.inks[partner.rim]).toBe(INKS.usedBy);
  });

  it("names a focused capability's partners in the ledger column below the name pitch, and in place above it", () => {
    const partnerIds = ["d2c0", "d6c0"];
    const placed = (r: ReturnType<typeof run>, role: string) => r.out.texts.filter((t) => t.role === role && partnerIds.includes(t.id ?? "")).map((t) => t.id).sort();
    expect(TOKENS.pitch * 0.5).toBeLessThan(TOKENS.capName);
    const below = run({ focusId: "d3c1", scale: 0.5, relates: [["d3c1", "d6c0"]] });
    expect(placed(below, "ledger")).toEqual(partnerIds);
    expect(placed(below, "capability")).toEqual([]);
    expect(below.result.ledger?.leaderCrossings).toBe(0);
    expect(below.result.rows.map((r) => r.id).sort()).toEqual(partnerIds);
    const above = run({ focusId: "d3c1", scale: 1, relates: [["d3c1", "d6c0"]] });
    expect(placed(above, "capability")).toEqual(partnerIds);
    expect(placed(above, "ledger")).toEqual([]);
    const hovered = run({ hoverId: "d3c1", scale: 0.5, relates: [["d3c1", "d6c0"]] });
    expect(hovered.out.texts.filter((t) => t.role === "ledger")).toEqual([]);
  });

  it("keeps a focused capability's relates neighbours lit, in its domain or another, while siblings recede", () => {
    const { result, out } = run({ caps: 3, focusId: "d3c1", relates: [["d3c2", "d3c1"], ["d3c1", "d5c0e1"]] });
    expect(result.alphas.get("d3c2")).toBe(1);
    expect(result.alphas.get("d5c0")).toBe(1);
    expect(result.alphas.get("d5")).toBe(1);
    expect(result.alphas.get("d3c0")).toBe(MAP.egoRestAlpha);
    expect(result.alphas.get("d6c0")).toBe(MAP.egoRestAlpha);
    const related = out.discs.find((d) => d.id === "d3c2")!;
    expect(out.inks[related.rim]).toBe(mixOver(INKS.capabilityRim, INKS.bg, 1));
  });

  it("colours rims by evidence only when evidence is measured", () => {
    const states = new Map<string, DialEvidence>();
    for (let d = 0; d < DOMAINS; d += 1) for (let c = 0; c < 2; c += 1) states.set(`d${d}c${c}`, "current");
    states.set("d2c0", "stale");
    states.set("d2c1", "unknown");
    const unmeasured = run({ evidence: null });
    const rimOf = (r: ReturnType<typeof run>, id: string) => r.out.inks[r.out.discs.find((d) => d.id === id)!.rim];
    expect(rimOf(unmeasured, "d2c0")).toBe(rimOf(unmeasured, "d5c0"));
    expect(unmeasured.out.discs.every((d) => !d.dashed)).toBe(true);
    const measured = run({ evidence: states });
    expect(rimOf(measured, "d2c0")).toBe(mixOver(INKS.stale, INKS.bg, 1));
    expect(measured.out.discs.find((d) => d.id === "d2c1")!.dashed).toBe(true);
    expect(rimOf(measured, "d5c0")).toBe(rimOf(unmeasured, "d5c0"));
  });

  it("stands one plate per drawn domain while the plate alpha holds, and none after", () => {
    const far = run({ scale: 0.2, capOffset: 200 });
    expect(far.out.plates).toHaveLength(DOMAINS);
    expect(new Set(far.out.plates.map((p) => `${p.fill}|${p.rim}`)).size).toBe(1);
    expect(run({ scale: 1 }).out.plates).toHaveLength(0);
  });
});
