import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
import { assignDomainHues, DOMAIN_HUE_COUNT } from "./hue";
import { layoutFlatGraph } from "./layout";
import { arcPathInto, emptyArcPath, graphDiscRadiusPx, litLineTrimsInto } from "./marks";
import { admittedNames, chooseSide, domainTitleBlocks, linePolylines, nameBlockClear, nameBlockDraws, nameBlockEnd, reachText, segmentCrossesBox, stepScale, zoomStep, type PlacedName } from "./names";
import { buildFlatGraphScene, claimFlatGraphFolder, flatGraphPins, settleFlatGraph } from "./scene";
import { DOMAIN_HUE_VARS, resolveFlatGraphTokens } from "./tokens";
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
    discRadius: () => 4, elementSpacingPx,
  });
}

function overlapping(names: readonly PlacedName[], layout: FlatGraphLayout, scale: number): string[] {
  const pad = TOKENS.paint.namePadPx;
  const boxes = names.map((n) => {
    const at = layout.positions.get(n.id) ?? { x: 0, y: 0 };
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
  it("resolves every token from the stylesheets and names one hue per index", () => {
    expect(TOKENS.inks.hues).toHaveLength(DOMAIN_HUE_COUNT);
    expect(DOMAIN_HUE_VARS).toHaveLength(DOMAIN_HUE_COUNT);
    expect(new Set(TOKENS.inks.hues).size).toBe(DOMAIN_HUE_COUNT);
  });

  it("refuses a missing token by name", () => {
    const values = cssValues();
    values.delete("--map-graph-cap-spacing");
    expect(() => resolveFlatGraphTokens((v) => values.get(v) ?? "")).toThrow(/--map-graph-cap-spacing/);
  });
});

describe("domain hues", () => {
  const ring = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const neighbours = (a: string, b: string) => {
    const d = Math.abs(ring.indexOf(a) - ring.indexOf(b));
    return d === 1 || d === ring.length - 1;
  };

  it("gives adjacent domains different hues past eight domains", () => {
    const hues = assignDomainHues(ring, neighbours, null);
    for (const id of ring) expect(hues.get(id)).toBeLessThan(DOMAIN_HUE_COUNT);
    ring.forEach((id, k) => expect(hues.get(id)).not.toBe(hues.get(ring[(k + 1) % ring.length]!)));
  });

  it("gives eight or fewer domains eight distinct hues while memory holds other domains", () => {
    const eight = ring.slice(0, DOMAIN_HUE_COUNT);
    const hues = assignDomainHues(eight, () => false, new Map([["x", 0], ["y", 3]]));
    expect(new Set(eight.map((id) => hues.get(id))).size).toBe(eight.length);
  });

  it("keeps a remembered hue and gives a new domain the least-used index its neighbours leave free", () => {
    const hues = assignDomainHues(["a", "b", "c"], () => true, new Map([["a", 5], ["c", 0]]));
    expect(hues.get("a")).toBe(5);
    expect(hues.get("c")).toBe(0);
    expect(hues.get("b")).toBe(1);
  });
});

describe.each(VAULTS)("flat graph layout: %s", (_, model) => {
  const layout = layoutOf(model);

  it.each([[1700, 900], [1100, 860], [760, 820]])("keeps every capability disc off every domain title in a %ix%i fit", (width, height) => {
    const titles = new Map(model.domains.map((d) => [d.id, { halfWidthPx: 70 + (d.label.length % 5) * 12, topPx: 18, bottomPx: 64 }]));
    const fitted = layoutFlatGraph(model, circularDomainOrder(model, null).order, TOKENS.layout, null, { areaPx: { width, height }, titles, capDiscPx: TOKENS.paint.capDiscMaxPx });
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

  it("is deterministic", () => {
    const again = layoutOf(model);
    expect([...again.positions]).toEqual([...layout.positions]);
    expect([...again.hueByDomain]).toEqual([...layout.hueByDomain]);
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

  it("gives neighbouring clusters different hues", () => {
    const ids = layout.clusters.map((c) => c.domainId);
    for (let k = 0; k + 1 < ids.length && ids.length <= DOMAIN_HUE_COUNT; k += 1) {
      expect(layout.hueByDomain.get(ids[k]!)).not.toBe(layout.hueByDomain.get(ids[k + 1]!));
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
      hueByDomain: new Map([[domain.domainId, 6]]),
    });
    expect(pinned.positions.get(domain.domainId)).toEqual(pinnedAt);
    expect(pinned.positions.get(cap.id)).toEqual(capAt);
    expect(pinned.hueByDomain.get(domain.domainId)).toBe(6);
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
        selected: false, named: attention.named, reach: attention.reach, lines: attention.lines, discRadius: () => 4, elementSpacingPx: 0,
      }).ids.has(element)).map((element) => `${element} under ${domain}`);
    });
    expect(unnamed).toEqual([]);
  });

  it("only adds names as the zoom grows", () => {
    const steps = [0.5, 0.71, 1, 1.41, 2].map((s) => namesAt(model, layout, s, null).ids);
    for (let k = 1; k < steps.length; k += 1) for (const id of steps[k - 1]!) expect(steps[k]!.has(id), id).toBe(true);
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

  it("grows capability discs with the square root of their element count within the token range", () => {
    const r = (m: number) => graphDiscRadiusPx("capability", m, TOKENS.paint, 1);
    expect(r(0)).toBe(TOKENS.paint.capDiscMinPx);
    expect(r(4)).toBeGreaterThan(r(1));
    expect(r(4) - r(0)).toBeCloseTo(2 * (r(1) - r(0)));
    expect(r(10_000)).toBe(TOKENS.paint.capDiscMaxPx);
  });
});

describe("session memory", () => {
  const derived = deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest);
  const nodes = derived.nodes as Node[];
  const edges = derived.edges as Edge[];
  const partOf = (every: number) => {
    const kept = new Set(nodes.filter((n, i) => (n.kind !== "capability" && n.kind !== "element") || i % every === 0).map((n) => n.id));
    return modelOf(nodes.filter((n) => kept.has(n.id)), edges.filter((e) => kept.has(e.from) && kept.has(e.to)));
  };
  const FACE = "sans-serif";
  const build = (model: DialModel) => buildFlatGraphScene(model, TOKENS.layout, flatGraphPins(model, FACE)).graph!;

  it("pins nothing measured in another face, so names settling in the product font land on a fresh open's picture", () => {
    const full = modelOf(nodes, edges);
    const frameAt = (charPx: number): FlatGraphFrame => ({
      areaPx: { width: 1600, height: 900 },
      titles: new Map(full.domains.map((d) => [d.id, { halfWidthPx: d.label.length * charPx, topPx: 18, bottomPx: 64 }])),
      capDiscPx: TOKENS.paint.capDiscMaxPx,
    });
    claimFlatGraphFolder("face-fresh");
    const fresh = buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "product"), frameAt(7)).graph!;
    claimFlatGraphFolder("face-late");
    settleFlatGraph(full, buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "fallback"), frameAt(5)).graph!, "settled", "fallback");
    const late = buildFlatGraphScene(full, TOKENS.layout, flatGraphPins(full, "product"), frameAt(7)).graph!;
    expect([...late.positions]).toEqual([...fresh.positions]);
    expect([...late.hueByDomain]).toEqual([...fresh.hueByDomain]);
  });

  it("gives every domain its own hue on a one-shot open, a streamed read, and after another folder's memory", () => {
    const bundled = deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest);
    const own = bundled.nodes as Node[];
    const ownEdges = bundled.edges as Edge[];
    const full = modelOf(own, ownEdges);
    const caps = own.filter((n) => n.kind === "capability");
    const half = new Set(own.filter((n) => n.kind !== "capability" || caps.indexOf(n) % 2 === 0).map((n) => n.id));
    const partial = modelOf(own.filter((n) => half.has(n.id)), ownEdges.filter((e) => half.has(e.from) && half.has(e.to)));
    const distinct = (layout: FlatGraphLayout) => new Set(layout.hueByDomain.values()).size;
    claimFlatGraphFolder("distinct-one-shot");
    expect(distinct(build(full))).toBe(full.domains.length);
    claimFlatGraphFolder("distinct-streamed");
    settleFlatGraph(partial, build(partial), "provisional", FACE);
    expect(distinct(build(full))).toBe(full.domains.length);
    claimFlatGraphFolder("distinct-replaced");
    const other = modelOf(nodes, edges);
    settleFlatGraph(other, build(other), "settled", FACE);
    expect(distinct(build(full))).toBe(full.domains.length);
  });

  it("keeps every domain's hue when a changed folder pins no position", () => {
    claimFlatGraphFolder("hues");
    const before = partOf(2);
    const first = build(before);
    settleFlatGraph(before, first, "settled", FACE);
    const after = build(modelOf(nodes, edges));
    for (const [domainId, hue] of first.hueByDomain) expect(after.hueByDomain.get(domainId), domainId).toBe(hue);
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
    for (const at of [0.37, 0.75]) {
      const scale = stepScale(zoomStep(at, TOKENS.paint.zoomStepsPerOctave), TOKENS.paint.zoomStepsPerOctave);
      for (const id of [...vault.capabilityById.keys(), ...vault.capabilityOf.keys()]) {
        const admitted = namesAt(vault, layout, scale, id);
        const concepts = admitted.names.filter((n) => n.role !== "domain" && n.role !== "units" && n.role !== "project");
        for (const pair of overlapping(concepts, layout, scale)) overprinted.push(`${id} at ${at}: ${pair}`);
        for (const end of cachedGraphAttention(vault, id, true).named) if (vault.capabilityById.has(end) && !admitted.ids.has(end)) leftOut += 1;
      }
    }
    expect(leftOut, "some selection has a capability name with no legible side").toBeGreaterThan(0);
    expect(overprinted).toEqual([]);
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
      expect(overlapping(admitted.names.filter((n) => n.role !== "domain" && n.role !== "units" && n.role !== "project"), layout, scale), `at ${scale}`).toEqual([]);
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
      { domainId: "d1", centre: positions.get("d1")!, footprint: 100, hue: 0, items: [item("a", "d1"), item("c", "d1", ["y"])] },
      { domainId: "d2", centre: positions.get("d2")!, footprint: 100, hue: 1, items: [item("k1", "d2"), item("k2", "d2")] },
    ];
    const layout: FlatGraphLayout = {
      positions, itemAt: new Map(), clusters, clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
      hueByDomain: new Map([["d1", 0], ["d2", 1]]), orphanIds: [], extent: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 },
    };
    return admittedNames({
      model, layout, tokens: t, labels: LABELS, measureText: measure, fontFamily: "sans-serif", scale: 1, growth: 1,
      elementLabel: (id) => (id === "y" ? label : id), staleByDomain: null, lit: attention.lit, focusId: "a", attentionKey: attention.key,
      agentFocusId: null, selected: true, named: attention.named, reach: attention.reach, lines: attention.lines,
      discRadius: (id) => (model.domainById.has(id) ? t.domainDiscPx : capPx), elementSpacingPx: t.elementNameSpacingPx,
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
        selected, named: att.named, reach: att.reach, lines: att.lines, discRadius: () => 4, elementSpacingPx: 0,
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
          selected: true, named: att.named, reach: att.reach, lines: att.lines, discRadius: () => TOKENS.paint.domainDiscPx, elementSpacingPx: 0,
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
          selected, named: att.named, reach: att.reach, lines: att.lines, discRadius: radius, elementSpacingPx: 0,
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
