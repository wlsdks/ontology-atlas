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
import { type FlowMarksInput } from "@/widgets/ontology-map/dial/flow-marks";
import { buildDialMarks, emptyDialFrameMarks } from "@/widgets/ontology-map/dial/frame/marks";
import { countCrossings, namesCrossed, sampleStrips } from "@/widgets/ontology-map/dial/frame/frame";
import { applyBranchMemberAction } from "@/widgets/ontology-map/dial/branches/member-disclosure";
import { createMeasureText } from "@/widgets/ontology-map/dial/fit";
import { resolveDialDisclosure } from "@/widgets/ontology-map/dial/frame/disclosure";
import { resolveDialInks } from "@/widgets/ontology-map/dial/ink";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { aggregateLinks, domainOfEnd, type DialLink } from "@/widgets/ontology-map/dial/links";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import { resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";
import type { DialMemory, DialModel, DialScene, DialTokens } from "@/widgets/ontology-map/dial/types";
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

function overview(model: DialModel, focus: string | null = null, pose?: { x: number; y: number; scale: number }) {
  const scene = (layoutDial as unknown as RingLayout)(model, circularDomainOrder(model, null).order, TOKENS, null);
  if (pose && focus) applyBranchMemberAction(scene, { type: "branch-members", domainId: focus, direction: "more" }, 0);
  const W = pose ? 976 : 1512;
  const H = pose ? 720 : 982;
  const free = pose ? { minX: 0, minY: 164, maxX: W, maxY: 648 } : { minX: 8, minY: 70, maxX: W - 64, maxY: H - 36 };
  const e = scene.extent;
  const scale = pose?.scale ?? Math.min((free.maxX - free.minX) / (e.maxX - e.minX), (free.maxY - free.minY) / (e.maxY - e.minY));
  const cx = pose?.x ?? (e.minX + e.maxX) / 2;
  const cy = pose?.y ?? (e.minY + e.maxY) / 2;
  const toScreen = (x: number, y: number) => ({ x: (pose ? W / 2 : (free.minX + free.maxX) / 2) + (x - cx) * scale, y: (pose ? H / 2 : (free.minY + free.maxY) / 2) + (y - cy) * scale });
  const input: FlowMarksInput = {
    model, scene, tokens: TOKENS, inks: resolveDialInks(MAP, TOKENS), attention: resolveDialAttention(model, null, focus), inkAttention: resolveDialAttention(model, null, focus), previous: null,
    inkMix: 1, chordPresence: 1, scale, viewportWidth: W, viewportHeight: H, freeRect: free,
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    endRadiusPx: () => 10, appearOf: () => 1, measureText: pose ? createMeasureText() : (t) => t.length * 6.5, occupied: [], chords: [],
    resolution: resolveDialDisclosure(model, scene, { scale, viewportWidth: W, viewportHeight: H, toScreen }, free, resolveDialAttention(model, null, null), TOKENS),
  };
  const out = emptyDialFrameMarks();
  const result = buildDialMarks({ ...input, mapTokens: MAP, labels: pose ? {
    units: (c, e) => `${c} capabilities · ${e} elements`, stale: n => `${n} stale`, orphans: n => `${n} elements`, more: n => `+${n} more`,
    ring: (min, max) => `${min}–${max}`, reading: (r, t) => `${r} of ${t}`, settling: () => "settling", linksShown: (s, t) => `${s} of ${t} links`,
  } : null, evidence: null, zoomRatio: 1,
    focusedNodeId: focus, hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    elementLabel: () => null, disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: W, viewportHeight: H, toScreen }, free, input.attention, TOKENS),
  }, out);
  const lines = sampleStrips(out.strips);
  return { ...result.flows, crossings: countCrossings(lines, W, H), namesCrossed: namesCrossed(lines, out.texts).count };
}

describe("link budget on the production branch layout", () => {
  it("keeps both directions of a layered pair uncrossed after More in the observed 1040 pose", () => {
    const { model } = VAULTS["layered 10,000"]();
    const result = overview(model, "synth-domain-6", { x: -1877.2668913234295, y: -1541.483945911225, scale: 0.8299631714820861 });
    const pair = result.links.find(link => link.key === "synth-domain-30\0synth-domain-6")!;
    expect(pair).toMatchObject({ uv: 25, vu: 27 });
    expect(result.drawn).toContain(pair.key);
    expect(result.drawn.length).toBeLessThanOrEqual(20);
    expect(result.crossings).toBe(0);
    expect(result.namesCrossed).toBe(0);
  });
  it.skipIf(!layoutReady)("layered 10,000 overview: at most 40 lines, at most 6 per end", () => {
    const { model } = VAULTS["layered 10,000"]();
    const result = overview(model);
    const shown = result.links.filter((l) => !l.relatesOnly && result.drawn.includes(l.key));
    expect(shown.length).toBeLessThanOrEqual(40);
    const per = new Map<string, number>();
    for (const l of shown) for (const e of [l.u, l.v]) per.set(e, (per.get(e) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(6);
  });

  it.skipIf(!layoutReady)("storefront overview: keeps all counts and reveals omitted rest pairs when selected", () => {
    const { model } = VAULTS.storefront();
    const result = overview(model);
    const drawn = new Set(result.drawn);
    const counted = result.links.filter((link) => !link.relatesOnly);
    expect(counted).toHaveLength(17);
    expect(result.budget.total).toBe(17);
    const shown = counted.filter((link) => drawn.has(link.key));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(17);
    for (const domain of new Set(counted.filter((link) => !drawn.has(link.key)).flatMap((link) => [link.u, link.v]))) {
      const selected = overview(model, domain);
      for (const link of selected.links.filter((link) => link.attended)) expect(selected.drawn, link.key).toContain(link.key);
    }
    expect(result.links.filter((l) => l.relatesOnly && drawn.has(l.key))).toHaveLength(4);
  });
});
