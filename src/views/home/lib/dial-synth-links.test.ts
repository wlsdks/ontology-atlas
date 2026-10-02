import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultManifest } from "@/entities/docs-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type DomainDependency,
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";
import { buildDialModel, resolveDialAttention } from "@/widgets/ontology-map/dial/dial-model";
import { buildFlowMarks, type FlowMarksInput } from "@/widgets/ontology-map/dial/flow-marks";
import { resolveDialDisclosure } from "@/widgets/ontology-map/dial/frame/disclosure";
import { resolveDialInks } from "@/widgets/ontology-map/dial/ink";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { aggregateLinks, domainOfEnd, type DialLink } from "@/widgets/ontology-map/dial/links";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import { resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";
import type { DialMarks, DialMemory, DialModel, DialScene, DialTokens } from "@/widgets/ontology-map/dial/types";
import type { OntologyMapTokens } from "@/widgets/ontology-map/tokens/read-map-tokens";

import { synthesizeVaultGraph } from "./synth-vault";

const KINDS = new Set(["project", "domain", "capability", "element"]);
const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));

type RingLayout = (model: DialModel, order: readonly string[], tokens: DialTokens, memory: DialMemory | null) => DialScene;
const layoutReady = layoutDial.length >= 4;

function load(nodes: readonly { id: string; kind: string; title?: string }[], edges: readonly { from: string; to: string; type: string }[]) {
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
  return { model: buildDialModel({ tree, dependencies, flows, elementIds }), dependencies };
}

function vault(manifest: unknown) {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  return load(d.nodes, d.edges);
}

function matrixRows(dependencies: readonly DomainDependency[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of dependencies) if (d.fromDomain !== d.toDomain) out.set(`${d.fromDomain}>${d.toDomain}`, (out.get(`${d.fromDomain}>${d.toDomain}`) ?? 0) + 1);
  return out;
}

function perDirectedPair(model: DialModel, links: readonly DialLink[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string, n: number) => n > 0 && out.set(k, (out.get(k) ?? 0) + n);
  for (const l of links) {
    if (l.relatesOnly) continue;
    const du = domainOfEnd(model, l.u);
    const dv = domainOfEnd(model, l.v);
    if (du === dv) continue;
    add(`${du}>${dv}`, l.uv);
    add(`${dv}>${du}`, l.vu);
  }
  return out;
}

const VAULTS = {
  storefront: () => vault(storefrontManifest),
  dogfood: () => vault(dogfoodManifest),
  "layered 10,000": () => {
    const g = synthesizeVaultGraph(10000, { shape: "layered", dependencies: true });
    return load(g.nodes, g.edges);
  },
};

describe("links conserve domain_matrix rows", () => {
  for (const [name, make] of Object.entries(VAULTS)) {
    it(`${name}: at rest, with each domain entered, and with an attended capability`, () => {
      const { model, dependencies } = make();
      const rows = matrixRows(dependencies);
      expect(rows.size).toBeGreaterThan(0);
      const rest = resolveDialAttention(model, null, null);
      expect(perDirectedPair(model, aggregateLinks(model, new Set(), rest))).toEqual(rows);
      for (const d of model.domains.slice(0, 8)) {
        expect(perDirectedPair(model, aggregateLinks(model, new Set([d.id]), rest))).toEqual(rows);
        const cap = d.capabilityIds[0];
        if (cap) expect(perDirectedPair(model, aggregateLinks(model, new Set(), resolveDialAttention(model, cap, null)))).toEqual(rows);
      }
    });
  }

  it("storefront: 17 counted pairs and the model's 4 relates-only pairs", () => {
    const { model } = VAULTS.storefront();
    const links = aggregateLinks(model, new Set(), resolveDialAttention(model, null, null));
    expect(links.filter((l) => !l.relatesOnly)).toHaveLength(17);
    expect(links.filter((l) => l.relatesOnly)).toHaveLength(4);
  });
});

const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", egoRestAlpha: 0.32,
} as unknown as OntologyMapTokens;

function overview(model: DialModel) {
  const scene = (layoutDial as unknown as RingLayout)(model, circularDomainOrder(model, null).order, TOKENS, null);
  const W = 1512;
  const H = 982;
  const free = { minX: 8, minY: 70, maxX: W - 64, maxY: H - 36 };
  const e = scene.extent;
  const scale = Math.min((free.maxX - free.minX) / (e.maxX - e.minX), (free.maxY - free.minY) / (e.maxY - e.minY));
  const cx = (e.minX + e.maxX) / 2;
  const cy = (e.minY + e.maxY) / 2;
  const toScreen = (x: number, y: number) => ({ x: (free.minX + free.maxX) / 2 + (x - cx) * scale, y: (free.minY + free.maxY) / 2 + (y - cy) * scale });
  const input: FlowMarksInput = {
    model, scene, tokens: TOKENS, inks: resolveDialInks(MAP, TOKENS), attention: resolveDialAttention(model, null, null), previous: null,
    inkMix: 1, chordPresence: 1, scale, labelScale: 1, viewportWidth: W, viewportHeight: H, freeRect: free,
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    endRadiusPx: () => 10, appearOf: () => 1, measureText: (t) => t.length * 6.5, occupied: [], chords: [],
    resolution: resolveDialDisclosure(model, scene, { scale, viewportWidth: W, viewportHeight: H, toScreen }, free, resolveDialAttention(model, null, null), TOKENS),
  };
  const out: DialMarks = { inks: [], strips: [], discs: [], squares: [], ticks: [], rails: [], glyphs: [], texts: [], numerals: [], leaders: [] };
  return buildFlowMarks(input, out);
}

describe("link budget on the ring layout", () => {
  it.skipIf(!layoutReady)("layered 10,000 overview: at most 40 lines, at most 6 per end", () => {
    const { model } = VAULTS["layered 10,000"]();
    const result = overview(model);
    const shown = result.links.filter((l) => !l.relatesOnly && result.drawn.includes(l.key));
    expect(shown.length).toBeLessThanOrEqual(40);
    const per = new Map<string, number>();
    for (const l of shown) for (const e of [l.u, l.v]) per.set(e, (per.get(e) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(6);
  });

  it.skipIf(!layoutReady)("storefront overview: all 17 counted pairs and all 4 relates-only drawn", () => {
    const { model } = VAULTS.storefront();
    const result = overview(model);
    const drawn = new Set(result.drawn);
    expect(result.links.filter((l) => !l.relatesOnly && drawn.has(l.key))).toHaveLength(17);
    expect(result.links.filter((l) => l.relatesOnly && drawn.has(l.key))).toHaveLength(4);
  });
});
