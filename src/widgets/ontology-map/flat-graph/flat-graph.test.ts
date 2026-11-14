import { readFileSync } from "node:fs";
import { join } from "node:path";

import forceAtlas2 from "graphology-layout-forceatlas2";
import { describe, expect, it, vi } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { buildConnections, groupConnectionsByRole, isContainmentRelation } from "@/entities/knowledge-graph";

import {
  readContainmentTree,
  directRelations,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { readDomainUsage } from "../model/domain-usage";
import { buildDialModel } from "../dial/dial-model";
import { circularDomainOrder } from "../dial/order";
import type { DialLabels, DialModel } from "../dial/types";
import { cachedGraphAttention, inkUnder, resolveGraphAttention } from "./attention";
import { layoutFlatGraph } from "./layout";
import { arcPathInto, crowdShare, emptyArcPath, graphDiscRadiusPx, litLineTrimsInto, zoomGrowth } from "./marks";
import { capabilityLineTurns, openedElements } from "./open";
import { admittedNames, chooseSide, domainTitleBlocks, leaderSegment, linePolylines, nameBlockClear, nameBlockDraws, nameBlockEnd, reachText, segmentCrossesBox, selectedDiscRadius, stepScale, zoomStep, type PlacedName } from "./names";
import { buildFlatGraphScene, claimFlatGraphFolder, flatGraphPins, settleFlatGraph } from "./scene";
import { resolveFlatGraphTokens } from "./tokens";
import type { FlatGraphFrame, FlatGraphLayout } from "./types";

const KINDS = new Set(["project", "domain", "capability", "element"]);
type Node = { id: string; kind: string; title?: string };
type Edge = { from: string; to: string; type: string };

function treeInputOf(nodes: readonly Node[], edges: readonly Edge[]): { treeNodes: TreeInputNode[]; treeEdges: TreeInputEdge[] } {
  const treeNodes: TreeInputNode[] = nodes
    .filter((n) => KINDS.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    kind: isContainmentRelation(e.type) ? "contains" : "depends",
    relationType: e.type,
  }));
  return { treeNodes, treeEdges };
}

function modelOf(nodes: readonly Node[], edges: readonly Edge[]): DialModel {
  const { treeNodes, treeEdges } = treeInputOf(nodes, edges);
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges));
  const elementIds = treeNodes.filter((n) => n.kind === "element").map((n) => n.id);
  return buildDialModel({
    tree, dependencies, flows, elementIds, relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directRelations(treeEdges),
  });
}

function vaultModel(manifest: unknown): DialModel {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  return modelOf(d.nodes as Node[], d.edges as Edge[]);
}

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const TOKENS = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "");
const VAULTS = [
  ["dogfood", vaultModel(dogfoodManifest)],
  ["storefront", vaultModel(storefrontManifest)],
] as const;

function layoutOf(model: DialModel): FlatGraphLayout {
  return layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null);
}

const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} unplaced`,
  more: (n) => `+${n}`,
  ring: () => "",
  reading: () => "",
  settling: () => "",
  linksShown: () => "",
};
const measure = (text: string, font: string) => text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 12) * 0.6;

function namesAt(model: DialModel, layout: FlatGraphLayout, scale: number, focusId: string | null, agentFocusId: string | null = null, elementSpacingPx = TOKENS.paint.elementNameSpacingPx * 2) {
  const attention = cachedGraphAttention(model, focusId, focusId !== null);
  return admittedNames({
    model, layout, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale, growth: 1,
    elementLabel: (id) => id, staleByDomain: null, lit: attention.lit, focusId: attention.focusId, attentionKey: attention.key, agentFocusId,
    selected: attention.selected, named: attention.named, reach: attention.reach, lines: attention.lines,
    discRadius: () => 4, elementSpacingPx, hubCaption: null,
  });
}

/** A selected capability's fan as `namesAt` admits it: each fanned element's anchor in world units. */
function fanAnchors(model: DialModel, layout: FlatGraphLayout, scale: number, focusId: string): Map<string, { x: number; y: number }> {
  const t = TOKENS.paint;
  const step = stepScale(zoomStep(scale, t.zoomStepsPerOctave), t.zoomStepsPerOctave);
  const fan = openedElements(model, layout, focusId, t, selectedDiscRadius(4, t, 1), step, 1);
  const centre = fan ? layout.positions.get(fan.capabilityId)! : null;
  return new Map([...(fan?.offsets ?? [])].map(([id, o]) => [id, { x: centre!.x + o.x / step, y: centre!.y + o.y / step }]));
}

function overlapping(names: readonly PlacedName[], layout: FlatGraphLayout, scale: number, fanned: ReadonlyMap<string, { x: number; y: number }> = new Map()): string[] {
  const pad = TOKENS.paint.namePadPx;
  const boxes = names.map((n) => {
    const at = fanned.get(n.id) ?? layout.positions.get(n.id) ?? { x: 0, y: 0 };
    const x = at.x * scale;
    const y = at.y * scale;
    return { id: `${n.role}:${n.id}`, minX: x + n.box.minX + pad, maxX: x + n.box.maxX - pad, minY: y + n.box.minY + pad, maxY: y + n.box.maxY - pad };
  });
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.minX < b.maxX - 0.5 && b.minX < a.maxX - 0.5 && a.minY < b.maxY - 0.5 && b.minY < a.maxY - 0.5) hits.push(`${a.id} × ${b.id}`);
    }
  }
  return hits;
}

describe("flat graph tokens", () => {
  it("refuses a missing token by name", () => {
    const values = cssValues();
    values.delete("--map-graph-cap-spacing");
    expect(() => resolveFlatGraphTokens((v) => values.get(v) ?? "")).toThrow(/--map-graph-cap-spacing/);
  });
});

describe.each(VAULTS)("flat graph layout: %s", (_, model) => {
  const layout = layoutOf(model);

  it.each([[1700, 900], [1100, 860], [760, 820]])("keeps every capability disc off every domain title in a %ix%i fit", (width, height) => {
    const titles = new Map(model.domains.map((d) => [d.id, { halfWidthPx: 70 + (d.label.length % 5) * 12, topPx: 18, bottomPx: 64 }]));
    const fitted = layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null, { areaPx: { width, height }, titles, capDiscPx: TOKENS.paint.capDiscMaxPx, hubPx: 0 });
    const e = fitted.extent;
    const scale = Math.min(1, width / (e.maxX - e.minX), height / (e.maxY - e.minY));
    const discPx = TOKENS.paint.capDiscMaxPx / scale;
    const hits: string[] = [];
    for (const c of fitted.clusters) {
      const t = titles.get(c.domainId)!;
      const box = { minX: c.centre.x - t.halfWidthPx / scale, maxX: c.centre.x + t.halfWidthPx / scale, minY: c.centre.y + t.topPx / scale, maxY: c.centre.y + t.bottomPx / scale };
      for (const [id, at] of fitted.itemAt) {
        const nx = Math.min(box.maxX, Math.max(box.minX, at.x));
        const ny = Math.min(box.maxY, Math.max(box.minY, at.y));
        if (Math.hypot(at.x - nx, at.y - ny) < discPx) hits.push(`${id} on ${c.domainId}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("leaves no member in the strip between a domain and its title, where the domain's own mark would cover it", () => {
    const title = { halfWidthPx: 90, topPx: 18, bottomPx: 64 };
    const area = { width: 820, height: 560 };
    const titles = new Map(model.domains.map((d) => [d.id, title]));
    const fitted = layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null, { areaPx: area, titles, capDiscPx: TOKENS.paint.capDiscMaxPx, hubPx: 0 });
    const scale = Math.min(1, area.width / (fitted.extent.maxX - fitted.extent.minX), area.height / (fitted.extent.maxY - fitted.extent.minY));
    for (const c of fitted.clusters) {
      for (const item of c.items) {
        const at = fitted.itemAt.get(item.id)!;
        expect(Math.hypot(at.x - c.centre.x, at.y - c.centre.y) * scale, `${item.id} stands clear of ${c.domainId}`).toBeGreaterThan(title.topPx);
      }
    }
  });

  it("rests every caption but the focused domain's when the name rows alone show a larger picture, and keeps that choice through a pinned rebuild", () => {
    const order = circularDomainOrder(model, null).order;
    const input = { model, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif" };
    const frame = (area: { width: number; height: number }): FlatGraphFrame => ({
      areaPx: area, titles: domainTitleBlocks(input), compactTitles: domainTitleBlocks(input, "name"), capDiscPx: TOKENS.paint.capDiscMaxPx, hubPx: 0,
    });
    const captions = (l: FlatGraphLayout, scale: number, focusId: string | null) => namesAt(model, l, scale, focusId).names.filter((n) => n.role === "units").map((n) => n.id);
    const roomy = layoutFlatGraph(model, order, TOKENS.layout, null, frame({ width: 6000, height: 4000 }));
    expect(roomy.compactTitles).toBe(false);
    expect(captions(roomy, 1, null).length).toBe(model.domains.length);

    const widthOf = (l: FlatGraphLayout) => l.extent.maxX - l.extent.minX;
    const fits = [{ width: 1100, height: 650 }, { width: 900, height: 540 }, { width: 760, height: 460 }].map((area) => {
      const tight = frame(area);
      return { tight, compact: layoutFlatGraph(model, order, TOKENS.layout, null, tight), full: layoutFlatGraph(model, order, TOKENS.layout, null, { ...tight, compactTitles: undefined }) };
    });
    const won = fits.find((f) => f.compact.compactTitles && widthOf(f.compact) < widthOf(f.full));
    expect(won, "some laptop-sized area rests the captions for a larger picture").toBeDefined();
    const { tight, compact } = won!;
    const scale = Math.min(1, tight.areaPx!.width / widthOf(compact), tight.areaPx!.height / (compact.extent.maxY - compact.extent.minY));
    expect(captions(compact, scale, null)).toEqual([]);
    const focus = model.domains[0]!.id;
    expect(captions(compact, scale, focus)).toEqual([focus]);

    claimFlatGraphFolder("captions-rest");
    settleFlatGraph(model, compact, "settled", "sans-serif");
    const rebuilt = layoutFlatGraph(model, order, TOKENS.layout, flatGraphPins(model, "sans-serif"), tight);
    claimFlatGraphFolder("captions-rest-done");
    expect(rebuilt.compactTitles, "a pinned rebuild keeps the captions resting").toBe(true);
    expect(captions(rebuilt, scale, null)).toEqual([]);
  });

  it("spreads each member star into the room a wide title reserves, and never past it", () => {
    const wide = { halfWidthPx: 420, topPx: 18, bottomPx: 300 };
    const roomPx = Math.hypot(wide.halfWidthPx, wide.bottomPx);
    const titles = new Map(model.domains.map((d) => [d.id, wide]));
    const area = { width: 4000, height: 2400 };
    const fitted = layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null, { areaPx: area, titles, capDiscPx: TOKENS.paint.capDiscMaxPx, hubPx: 0 });
    const e = fitted.extent;
    const scale = Math.min(1, area.width / (e.maxX - e.minX), area.height / (e.maxY - e.minY));
    const stars = fitted.clusters.filter((c) => c.items.length >= 4);
    expect(stars.length).toBeGreaterThan(0);
    for (const c of stars) {
      const reachPx = Math.max(...c.items.map((it) => Math.hypot(fitted.itemAt.get(it.id)!.x - c.centre.x, fitted.itemAt.get(it.id)!.y - c.centre.y))) * scale;
      expect(reachPx / roomPx, `${c.domainId} reaches into its room`).toBeGreaterThan(0.5);
      expect(c.footprint * scale, `${c.domainId} stays inside its room`).toBeLessThanOrEqual(roomPx * 1.1);
    }
  });

  it("is deterministic", () => {
    const again = layoutOf(model);
    expect([...again.positions]).toEqual([...layout.positions]);
  });

  it("places every concept and keeps it inside the extent", () => {
    const ids = [
      ...(model.projectId ? [model.projectId] : []),
      ...model.domains.map((d) => d.id),
      ...model.capabilityById.keys(),
      ...[...model.capabilityById.values()].flatMap((c) => c.elementIds),
      ...model.domains.flatMap((d) => d.directElementIds),
      ...model.orphanIds,
    ];
    for (const id of ids) {
      const at = layout.positions.get(id);
      expect(at, id).toBeDefined();
      expect(at!.x).toBeGreaterThanOrEqual(layout.extent.minX);
      expect(at!.x).toBeLessThanOrEqual(layout.extent.maxX);
      expect(at!.y).toBeGreaterThanOrEqual(layout.extent.minY);
      expect(at!.y).toBeLessThanOrEqual(layout.extent.maxY);
    }
  });

  it("keeps each capability nearer its own domain than any other", () => {
    for (const cluster of layout.clusters) {
      for (const item of cluster.items.filter((it) => !it.direct)) {
        const at = layout.positions.get(item.id)!;
        const own = Math.hypot(at.x - cluster.centre.x, at.y - cluster.centre.y);
        for (const other of layout.clusters) {
          if (other === cluster) continue;
          expect(Math.hypot(at.x - other.centre.x, at.y - other.centre.y), `${item.id} near ${other.domainId}`).toBeGreaterThan(own);
        }
      }
    }
  });

  it("holds a pinned domain and its capabilities in place", () => {
    const domain = layout.clusters[0]!;
    const cap = domain.items.find((it) => !it.direct)!;
    const pinnedAt = { x: domain.centre.x + 40, y: domain.centre.y - 30 };
    const capAt = { x: pinnedAt.x + 70, y: pinnedAt.y + 10 };
    const pinned = layoutFlatGraph(model, layout.clusters.map((c) => c.domainId), TOKENS.layout, {
      positions: new Map([[domain.domainId, pinnedAt], [cap.id, capAt]]),
      seeds: new Map(),
      compactTitles: false,
    });
    expect(pinned.positions.get(domain.domainId)).toEqual(pinnedAt);
    expect(pinned.positions.get(cap.id)).toEqual(capAt);
  });

  it("admits names without overlap at rest and under a focus", () => {
    for (const scale of [0.5, 1, 2]) expect(overlapping(namesAt(model, layout, scale, null).names, layout, scale)).toEqual([]);
    const cap = layout.clusters[0]!.items.find((it) => !it.direct)!.id;
    const focused = namesAt(model, layout, 1, cap);
    expect(focused.ids.has(cap)).toBe(true);
    expect(overlapping(focused.names, layout, 1)).toEqual([]);
  });

  it("always names the concept an agent is working on, even an element too dense to name", () => {
    const element = layout.clusters.flatMap((c) => c.items.flatMap((it) => it.elementIds))[0]!;
    const admitted = namesAt(model, layout, 0.5, null, element, 0);
    expect(admitted.ids.has(element)).toBe(true);
    expect(namesAt(model, layout, 0.5, null, null, 0).ids.has(element)).toBe(false);
  });

  it("names the agent's element while a domain is pointed at", () => {
    const elements = layout.clusters.flatMap((c) => c.items.flatMap((it) => it.elementIds));
    const unnamed = [...model.domainById.keys()].flatMap((domain) => {
      const attention = cachedGraphAttention(model, domain, false);
      return elements.filter((element) => !admittedNames({
        model, layout, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale: 0.5, growth: 1,
        elementLabel: (id) => id, staleByDomain: null, lit: attention.lit, focusId: domain, attentionKey: attention.key, agentFocusId: element,
        selected: false, named: attention.named, reach: attention.reach, lines: attention.lines, discRadius: () => 4, elementSpacingPx: 0, hubCaption: null,
      }).ids.has(element)).map((element) => `${element} under ${domain}`);
    });
    expect(unnamed).toEqual([]);
  });

  it("keeps every capability name off the project's caption row", () => {
    const perOctave = TOKENS.paint.zoomStepsPerOctave;
    const caption = "Evidence not measured for this project yet";
    for (let step = -10; step <= 4; step += 1) {
      const scale = 2 ** (step / perOctave);
      const attention = cachedGraphAttention(model, null, false);
      const names = admittedNames({
        model, layout, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale, growth: 1,
        elementLabel: (id) => id, staleByDomain: null, lit: attention.lit, focusId: null, attentionKey: attention.key, agentFocusId: null,
        selected: false, named: attention.named, reach: null, lines: attention.lines, discRadius: () => 4,
        elementSpacingPx: 0, hubCaption: caption,
      }).names.filter((n) => n.role !== "element");
      const hub = layout.positions.get(model.projectId!)!;
      const half = measure(caption, `${TOKENS.paint.captionPx}px`) / 2;
      const rowY = 4 + TOKENS.paint.nameGapPx + TOKENS.paint.captionPx / 2;
      const onRow = names.filter((n) => n.role === "capability").filter((n) => {
        const at = layout.positions.get(n.id)!;
        const x = (at.x - hub.x) * scale;
        const y = (at.y - hub.y) * scale;
        return x + n.box.minX < half && x + n.box.maxX > -half && y + n.box.minY < rowY + TOKENS.paint.captionPx / 2 && y + n.box.maxY > rowY - TOKENS.paint.captionPx / 2;
      });
      expect(onRow.map((n) => n.text), `names on the caption row at ${scale}`).toEqual([]);
    }
  });

  it("keeps a resting name through every zoom step in, but for one a domain title passes over", () => {
    const steps = Array.from({ length: 13 }, (_, k) => 2 ** ((k - 8) / TOKENS.paint.zoomStepsPerOctave)).map((s) => namesAt(model, layout, s, null).ids);
    const lost = steps.flatMap((ids, k) => (k === 0 ? [] : [...steps[k - 1]!].filter((id) => !ids.has(id)).map((id) => `${id} at step ${k - 8}`)));
    // Measured: storefront loses checkout at step -4, where its dot passes under its domain's title; dogfood loses none.
    expect(lost.length, lost.join(", ")).toBeLessThanOrEqual(1);
  });
});

describe("attention and discs", () => {
  const model = VAULTS[1][1];

  it("lights a capability's domain and reach and sinks the rest", () => {
    const cap = [...model.capabilityById.keys()].sort()[0]!;
    const attention = cachedGraphAttention(model, cap, true);
    const domain = model.capabilityById.get(cap)!.domainId;
    expect(attention.lit?.has(cap)).toBe(true);
    expect(attention.lit?.has(domain)).toBe(true);
    const outside = model.domains.find((d) => !attention.lit?.has(d.id))!;
    expect(inkUnder(attention, outside.id, TOKENS.paint.sinkInk)).toBe(TOKENS.paint.sinkInk);
    expect(inkUnder(attention, cap, TOKENS.paint.sinkInk)).toBe(1);
  });

  it.each(VAULTS)("names a pointed %s capability's element only once its dot stands clear of the capability's disc", (_name, model) => {
    const layout = layoutOf(model);
    const t = TOKENS.paint;
    let hidden = 0;
    let named = 0;
    for (const cap of model.capabilityById.values()) {
      if (!layout.positions.has(cap.id)) continue;
      const pointed = cachedGraphAttention(model, cap.id, false);
      for (const scale of [0.35, 0.7, 1.4, 2.8]) {
        const ids = admittedNames({
          model, layout, tokens: t, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale, growth: 1,
          elementLabel: (id) => id, staleByDomain: null, lit: pointed.lit, focusId: cap.id, attentionKey: pointed.key, agentFocusId: null,
          selected: false, named: pointed.named, reach: pointed.reach, lines: pointed.lines, discRadius: () => 4, elementSpacingPx: 0, hubCaption: null,
        }).ids;
        const owner = layout.positions.get(cap.id)!;
        for (const id of cap.elementIds) {
          const at = layout.positions.get(id);
          if (!at) continue;
          const clearPx = Math.hypot(at.x - owner.x, at.y - owner.y) * stepScale(zoomStep(scale, t.zoomStepsPerOctave), t.zoomStepsPerOctave) - (4 + 4 + t.nameGapPx);
          if (clearPx < 0) hidden += 1;
          if (ids.has(id)) named += 1;
          if (ids.has(id)) expect(clearPx, `${id} under ${cap.id} at ${scale}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(hidden, "some element dot sits against its pointed capability at the overview").toBeGreaterThan(0);
    expect(named, "elements are named once they stand clear").toBeGreaterThan(0);
  });

  it("keeps the name of a selection's far-end element that sits beside another capability's disc", () => {
    const model = VAULTS[0][1];
    const layout = layoutOf(model);
    const t = TOKENS.paint;
    const scale = stepScale(zoomStep(0.35, t.zoomStepsPerOctave), t.zoomStepsPerOctave);
    let farEndsBesideTheirDisc = 0;
    for (const cap of model.capabilityById.values()) {
      if (!layout.positions.has(cap.id)) continue;
      const lit = cachedGraphAttention(model, cap.id, true).lit!;
      for (const id of namesAt(model, layout, scale, cap.id).ids) {
        const ownerId = model.capabilityOf.get(id);
        const at = layout.positions.get(id);
        const far = ownerId === undefined || ownerId === cap.id ? undefined : layout.positions.get(ownerId);
        if (lit.has(id) && at && far && Math.hypot(at.x - far.x, at.y - far.y) * scale < 4 + 4 + t.nameGapPx) farEndsBesideTheirDisc += 1;
      }
    }
    expect(farEndsBesideTheirDisc).toBeGreaterThan(0);
  });

  it("names at rest at most two capabilities of a star while its discs are folded, and more once they stand apart", () => {
    const domains = ["north", "south", "east", "west", "inner", "outer"];
    const capabilities = domains.flatMap((d) => Array.from({ length: 30 }, (_, c) => `${d}-${c}`));
    const dense = modelOf(
      [{ id: "p", kind: "project" }, ...domains.map((id) => ({ id, kind: "domain" })), ...capabilities.map((id) => ({ id, kind: "capability" }))],
      [...domains.map((d) => ({ from: "p", to: d, type: "contains" })), ...capabilities.map((id) => ({ from: id.split("-")[0]!, to: id, type: "contains" }))],
    );
    const input = { model: dense, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif" };
    const layout = layoutFlatGraph(dense, circularDomainOrder(dense, null).order, TOKENS.layout, null, {
      areaPx: { width: 1000, height: 640 }, titles: domainTitleBlocks(input), compactTitles: domainTitleBlocks(input, "name"), capDiscPx: TOKENS.paint.capDiscMaxPx, hubPx: 0,
    });
    const perOctave = TOKENS.paint.zoomStepsPerOctave;
    const namedIn = (domainId: string, ids: ReadonlySet<string>) => capabilities.filter((id) => id.startsWith(`${domainId}-`) && ids.has(id)).length;
    let foldedStars = 0;
    let openNames = 0;
    let before: ReadonlySet<string> = new Set();
    const lost: string[] = [];
    for (let step = -14; step <= 12; step += 1) {
      const admission = namesAt(dense, layout, 2 ** (step / perOctave), null);
      const ids = admission.ids;
      for (const edge of [-0.45, 0.45]) expect(overlapping(admission.names, layout, 2 ** ((step + edge) / perOctave)).filter((pair) => pair.includes("capability:")), `step ${step} at ${edge}`).toEqual([]);
      lost.push(...[...before].filter((id) => !ids.has(id)).map((id) => `${id} at ${step}`));
      before = ids;
      for (const domainId of domains) {
        if (crowdShare(layout, domainId, TOKENS.paint, 2 ** ((step - 0.5) / perOctave), 1) === 1) openNames = Math.max(openNames, namedIn(domainId, ids));
        else {
          foldedStars += 1;
          expect(namedIn(domainId, ids), `${domainId} at step ${step}`).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(foldedStars).toBeGreaterThan(0);
    expect(openNames, "an open star names more than the folded budget").toBeGreaterThan(2);
    // Measured: of 180 names one, west-5, loses both sides to a title that crosses its anchor at step -11.
    expect(lost.length, `names lost on zooming in: ${lost.join(", ")}`).toBeLessThanOrEqual(1);
  });

  it.each(VAULTS)("shrinks the %s capability discs of a crowded domain until no two overlap, and leaves an open star at full size", (_name, model) => {
    const layout = layoutOf(model);
    const stars = layout.clusters.filter((c) => c.items.filter((it) => !it.direct).length >= 2);
    expect(stars.length).toBeGreaterThan(0);
    for (const c of stars) {
      const caps = c.items.filter((it) => !it.direct);
      expect(crowdShare(layout, c.domainId, TOKENS.paint, 100, 1), `${c.domainId} stands open when zoomed far in`).toBe(1);
      const scale = 0.02;
      const share = crowdShare(layout, c.domainId, TOKENS.paint, scale, 1);
      expect(share, `${c.domainId} is crowded at the far overview`).toBeLessThan(1);
      const radius = (elements: number) => graphDiscRadiusPx("capability", elements, TOKENS.paint, 1) * share;
      for (let i = 0; i < caps.length; i += 1) {
        for (let j = i + 1; j < caps.length; j += 1) {
          const a = layout.positions.get(caps[i]!.id)!;
          const b = layout.positions.get(caps[j]!.id)!;
          expect(Math.hypot(a.x - b.x, a.y - b.y) * scale, `${caps[i]!.id} and ${caps[j]!.id} stand apart`).toBeGreaterThan(radius(caps[i]!.elementIds.length) + radius(caps[j]!.elementIds.length));
        }
      }
    }
  });

  it("grows capability discs with the square root of their element count within the token range", () => {
    const r = (m: number) => graphDiscRadiusPx("capability", m, TOKENS.paint, 1);
    expect(r(0)).toBe(TOKENS.paint.capDiscMinPx);
    expect(r(4)).toBeGreaterThan(r(1));
    expect(r(4) - r(0)).toBeCloseTo(2 * (r(1) - r(0)));
    expect(r(10_000)).toBe(TOKENS.paint.capDiscMaxPx);
  });
});

describe("a selected capability's fan", () => {
  const t = TOKENS.paint;
  const selectedPx = selectedDiscRadius(graphDiscRadiusPx("capability", 0, t, 1), t, 1);
  const clearPx = selectedPx + t.selectedRingGapPx + t.selectedRingPx + t.elementDotPx + t.nameGapPx;

  it.each(VAULTS)("opens every %s capability's elements clear of its ring, a name's spacing apart and below its title", (_name, model) => {
    const layout = layoutOf(model);
    let fans = 0;
    for (const cap of model.capabilityById.values()) {
      const fan = openedElements(model, layout, cap.id, t, selectedPx, 0.35, 1);
      if (!fan) continue;
      fans += 1;
      const at = [...fan.offsets.values()];
      expect(at.length, cap.id).toBe(cap.elementIds.filter((id) => layout.positions.has(id)).length);
      for (const p of at) {
        expect(Math.hypot(p.x, p.y), `${cap.id} keeps off the ring`).toBeGreaterThanOrEqual(clearPx - 1e-6);
        expect(Math.atan2(p.x, -p.y) === 0 || Math.abs(Math.atan2(p.x, -p.y)) >= (69 * Math.PI) / 180, `${cap.id} leaves the title's wedge`).toBe(true);
      }
      for (let i = 0; i < at.length; i += 1) {
        for (let j = i + 1; j < at.length; j += 1) expect(Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y), `${cap.id} elements ${i} and ${j}`).toBeGreaterThan(t.elementNameSpacingPx * 0.85);
      }
    }
    expect(fans).toBeGreaterThan(3);
  });

  it.each(VAULTS)("slides a %s fan so its dots stand off the lines leaving the capability", (_name, model) => {
    const layout = layoutOf(model);
    const turnOf = (p: { x: number; y: number }) => (Math.atan2(p.y, p.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    let fans = 0;
    let onLine = 0;
    for (const cap of model.capabilityById.values()) {
      const fan = openedElements(model, layout, cap.id, t, selectedPx, 0.35, 1);
      const lines = fan ? capabilityLineTurns(model, layout, cap.id, cap.elementIds, t.lineBow) : [];
      if (!fan || lines.length === 0) continue;
      fans += 1;
      const stands = [...fan.offsets.values()].some((p) => lines.some((turn) => {
        const apart = Math.abs(turnOf(p) - turn);
        return Math.min(apart, 2 * Math.PI - apart) < (t.elementDotPx + t.lineTaperMaxPx) / Math.hypot(p.x, p.y) - 1e-9;
      }));
      if (stands) onLine += 1;
    }
    expect(fans).toBeGreaterThan(10);
    // A fan that fills its arc beside many lines has no clear place: 3 of 17 and 1 of 39 with the slide, 5 and 9 without.
    expect(onLine, "fans with a dot on a line").toBeLessThanOrEqual(3);
  });

  it.each(VAULTS)("leaves a %s capability's elements where they are once the zoom shows them apart, and closes without a jump", (_name, model) => {
    const layout = layoutOf(model);
    let widestStepPx = 0;
    let fans = 0;
    for (const cap of model.capabilityById.values()) {
      const centre = layout.positions.get(cap.id);
      if (!centre || cap.elementIds.length < 2) continue;
      fans += 1;
      expect(openedElements(model, layout, cap.id, t, selectedPx, 64, 1), cap.id).toBeNull();
      let before: ReadonlyMap<string, { x: number; y: number }> | null = null;
      // The disc grows with the zoom as the frame grows it, so the fan's radius and spacing move under the sweep.
      for (let k = 0; k <= 400; k += 1) {
        const growth = zoomGrowth(2 ** (k / 50), t);
        const scale = 0.3 * 2 ** (k / 50);
        const fan = openedElements(model, layout, cap.id, t, selectedDiscRadius(graphDiscRadiusPx("capability", 0, t, growth), t, growth), scale, growth);
        const now = new Map(cap.elementIds.filter((id) => layout.positions.has(id)).map((id) => {
          const home = layout.positions.get(id)!;
          return [id, fan?.offsets.get(id) ?? { x: (home.x - centre.x) * scale, y: (home.y - centre.y) * scale }];
        }));
        if (before) for (const [id, p] of now) widestStepPx = Math.max(widestStepPx, Math.hypot(p.x - before.get(id)!.x, p.y - before.get(id)!.y) / Math.max(1, Math.hypot(p.x, p.y) / 40));
        before = now;
      }
    }
    expect(fans).toBeGreaterThan(3);
    // Measured 8.1 px per fiftieth of an octave at most; a fan that jumped along its arc moved 18 to 51 px.
    expect(widestStepPx).toBeLessThan(16);

  });

  it("names a selected capability's fanned elements with no name over another", () => {
    const model = VAULTS[0][1];
    const layout = layoutOf(model);
    const cap = model.capabilityById.get("capability:project-source-binding")!;
    const fanned = namesAt(model, layout, 0.4, cap.id);
    expect(cap.elementIds.filter((id) => fanned.ids.has(id)).length).toBeGreaterThanOrEqual(2);
    const anchors = fanAnchors(model, layout, 0.4, cap.id);
    expect(overlapping(fanned.names.filter((n) => n.role === "element" || n.role === "capability"), layout, 0.4, anchors)).toEqual([]);
  });
});

describe("session memory", () => {
  const derived = deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest);
  const nodes = derived.nodes as Node[];
  const edges = derived.edges as Edge[];

  it("pins nothing measured in another face, so names settling in the product font land on a fresh open's picture", () => {
    const full = modelOf(nodes, edges);
    const frameAt = (charPx: number): FlatGraphFrame => ({
      areaPx: { width: 1600, height: 900 },
      titles: new Map(full.domains.map((d) => [d.id, { halfWidthPx: d.label.length * charPx, topPx: 18, bottomPx: 64 }])),
      capDiscPx: TOKENS.paint.capDiscMaxPx,
      hubPx: 0,
    });
    claimFlatGraphFolder("face-fresh");
    const fresh = buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "product"), frameAt(7)).graph!;
    claimFlatGraphFolder("face-late");
    settleFlatGraph(full, buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "fallback"), frameAt(5)).graph!, "settled", "fallback");
    const late = buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "product"), frameAt(7)).graph!;
    expect([...late.positions]).toEqual([...fresh.positions]);
  });


});

describe("selection reach", () => {
  const nodes: Node[] = [
    { id: "p", kind: "project" }, { id: "d1", kind: "domain" }, { id: "d2", kind: "domain" },
    ...["a", "b", "c", "e", "f", "g"].map((id) => ({ id, kind: "capability" })), { id: "x", kind: "element" }, { id: "y", kind: "element" },
  ];
  const contains = (from: string, to: string): Edge => ({ from, to, type: "contains" });
  const edges: Edge[] = [
    contains("p", "d1"), contains("p", "d2"), contains("d1", "a"), contains("d1", "b"), contains("d1", "c"),
    contains("d2", "e"), contains("d2", "f"), contains("d2", "g"), contains("a", "x"), contains("c", "y"),
    { from: "a", to: "e", type: "depends_on" },
    { from: "e", to: "a", type: "depends_on" },
    { from: "y", to: "a", type: "depends_on" },
    { from: "c", to: "a", type: "depends_on" },
    { from: "b", to: "a", type: "depends_on" },
    { from: "a", to: "b", type: "related_to" },
    { from: "a", to: "g", type: "related_to" },
    { from: "a", to: "f", type: "is_a" },
  ];
  const model = modelOf(nodes, edges);

  it("draws each relation of the focus as its kind, once per far capability and direction", () => {
    const lines = resolveGraphAttention(model, "a", true).lines.map((l) => `${l.kind}:${l.from}>${l.to}`).sort();
    expect(lines).toEqual(["broader:a>f", "neededBy:b>a", "neededBy:c>a", "neededBy:e>a", "neededBy:y>a", "needs:a>e", "relates:a>g"]);
  });

  it("counts and reaches exactly the directed connections the detail panel lists, not its elements' relations", () => {
    const panelOf = (id: string, ns: readonly Node[], es: readonly Edge[]) => {
      const groups = groupConnectionsByRole(buildConnections(id, ns.map((n) => ({ ...n, title: n.title ?? n.id })), es));
      const directed = (rows: typeof groups.dependsOn) => rows.filter((c) => !(c.relationTypes ?? [c.relationType]).every((t) => t === "is_a"));
      return { needs: directed(groups.dependsOn).length, neededBy: directed(groups.usedBy).length, ids: new Set([...groups.dependsOn, ...groups.usedBy, ...groups.related].map((c) => c.id)) };
    };
    const reachOf = (m: DialModel, id: string) => {
      const att = resolveGraphAttention(m, id, true);
      return { needs: att.reach!.needs, neededBy: att.reach!.neededBy, ids: new Set(att.lines.map((l) => (l.from === id ? l.to : l.from))) };
    };
    const panel = panelOf("a", nodes, edges);
    expect({ needs: panel.needs, neededBy: panel.neededBy }).toEqual({ needs: 1, neededBy: 4 });
    expect(reachOf(model, "a"), "a broader concept is drawn but counted by neither side").toEqual({ needs: 1, neededBy: 4, ids: new Set(["b", "c", "e", "f", "g", "y"]) });
    for (const manifest of [dogfoodManifest, storefrontManifest]) {
      const d = deriveOntologyFromVault(manifest as unknown as VaultManifest);
      const vault = modelOf(d.nodes as Node[], d.edges as Edge[]);
      for (const id of vault.capabilityById.keys()) {
        const shown = panelOf(id, d.nodes as Node[], d.edges as Edge[]);
        const drawn = reachOf(vault, id);
        expect({ needs: drawn.needs, neededBy: drawn.neededBy }, id).toEqual({ needs: shown.needs, neededBy: shown.neededBy });
        for (const far of drawn.ids) expect(shown.ids.has(far), `${id} draws ${far}`).toBe(true);
      }
    }
  });

  it("counts distinct concepts on each side of the reach, and an element focus only its own relations", () => {
    expect(resolveGraphAttention(model, "a", true).reach).toEqual({ needs: 1, neededBy: 4 });
    expect(resolveGraphAttention(model, "c", true).reach).toEqual({ needs: 1, neededBy: 0 });
    const lone = resolveGraphAttention(model, "x", true);
    expect([lone.reach, lone.lines.length, [...lone.lit!].sort()]).toEqual([{ needs: 0, neededBy: 0 }, 0, ["a", "d1", "x"]]);
    const element = resolveGraphAttention(model, "y", true);
    expect([element.reach, element.lines.map((l) => l.key)]).toEqual([{ needs: 1, neededBy: 0 }, ["needs:y>a"]]);
  });

  it("writes the reach line without a zero side", () => {
    const labels = { ...LABELS, reachNeeds: (n: number) => `needs ${n}`, reachNeededBy: (n: number) => `needed by ${n}` };
    expect(reachText(labels, { needs: 2, neededBy: 0 })).toBe("needs 2");
    expect(reachText(labels, { needs: 0, neededBy: 0 })).toBeNull();
  });

  it.each(VAULTS)("prints no concept name over another for any selection in the %s vault, leaving out the name that would", (_name, vault) => {
    const layout = layoutOf(vault);
    const overprinted: string[] = [];
    let leftOut = 0;
    let leaders = 0;
    const strayLeaders: string[] = [];
    const struckNames: string[] = [];
    const hoverLeaders: string[] = [];
    for (const at of [0.37, 0.75]) {
      const scale = stepScale(zoomStep(at, TOKENS.paint.zoomStepsPerOctave), TOKENS.paint.zoomStepsPerOctave);
      for (const id of [...vault.capabilityById.keys(), ...vault.capabilityOf.keys()]) {
        const admitted = namesAt(vault, layout, scale, id);
        const concepts = admitted.names.filter((n) => n.role !== "domain" && n.role !== "units" && n.role !== "project");
        const fanned = fanAnchors(vault, layout, scale, id);
        for (const pair of overlapping(concepts, layout, scale, fanned)) overprinted.push(`${id} at ${at}: ${pair}`);
        const mustName = cachedGraphAttention(vault, id, true).named;
        for (const end of mustName) if (vault.capabilityById.has(end) && !admitted.ids.has(end)) leftOut += 1;
        for (const n of concepts) {
          if (!n.leader || fanned.has(n.id)) continue;
          leaders += 1;
          if (!mustName.has(n.id) || n.id === id) strayLeaders.push(`${id} at ${at}: ${n.id}`);
          const mark = layout.positions.get(n.id)!;
          const s = leaderSegment(n, Math.abs(n.dx) - TOKENS.paint.nameGapPx, TOKENS.paint.namePadPx);
          for (const other of admitted.names) {
            if (other === n) continue;
            const p = fanned.get(other.id) ?? layout.positions.get(other.id) ?? { x: 0, y: 0 };
            const pad = TOKENS.paint.namePadPx;
            const glyphs = { minX: p.x * scale + other.box.minX + pad, maxX: p.x * scale + other.box.maxX - pad, minY: p.y * scale + other.box.minY + pad, maxY: p.y * scale + other.box.maxY - pad };
            if (segmentCrossesBox(mark.x * scale + s.x0, mark.y * scale + s.y0, mark.x * scale + s.x1, mark.y * scale + s.y1, glyphs)) struckNames.push(`${id} at ${at}: ${n.id} over ${other.id}`);
          }
        }
        const pointedAt = cachedGraphAttention(vault, id, false);
        const hovered = admittedNames({
          model: vault, layout, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale, growth: 1,
          elementLabel: (of) => of, staleByDomain: null, lit: pointedAt.lit, focusId: id, attentionKey: pointedAt.key, agentFocusId: null,
          selected: false, named: pointedAt.named, reach: pointedAt.reach, lines: pointedAt.lines, discRadius: () => 4, elementSpacingPx: TOKENS.paint.elementNameSpacingPx * 2, hubCaption: null,
        });
        for (const n of hovered.names) if (n.leader) hoverLeaders.push(`${id} at ${at}: ${n.id}`);
      }
    }
    expect(leaders, "some name with no side on its row is set a row off, with a leader").toBeGreaterThan(0);
    expect(strayLeaders, "only a far end's name leaves its row").toEqual([]);
    expect(struckNames, "no leader runs through a name").toEqual([]);
    expect(hoverLeaders, "pointing moves no name off its row").toEqual([]);
    expect(leftOut, "some selection has a capability name with no legible side").toBeGreaterThan(0);
    expect(overprinted).toEqual([]);
  });

  it("draws a leader from its mark's rim to one pad short of the text", () => {
    const name: PlacedName = { id: "x", role: "capability", text: "x", font: "", dx: 12, dy: -16, align: "left", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, leader: true };
    const s = leaderSegment(name, 5, 3);
    expect(Math.hypot(s.x0, s.y0)).toBeCloseTo(5);
    expect(s.x0 / s.y0).toBeCloseTo(12 / -16);
    expect([s.x1, s.y1]).toEqual([9, -16]);
    const left = leaderSegment({ ...name, dx: -12, align: "right" }, 5, 3);
    expect([left.x1, left.y1]).toEqual([-9, -16]);
  });

  it("names every lit endpoint and the selection even at a crowded zoom, and keeps the selection off every domain name", () => {
    const layout = layoutOf(model);
    for (const scale of [0.25, 0.5, 1]) {
      const admitted = namesAt(model, layout, scale, "a", null, 0);
      for (const id of ["a", "b", "c", "e", "f", "g"]) expect(admitted.ids.has(id), `${id} at ${scale}`).toBe(true);
      const boxAt = (n: PlacedName) => {
        const at = layout.positions.get(n.id)!;
        return { minX: at.x * scale + n.box.minX, maxX: at.x * scale + n.box.maxX, minY: at.y * scale + n.box.minY, maxY: at.y * scale + n.box.maxY };
      };
      const titles = admitted.names.filter((n) => n.role === "domain").map(boxAt);
      for (const s of admitted.names.filter((n) => n.id === "a").map(boxAt)) {
        for (const t of titles) expect(s.minX < t.maxX && t.minX < s.maxX && s.minY < t.maxY && t.minY < s.maxY, `selection on a title at ${scale}`).toBe(false);
      }
    }
  });

  it("drops a lit element name with no free side rather than overprint, after the selection and capabilities", () => {
    const elementIds = Array.from({ length: 8 }, (_, k) => `x${k}`);
    const crowded = modelOf(
      [...nodes, ...elementIds.map((id) => ({ id, kind: "element", title: `implementation role ${id}` }))],
      [...edges, ...elementIds.flatMap((id) => [contains("b", id), { from: id, to: "a", type: "depends_on" }])],
    );
    const layout = layoutOf(crowded);
    const scales = [0.25, 0.5, 1, 2];
    const admissions = scales.map((scale) => namesAt(crowded, layout, scale, "a"));
    admissions.forEach((admitted, k) => {
      const scale = scales[k]!;
      expect(admitted.ids.has("a"), `selection at ${scale}`).toBe(true);
      for (const id of ["b", "c", "e", "f", "g"]) expect(admitted.ids.has(id), `capability ${id} at ${scale}`).toBe(true);
      expect(overlapping(admitted.names.filter((n) => n.role !== "domain" && n.role !== "units" && n.role !== "project"), layout, scale, fanAnchors(crowded, layout, scale, "a")), `at ${scale}`).toEqual([]);
    });
    const namedElements = admissions.map((admitted) => elementIds.filter((id) => admitted.ids.has(id)).length);
    expect(namedElements[0], "a crowded zoom drops element names").toBeLessThan(elementIds.length);
    expect(namedElements.at(-1), "a closer zoom names more of them").toBeGreaterThan(namedElements[0]!);
  });
});

describe("a lit element's name beside the selection", () => {
  const contains = (from: string, to: string): Edge => ({ from, to, type: "contains" });
  const label = "implementation role y";
  // `y`, an element of `c`, needs the selected `a`: the selection names it.
  const model = modelOf(
    [
      { id: "p", kind: "project" }, { id: "d1", kind: "domain" }, { id: "d2", kind: "domain" },
      ...["a", "c", "k1", "k2"].map((id) => ({ id, kind: "capability" })), { id: "y", kind: "element", title: label },
    ],
    [
      contains("p", "d1"), contains("p", "d2"), contains("d1", "a"), contains("d1", "c"), contains("d2", "k1"), contains("d2", "k2"),
      contains("c", "y"), { from: "y", to: "a", type: "depends_on" },
    ],
  );
  const attention = resolveGraphAttention(model, "a", true);
  const t = TOKENS.paint;
  const capPx = 6;
  // At scale 1 and growth 1 a world unit is a pixel; `y` sits at the origin.
  const nameW = measure(label, `400 ${t.elementNamePx}px sans-serif`);
  const near = t.elementDotPx + t.nameGapPx - t.namePadPx;
  const half = t.elementNamePx / 2 + t.namePadPx;
  const selectedPx = Math.max(capPx, t.selectedDiscPx);
  const ringedPx = selectedPx + t.selectedRingGapPx + t.selectedRingPx;

  function admitWith(k2: { x: number; y: number }) {
    const positions = new Map([
      ["p", { x: 0, y: -600 }], ["d1", { x: 400, y: 400 }], ["d2", { x: -400, y: 400 }], ["c", { x: 500, y: 500 }], ["y", { x: 0, y: 0 }],
      // Right of `y` only the selection's ring reaches; below, its disc.
      ["a", { x: near + nameW / 2, y: half + (selectedPx + ringedPx) / 2 }],
      ["k1", { x: -(near + nameW), y: 0 }],
      ["k2", k2],
    ]);
    const item = (id: string, domainId: string, elementIds: string[] = []) => ({ id, domainId, direct: false, elementIds });
    const clusters = [
      { domainId: "d1", centre: positions.get("d1")!, footprint: 100, items: [item("a", "d1"), item("c", "d1", ["y"])] },
      { domainId: "d2", centre: positions.get("d2")!, footprint: 100, items: [item("k1", "d2"), item("k2", "d2")] },
    ];
    const layout: FlatGraphLayout = {
      positions, itemAt: new Map(), clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
      orphanIds: [], extent: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 }, compactTitles: false,
    };
    return admittedNames({
      model, layout, tokens: t, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale: 1, growth: 1,
      elementLabel: (id) => (id === "y" ? label : id), staleByDomain: null, lit: attention.lit, focusId: "a", attentionKey: attention.key,
      agentFocusId: null, selected: true, named: attention.named, reach: attention.reach, lines: attention.lines,
      discRadius: (id) => (model.domainById.has(id) ? t.domainDiscPx : capPx), elementSpacingPx: t.elementNameSpacingPx, hubCaption: null,
    }).names.filter((n) => n.id === "y");
  }

  it("names an element with no clear side on another concept's disc, never on the selection's ring or disc", () => {
    expect(attention.named.has("y")).toBe(true);
    const placed = admitWith({ x: 0, y: -(half + capPx + 1) });
    expect(placed).toHaveLength(1);
    const { box } = placed[0]!;
    expect(box.maxX <= 0 || box.maxY <= -near, "left of or above the element, away from the selection").toBe(true);
  });

  it("names it on the one side clear of every disc and the ring", () => {
    const placed = admitWith({ x: -900, y: -900 });
    expect(placed.map((n) => ({ align: n.align, above: n.box.maxY <= -near }))).toEqual([{ align: "center", above: true }]);
  });
});

describe("domain reach", () => {
  const nodes: Node[] = [
    { id: "p", kind: "project" }, ...["d1", "d2", "d3", "d4"].map((id) => ({ id, kind: "domain" })),
    ...["a", "b", "e", "f", "g", "h"].map((id) => ({ id, kind: "capability" })), { id: "z", kind: "element" },
  ];
  const contains = (from: string, to: string): Edge => ({ from, to, type: "contains" });
  const edges: Edge[] = [
    contains("p", "d1"), contains("p", "d2"), contains("p", "d3"), contains("p", "d4"),
    contains("d1", "a"), contains("d1", "b"), contains("d2", "e"), contains("d2", "f"), contains("d3", "g"), contains("d4", "h"), contains("g", "z"),
    { from: "a", to: "e", type: "depends_on" },
    { from: "b", to: "e", type: "depends_on" },
    { from: "e", to: "a", type: "depends_on" },
    { from: "z", to: "a", type: "depends_on" },
    { from: "a", to: "h", type: "related_to" },
  ];
  const model = modelOf(nodes, edges);
  const drawn = (id: string, selected: boolean) =>
    resolveGraphAttention(model, id, selected).lines.map((l) => `${l.kind}:${l.from}>${l.to}x${l.weight}`).sort();

  it("draws one line per partner domain and direction, weighted by the relations between them, and both ways for a two-way pair", () => {
    expect(drawn("d1", true)).toEqual(["neededBy:d2>d1x1", "neededBy:d3>d1x1", "needs:d1>d2x2"]);
    expect(drawn("d1", false)).toEqual(drawn("d1", true));
    expect(drawn("d4", true), "a relates-only pair draws no line").toEqual([]);
  });

  it("lights the partner domains but not their members, and counts domains on each side", () => {
    const att = resolveGraphAttention(model, "d1", true);
    expect(att.reach).toEqual({ needs: 1, neededBy: 2 });
    for (const id of ["d1", "a", "b", "d2", "d3"]) expect(att.lit!.has(id), id).toBe(true);
    for (const id of ["e", "f", "g", "z", "d4", "h"]) expect(att.lit!.has(id), id).toBe(false);
    expect([...att.named].sort()).toEqual(["d1", "d2", "d3"]);
  });

  it("counts exactly the partner domains the detail panel lists, on every bundled vault", () => {
    for (const manifest of [dogfoodManifest, storefrontManifest]) {
      const d = deriveOntologyFromVault(manifest as unknown as VaultManifest);
      const { treeNodes, treeEdges } = treeInputOf(d.nodes as Node[], d.edges as Edge[]);
      const vault = modelOf(d.nodes as Node[], d.edges as Edge[]);
      let partnered = 0;
      for (const id of vault.domainById.keys()) {
        const panel = readDomainUsage(treeNodes, treeEdges, id)!;
        const att = resolveGraphAttention(vault, id, true);
        expect(att.reach, id).toEqual({ needs: panel.needs.length, neededBy: panel.usedBy.length });
        const weights = (kind: "needs" | "neededBy") => att.lines.filter((l) => l.kind === kind).map((l) => `${l.from === id ? l.to : l.from}x${l.weight}`).sort();
        expect(weights("needs"), id).toEqual(panel.needs.map((r) => `${r.domainId}x${r.links}`).sort());
        expect(weights("neededBy"), id).toEqual(panel.usedBy.map((r) => `${r.domainId}x${r.links}`).sort());
        if (att.lines.length > 0) partnered += 1;
      }
      expect(partnered, "the vault has domains with partners").toBeGreaterThan(0);
    }
  });

  it("writes the reach line in the selected domain's caption row only", () => {
    const layout = layoutOf(model);
    const labels = { ...LABELS, reachNeeds: (n: number) => `needs ${n}`, reachNeededBy: (n: number) => `needed by ${n}` };
    const reachLines = (selected: boolean) => {
      const att = resolveGraphAttention(model, "d1", selected);
      return admittedNames({
        model, layout, tokens: TOKENS.paint, labels, measureText: measure, fontFamily: "sans-serif", scale: 1, growth: 1,
        elementLabel: (id) => id, staleByDomain: null, lit: att.lit, focusId: att.focusId, attentionKey: att.key, agentFocusId: null,
        selected, named: att.named, reach: att.reach, lines: att.lines, discRadius: () => 4, elementSpacingPx: 0, hubCaption: null,
      }).names.filter((n) => n.id === "d1" && n.role !== "domain");
    };
    const selected = reachLines(true);
    expect(selected.map((n) => [n.role, n.text])).toEqual([["reach", "needs 1 · needed by 2"]]);
    expect(reachLines(false).map((n) => n.role)).toEqual(["units"]);
    expect(selected[0]!.box, "the reach line takes the caption's row").toEqual(expect.objectContaining({ minY: reachLines(false)[0]!.box.minY }));
  });

  it("reserves each domain's title block wide enough for the reach line its selection writes, on every bundled vault", () => {
    const labels = { ...LABELS, units: (c: number, e: number) => `역량 ${c} · 요소 ${e}`, reachNeeds: (n: number) => `${n}곳이 필요`, reachNeededBy: (n: number) => `${n}곳에서 필요` };
    const wider: string[] = [];
    for (const [name, vault] of VAULTS) {
      const layout = layoutOf(vault);
      const blocks = domainTitleBlocks({ model: vault, tokens: TOKENS.paint, labels, measureText: measure, fontFamily: "sans-serif" });
      for (const id of vault.domainById.keys()) {
        const att = resolveGraphAttention(vault, id, true);
        const row = admittedNames({
          model: vault, layout, tokens: TOKENS.paint, labels, measureText: measure, fontFamily: "sans-serif", scale: 1, growth: 1,
          elementLabel: (of) => of, staleByDomain: null, lit: att.lit, focusId: id, attentionKey: att.key, agentFocusId: null,
          selected: true, named: att.named, reach: att.reach, lines: att.lines, discRadius: () => TOKENS.paint.domainDiscPx, elementSpacingPx: 0, hubCaption: null,
        }).names.find((n) => n.id === id && n.role === "reach");
        if (row && Math.max(-row.box.minX, row.box.maxX) > blocks.get(id)!.halfWidthPx + 1e-6) wider.push(`${name} ${id}: ${row.text}`);
      }
    }
    expect(wider).toEqual([]);
  });

  it("raises a partner domain's title only where it clears every disc, on every bundled vault", () => {
    let raised = 0;
    const onDiscs: string[] = [];
    for (const [name, vault] of VAULTS) {
      const layout = layoutOf(vault);
      const radius = (id: string) => (vault.domainById.has(id) ? graphDiscRadiusPx("domain", 0, TOKENS.paint, 1)
        : graphDiscRadiusPx("capability", vault.capabilityById.get(id)?.elementIds.length ?? 0, TOKENS.paint, 1));
      const discs = layout.clusters.flatMap((c) => [c.domainId, ...c.items.filter((it) => !it.direct).map((it) => it.id)]);
      for (const focus of vault.domainById.keys()) for (const selected of [true, false]) for (const scale of [0.5, 1, 2]) {
        const att = resolveGraphAttention(vault, focus, selected);
        const admitted = admittedNames({
          model: vault, layout, tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale, growth: 1,
          elementLabel: (id) => id, staleByDomain: null, lit: att.lit, focusId: focus, attentionKey: att.key, agentFocusId: null,
          selected, named: att.named, reach: att.reach, lines: att.lines, discRadius: radius, elementSpacingPx: 0, hubCaption: null,
        });
        for (const n of admitted.names.filter((n) => n.id !== focus && vault.domainById.has(n.id) && n.dy < 0)) {
          raised += 1;
          const at = layout.positions.get(n.id)!;
          const box = { minX: at.x * scale + n.box.minX, maxX: at.x * scale + n.box.maxX, minY: at.y * scale + n.box.minY, maxY: at.y * scale + n.box.maxY };
          for (const id of discs) {
            const p = layout.positions.get(id)!;
            const r = radius(id);
            if (box.minX < p.x * scale + r && p.x * scale - r < box.maxX && box.minY < p.y * scale + r && p.y * scale - r < box.maxY) onDiscs.push(`${name} ${focus} ${scale}: ${n.role} of ${n.id} on ${id}`);
          }
        }
      }
    }
    expect(raised, "some partner title rises").toBeGreaterThan(0);
    expect(onDiscs).toEqual([]);
  });
});

describe("domain line curve", () => {
  /** One large domain beside small ones: its member star reaches far enough that a trim scaled only by length passes the bow's control. */
  const SIZES = [40, 1, 1, 6, 6];
  const ELEMENTS_PER_CAPABILITY = 5;
  const DEPENDS: [number, number][] = [[0, 1], [0, 2], [3, 0], [4, 0]];
  const nodes: Node[] = [{ id: "p", kind: "project" }];
  const edges: Edge[] = [];
  SIZES.forEach((size, d) => {
    nodes.push({ id: `d${d}`, kind: "domain" });
    edges.push({ from: "p", to: `d${d}`, type: "contains" });
    for (let c = 0; c < size; c += 1) {
      nodes.push({ id: `c${d}-${c}`, kind: "capability" });
      edges.push({ from: `d${d}`, to: `c${d}-${c}`, type: "contains" });
      for (let e = 0; e < ELEMENTS_PER_CAPABILITY; e += 1) {
        nodes.push({ id: `e${d}-${c}-${e}`, kind: "element" });
        edges.push({ from: `c${d}-${c}`, to: `e${d}-${c}-${e}`, type: "contains" });
      }
    }
  });
  for (const [a, b] of DEPENDS) edges.push({ from: `c${a}-0`, to: `c${b}-0`, type: "depends_on" });
  const model = modelOf(nodes, edges);
  const layout = layoutOf(model);
  const P = TOKENS.paint;
  const fit = Math.min(1100 / (layout.extent.maxX - layout.extent.minX), 880 / (layout.extent.maxY - layout.extent.minY));
  const views = [fit, fit * 3].flatMap((scale) => [1, P.growthMax].map((growth) => ({ scale, growth })));
  const lines = resolveGraphAttention(model, "d0", true).lines;

  it("trims each end of a large star's lines short of the bow's control point, so no curve doubles back", () => {
    expect(lines.length).toBe(DEPENDS.length);
    const trims = new Float64Array(2);
    const path = emptyArcPath();
    for (const { scale, growth } of views) {
      const disc = graphDiscRadiusPx("domain", 0, P, growth);
      for (const line of lines) {
        const from = { x: layout.positions.get(line.from)!.x * scale, y: layout.positions.get(line.from)!.y * scale };
        const to = { x: layout.positions.get(line.to)!.x * scale, y: layout.positions.get(line.to)!.y * scale };
        litLineTrimsInto(trims, layout, line, Math.hypot(to.x - from.x, to.y - from.y), scale, growth, disc, disc, P);
        if (!arcPathInto(path, from, to, P.lineBow, trims[0]!, trims[1]!)) continue;
        const { a, c, b } = path;
        const at = `${line.key} at ${(scale / fit).toFixed(0)}x, growth ${growth}`;
        expect(Math.hypot(a.x - from.x, a.y - from.y), `start before the control: ${at}`).toBeLessThan(Math.hypot(c.x - from.x, c.y - from.y));
        expect(Math.hypot(b.x - to.x, b.y - to.y), `end before the control: ${at}`).toBeLessThan(Math.hypot(c.x - to.x, c.y - to.y));
      }
    }
  });

  it("gives names each line as one forward run from its trimmed start to its trimmed end", () => {
    for (const { scale, growth } of views) {
      const disc = () => graphDiscRadiusPx("domain", 0, P, growth);
      for (const pts of linePolylines(lines, layout, P, scale, growth, disc)) {
        const chord = { x: pts[pts.length - 2]! - pts[0]!, y: pts[pts.length - 1]! - pts[1]! };
        for (let k = 0; k + 3 < pts.length; k += 2) {
          expect((pts[k + 2]! - pts[k]!) * chord.x + (pts[k + 3]! - pts[k + 1]!) * chord.y, `segment ${k / 2} at ${(scale / fit).toFixed(0)}x`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("name sides under lit lines", () => {
  it("takes the first free side no line crosses, in the fixed order, and backs the first free side when every one is crossed", () => {
    const sides = ["right", "left", "below", "above"];
    expect(chooseSide(sides, () => true, (s) => s === "right")).toEqual({ side: "left", backed: false });
    expect(chooseSide(sides, (s) => s !== "left", (s) => s === "right")).toEqual({ side: "below", backed: false });
    expect(chooseSide(sides, (s) => s !== "right", () => true)).toEqual({ side: "left", backed: true });
    expect(chooseSide(sides, () => false, () => false)).toBeNull();
  });

  it("finds a segment that enters a box, and misses one that passes beside it", () => {
    const box = { minX: 0, maxX: 10, minY: 0, maxY: 4 };
    expect(segmentCrossesBox(-5, 2, 15, 2, box)).toBe(true);
    expect(segmentCrossesBox(5, -10, 5, 10, box)).toBe(true);
    expect(segmentCrossesBox(-5, 5, 15, 6, box)).toBe(false);
    expect(segmentCrossesBox(11, 0, 20, 4, box)).toBe(false);
  });

  const hub: Node[] = [
    { id: "p", kind: "project" }, { id: "d", kind: "domain" }, { id: "o", kind: "domain" },
    ...["s", "n1", "n2", "n3", "n4", "n5", "f1", "f2"].map((id) => ({ id, kind: "capability", title: `${id} capability name` })),
  ];
  const hubEdges: Edge[] = [
    { from: "p", to: "d", type: "contains" }, { from: "p", to: "o", type: "contains" },
    ...["s", "n1", "n2", "n3", "n4", "n5"].map((id) => ({ from: "d", to: id, type: "contains" })),
    { from: "o", to: "f1", type: "contains" }, { from: "o", to: "f2", type: "contains" },
    ...["n1", "n2", "n3", "f1"].map((to) => ({ from: "s", to, type: "depends_on" })),
    ...["n4", "n5", "f2"].map((from) => ({ from, to: "s", type: "depends_on" })),
  ];
  const hubModel = modelOf(hub, hubEdges);

  it("keeps every lit name off every lit line unless it draws backed, and the selected name clear of its domain's name", () => {
    const layout = layoutOf(hubModel);
    const lines = resolveGraphAttention(hubModel, "s", true).lines;
    const at = (id: string) => layout.positions.get(id)!;
    for (const scale of [0.5, 1, 1.6]) {
      const admitted = namesAt(hubModel, layout, scale, "s");
      const lit = cachedGraphAttention(hubModel, "s", true).lit!;
      const boxOf = (n: PlacedName) => ({ minX: at(n.id).x * scale + n.box.minX, maxX: at(n.id).x * scale + n.box.maxX, minY: at(n.id).y * scale + n.box.minY, maxY: at(n.id).y * scale + n.box.maxY });
      const crossings = admitted.names.filter((n) => lit.has(n.id) && n.backed !== true).flatMap((n) => {
        const b = boxOf(n);
        return lines.filter((line) => {
          const a = at(line.from);
          const z = at(line.to);
          const cx = (a.x + z.x) / 2 - (z.y - a.y) * TOKENS.paint.lineBow;
          const cy = (a.y + z.y) / 2 + (z.x - a.x) * TOKENS.paint.lineBow;
          const point = (t: number) => ({ x: ((1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * z.x) * scale, y: ((1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * z.y) * scale });
          return Array.from({ length: 48 }, (_, k) => [point(k / 48), point((k + 1) / 48)]).some(([p, q]) => segmentCrossesBox(p!.x, p!.y, q!.x, q!.y, b));
        }).map((line) => `${n.role}:${n.id} × ${line.key} at ${scale}`);
      });
      expect(crossings).toEqual([]);
      const title = boxOf(admitted.names.find((n) => n.role === "domain" && n.id === "d")!);
      const gap = TOKENS.paint.selectedTitleGapPx;
      for (const b of admitted.names.filter((n) => n.id === "s").map(boxOf)) {
        const apart = Math.max(title.minX - b.maxX, b.minX - title.maxX, title.minY - b.maxY, b.minY - title.maxY);
        expect(apart, `selected name to domain name at ${scale}`).toBeGreaterThanOrEqual(gap - 1e-6);
      }
    }
  });
});

describe("names under the map's chrome", () => {
  const model = VAULTS[1][1];
  const names = namesAt(model, layoutOf(model), 1, null).names;
  const at = { x: 400, y: 300 };

  it("hides a domain's name and caption together when either line reaches under a panel's column", () => {
    const from = names.findIndex((n, i) => n.role === "domain" && names[i + 1]?.id === n.id && names[i + 1]!.box.minX !== n.box.minX);
    expect(from, "a domain whose caption and name differ in width").toBeGreaterThanOrEqual(0);
    const to = nameBlockEnd(names, from);
    expect(to - from, "the name and its caption are one block").toBe(2);
    const edge = at.x + (names[from]!.box.minX + names[from + 1]!.box.minX) / 2;
    const column = [{ minX: 0, maxX: edge, minY: 0, maxY: 949 }];
    expect(nameBlockClear(names, from, to, at.x, at.y, column), "one line under the column hides both").toBe(false);
    expect(nameBlockClear(names, from, to, at.x + 200, at.y, column), "clear of it, both draw").toBe(true);
  });

  it("hides a name whose concept sits under the explorer even where its tail reaches the gap before the rail", () => {
    const from = names.findIndex((n) => n.role === "capability" && n.align === "right");
    expect(from).toBeGreaterThanOrEqual(0);
    const name = names[from]!;
    const explorer = [{ minX: 0, maxX: 324, minY: 0, maxY: 949 }];
    // The disc under the explorer's edge, the name's start in the 24 px before the rail.
    const x = 12 - name.box.minX;
    expect(x).toBeLessThan(324);
    expect(nameBlockClear(names, from, nameBlockEnd(names, from), x, at.y, explorer)).toBe(false);
  });

  it("draws the selection's own name under a panel however it was selected, and still hides the other names there", () => {
    const from = names.findIndex((n) => n.role === "capability");
    const to = nameBlockEnd(names, from);
    const id = names[from]!.id;
    const panel = [{ minX: 0, maxX: 2000, minY: 0, maxY: 2000 }];
    expect(nameBlockDraws(names, from, to, at.x, at.y, panel, id), "the selection").toBe(true);
    expect(nameBlockDraws(names, from, to, at.x, at.y, panel, "capability:another"), "another concept selected").toBe(false);
    expect(nameBlockDraws(names, from, to, at.x, at.y, panel, null), "nothing selected").toBe(false);
  });
});

describe("cluster iteration budget", () => {
  it("runs a small cluster at the full iterations and holds a crowded one to that pair work", () => {
    const sizes = [40, 170, 500];
    const nodes: Node[] = [{ id: "project:p", kind: "project" }];
    const edges: Edge[] = [];
    sizes.forEach((size, d) => {
      nodes.push({ id: `domain:${d}`, kind: "domain" });
      edges.push({ from: "project:p", to: `domain:${d}`, type: "contains" });
      for (let c = 0; c < size; c += 1) {
        nodes.push({ id: `capability:${d}-${c}`, kind: "capability" });
        edges.push({ from: `domain:${d}`, to: `capability:${d}-${c}`, type: "contains" });
      }
    });
    const model = modelOf(nodes, edges);
    const assign = vi.spyOn(forceAtlas2, "assign");
    layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null);
    const runs = assign.mock.calls.map(([graph, options]) => ({ bodies: graph.order, iterations: (options as { iterations: number }).iterations }));
    assign.mockRestore();
    const full = TOKENS.layout.capabilityIterations;
    const small = runs.find((run) => run.bodies >= 40 && run.bodies < 64);
    expect(small?.iterations, "the 40-member cluster").toBe(full);
    const crowded = runs.filter((run) => run.bodies >= 170);
    expect(crowded.length).toBe(2);
    const ceiling = full * 64 ** 2;
    for (const run of crowded) expect(run.iterations * run.bodies ** 2, `${run.bodies} bodies`).toBeLessThanOrEqual(ceiling * 1.15);
    for (const run of crowded) expect(run.iterations).toBeGreaterThan(0);
  });
});
