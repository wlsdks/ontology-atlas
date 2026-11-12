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
  directCapabilityRelations,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { buildDialModel } from "../dial/dial-model";
import { circularDomainOrder } from "../dial/order";
import type { DialLabels, DialModel } from "../dial/types";
import { selectionNudgeTarget } from "../model/camera/flat-selection-camera";
import { cachedGraphAttention, graphInkMix, inkUnder, resolveGraphAttention, transitionShare, type GraphTransition } from "./attention";
import { assignDomainHues, DOMAIN_HUE_COUNT } from "./hue";
import { layoutFlatGraph } from "./layout";
import { graphDiscRadiusPx } from "./marks";
import { admittedNames, reachText, selectedBlockReachPx, type PlacedName } from "./names";
import { buildFlatGraphScene, claimFlatGraphFolder, flatGraphPins, settleFlatGraph } from "./scene";
import { DOMAIN_HUE_VARS, resolveFlatGraphTokens } from "./tokens";
import type { FlatGraphFrame, FlatGraphLayout } from "./types";

const KINDS = new Set(["project", "domain", "capability", "element"]);
type Node = { id: string; kind: string; title?: string };
type Edge = { from: string; to: string; type: string };

function modelOf(nodes: readonly Node[], edges: readonly Edge[]): DialModel {
  const treeNodes: TreeInputNode[] = nodes
    .filter((n) => KINDS.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    kind: isContainmentRelation(e.type) ? "contains" : "depends",
    relationType: e.type,
  }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges));
  const elementIds = treeNodes.filter((n) => n.kind === "element").map((n) => n.id);
  return buildDialModel({
    tree, dependencies, flows, elementIds, relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directCapabilityRelations(tree, treeEdges),
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
    selected: attention.selected, named: attention.named, reach: attention.reach,
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

describe("attention crossfade", () => {
  const model = VAULTS[1][1];
  const [a, b] = model.domains.map((d) => d.id);
  const foreign = model.domains.find((d) => d.id !== a && d.id !== b)!.id;
  const shareOf = (t: GraphTransition) => transitionShare(t, (att) => inkUnder(att, foreign, TOKENS.paint.sinkInk));

  it("continues from the picture showing when a fast pointer retargets mid-fade", () => {
    const key = {};
    graphInkMix(key, cachedGraphAttention(model, null, false), 0, false);
    graphInkMix(key, cachedGraphAttention(model, a!, false), 1_000, false);
    const before = shareOf(graphInkMix(key, cachedGraphAttention(model, a!, false), 1_030, false));
    const after = shareOf(graphInkMix(key, cachedGraphAttention(model, b!, false), 1_030, false));
    expect(before).toBeGreaterThan(TOKENS.paint.sinkInk + 0.1);
    expect(after).toBeCloseTo(before, 6);
  });

  it("lands at once under reduced motion", () => {
    const key = {};
    graphInkMix(key, cachedGraphAttention(model, null, false), 0, true);
    expect(shareOf(graphInkMix(key, cachedGraphAttention(model, a!, false), 10, true))).toBe(TOKENS.paint.sinkInk);
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
      return { needs: groups.dependsOn.length, neededBy: groups.usedBy.length, ids: new Set([...groups.dependsOn, ...groups.usedBy, ...groups.related].map((c) => c.id)) };
    };
    const reachOf = (m: DialModel, id: string) => {
      const att = resolveGraphAttention(m, id, true);
      return { needs: att.reach!.needs, neededBy: att.reach!.neededBy, ids: new Set(att.lines.map((l) => (l.from === id ? l.to : l.from))) };
    };
    const panel = panelOf("a", nodes, edges);
    expect({ needs: panel.needs, neededBy: panel.neededBy }).toEqual({ needs: 2, neededBy: 4 });
    expect(reachOf(model, "a")).toEqual({ needs: 2, neededBy: 4, ids: new Set(["b", "c", "e", "f", "g", "y"]) });
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

  it("counts distinct concepts on each side of the reach, and an element focus reaches through its capability", () => {
    expect(resolveGraphAttention(model, "a", true).reach).toEqual({ needs: 2, neededBy: 4 });
    expect(resolveGraphAttention(model, "c", true).reach).toEqual({ needs: 1, neededBy: 0 });
    const element = resolveGraphAttention(model, "x", true);
    expect(element.reach).toBeNull();
    expect(element.lines.length).toBe(7);
    expect(resolveGraphAttention(model, "d1", false).lines).toEqual([]);
  });

  it("writes the reach line without a zero side", () => {
    const labels = { ...LABELS, reachNeeds: (n: number) => `needs ${n}`, reachNeededBy: (n: number) => `needed by ${n}` };
    expect(reachText(labels, { needs: 2, neededBy: 0 })).toBe("needs 2");
    expect(reachText(labels, { needs: 0, neededBy: 0 })).toBeNull();
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

  it("slides a covered selection only sideways and only until its name block clears the panel", () => {
    const camera = { tx: 0, ty: 40, tscale: 1.3 };
    const side = selectedBlockReachPx({ tokens: TOKENS.paint, labels: LABELS, measureText: measure, fontFamily: "sans-serif" }, "Order placement", { needs: 5, neededBy: 4 }, 12);
    const margin = { left: side, right: side };
    const insets = { left: 300, right: 420 };
    const target = selectionNudgeTarget(camera, { x: 520 }, 1920, insets, margin)!;
    expect(target.tscale).toBe(camera.tscale);
    expect(target.ty).toBe(camera.ty);
    expect((520 - target.tx) * target.tscale + 1920 / 2 + side).toBeCloseTo(1920 - insets.right, 6);
    expect(selectionNudgeTarget(camera, { x: 0 }, 1920, insets, margin)).toBeNull();
  });
});
