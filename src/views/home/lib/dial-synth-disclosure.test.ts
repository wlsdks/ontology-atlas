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
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";
import { buildDialModel, resolveDialAttention } from "@/widgets/ontology-map/dial/dial-model";
import { resolveDialDisclosure } from "@/widgets/ontology-map/dial/frame/disclosure";
import { createMeasureText, dialOverviewPad } from "@/widgets/ontology-map/dial/fit";
import { resolveDialInks } from "@/widgets/ontology-map/dial/ink";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { buildDialMarks, emptyDialFrameMarks } from "@/widgets/ontology-map/dial/frame/marks";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import { resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";
import type { Box, DialLabels, DialModel, Point } from "@/widgets/ontology-map/dial/types";
import type { OntologyMapTokens } from "@/widgets/ontology-map/tokens/read-map-tokens";

import { synthesizeVaultGraph } from "./synth-vault";

const KINDS = new Set(["project", "domain", "capability", "element"]);
const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const MAP = {
  canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", egoRestAlpha: 0.32, radiusProject: 22,
} as unknown as OntologyMapTokens;
const INKS = resolveDialInks(MAP, TOKENS);
const LABELS: DialLabels = {
  units: (c, e) => `${c} ${c === 1 ? "capability" : "capabilities"} · ${e} ${e === 1 ? "element" : "elements"}`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} ${n === 1 ? "element belongs" : "elements belong"} to no domain`,
  more: (n) => `+${n} more`,
  ring: (min, max) => (max === null ? `used by ${min}+` : `used by ${min}–${max}`),
  reading: (r, t) => `${r} of ${t}`,
  settling: () => "settling",
  linksShown: (s, t) => `${s} of ${t} links`,
};
const HEIGHT: Record<number, number> = { 1512: 982, 1040: 720 };
const INDEX_PX = 320;

type Graph = { nodes: readonly { id: string; kind: string; title?: string }[]; edges: readonly { from: string; to: string; type: string }[] };
type Vault = { model: DialModel; labelOf: Map<string, string> };

function load({ nodes, edges }: Graph): Vault {
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
  return { model: buildDialModel({ tree, dependencies, flows, elementIds }), labelOf: new Map(treeNodes.map((n) => [n.id, n.label])) };
}

const cache = new Map<string, Vault>();
const VAULTS: Record<string, () => Graph> = {
  storefront: () => deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest) as unknown as Graph,
  dogfood: () => deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest) as unknown as Graph,
  "synth 2,000": () => synthesizeVaultGraph(2000, { dependencies: true }),
  "synth 10,000": () => synthesizeVaultGraph(10000, { dependencies: true }),
  "layered 10,000": () => synthesizeVaultGraph(10000, { dependencies: true, shape: "layered" }),
};
const vault = (name: string) => {
  let hit = cache.get(name);
  if (!hit) cache.set(name, (hit = load(VAULTS[name]!())));
  return hit;
};

interface Count { foreignSquares: number; entered: string | null; domains: number; capabilities: number; elements: number; lines: number; marks: number; maxPerEnd: number; counted: number }

function measure(name: string, width: number, zoom: number): Count {
  const { model, labelOf } = vault(name);
  const H = HEIGHT[width]!;
  const scene = layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
  const text = createMeasureText();
  const free: Box = { minX: 8 + INDEX_PX, minY: 70, maxX: width - 64, maxY: H - 36 };
  const pad = dialOverviewPad(scene, model, LABELS, text, TOKENS);
  const e = scene.extent;
  const fit = Math.min(
    (free.maxX - free.minX - pad.left - pad.right) / (e.maxX - e.minX),
    (free.maxY - free.minY - pad.top - pad.bottom) / (e.maxY - e.minY),
  );
  const scale = fit * zoom;
  const inner = [...scene.clusters].sort((a, b) => b.step - a.step || a.domainId.localeCompare(b.domainId))[0]!;
  const cx = zoom > 1 ? inner.chip.x : (e.minX + e.maxX) / 2 + (pad.right - pad.left) / 2 / scale;
  const cy = zoom > 1 ? inner.chip.y : (e.minY + e.maxY) / 2 + (pad.bottom - pad.top) / 2 / scale;
  const sx = (free.minX + free.maxX) / 2;
  const sy = (free.minY + free.maxY) / 2;
  const toScreen = (x: number, y: number): Point => ({ x: sx + (x - cx) * scale, y: sy + (y - cy) * scale });
  const nodeScreen = (id: string) => {
    const p = scene.positions.get(id);
    return p ? toScreen(p.x, p.y) : null;
  };
  const attention = resolveDialAttention(model, null, null);
  const disclosure = resolveDialDisclosure(model, scene, { scale, viewportWidth: width, viewportHeight: H, toScreen }, free, attention, TOKENS);
  const out = emptyDialFrameMarks();
  const result = buildDialMarks({
    model, scene, tokens: TOKENS, mapTokens: MAP, inks: INKS, labels: LABELS, evidence: null, attention, previous: null, inkMix: 1, chordPresence: 1,
    scale, labelScale: TOKENS.labelScale, viewportWidth: width, viewportHeight: H, freeRect: free, nodeScreen, toScreen,
    appearOf: () => 1, measureText: text, elementLabel: (id) => labelOf.get(id) ?? null,
    hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null, disclosure,
  }, out);
  const domains = out.glyphs.filter((g) => g.kind === "domain").length;
  const capabilities = out.discs.length;
  const elements = out.squares.length;
  const lines = out.strips.length;
  const perEnd = new Map<string, number>();
  for (const key of result.flows.drawn) {
    const link = result.flows.links.find((l) => l.key === key);
    if (!link || link.relatesOnly) continue;
    for (const end of [link.u, link.v]) perEnd.set(end, (perEnd.get(end) ?? 0) + 1);
  }
  const own = new Set<string>(scene.orphans.ids);
  const enteredCluster = disclosure.entered ? scene.clusterByDomain.get(disclosure.entered) : undefined;
  for (const it of enteredCluster?.items ?? []) for (const el of it.elementIds) own.add(el);
  const foreignSquares = out.squares.filter((q) => q.id !== null && !own.has(q.id)).length;
  return {
    foreignSquares, entered: disclosure.entered,
    domains, capabilities, elements, lines, marks: domains + capabilities + elements + lines,
    maxPerEnd: Math.max(0, ...perEnd.values()),
    counted: result.flows.links.filter((l) => !l.relatesOnly).length,
  };
}

const ZOOM: Record<string, { zoom: number; deep: number | null }> = {
  storefront: { zoom: 2.63, deep: 5.69 },
  dogfood: { zoom: 2.82, deep: null },
  "synth 2,000": { zoom: 3.71, deep: 7.03 },
  "synth 10,000": { zoom: 5.61, deep: 13.8 },
  "layered 10,000": { zoom: 5.61, deep: 13.8 },
};

const BARS: Record<string, { overview: number; zoom: number; deep: number | null }> = {
  storefront: { overview: 100, zoom: 150, deep: 60 },
  dogfood: { overview: 60, zoom: 80, deep: null },
  "synth 2,000": { overview: 400, zoom: 450, deep: 300 },
  "synth 10,000": { overview: 80, zoom: 1000, deep: 1000 },
  "layered 10,000": { overview: 80, zoom: 1000, deep: 1000 },
};

describe("dial mark budget at four vault sizes (DESIGN.md, Mark budget)", () => {
  for (const width of [1512, 1040]) {
    for (const [name, bar] of Object.entries(BARS)) {
      it(`${name} at ${width}, INDEX open: overview ≤ ${bar.overview}, zoom ≤ ${bar.zoom}${bar.deep === null ? "" : `, deep ≤ ${bar.deep}`}`, () => {
        const overview = measure(name, width, 1);
        expect(overview.marks).toBeLessThanOrEqual(bar.overview);
        if (name === "storefront" || name === "dogfood") expect(overview.lines).toBeGreaterThanOrEqual(overview.counted);
        if (name === "synth 2,000") {
          expect(overview.capabilities).toBeGreaterThan(0);
          expect(overview.lines).toBeLessThanOrEqual(24);
        }
        if (name.endsWith("10,000")) {
          expect(overview.capabilities).toBe(0);
          expect(overview.lines).toBeLessThanOrEqual(40);
          expect(overview.maxPerEnd).toBeLessThanOrEqual(6);
        }
        const zoom = measure(name, width, ZOOM[name]!.zoom);
        expect(zoom.capabilities).toBeGreaterThan(0);
        expect(zoom.marks).toBeLessThanOrEqual(bar.zoom);
        expect(zoom.foreignSquares).toBe(0);
        if (bar.deep !== null) {
          const deep = measure(name, width, ZOOM[name]!.deep!);
          expect(deep.marks).toBeLessThanOrEqual(bar.deep);
          expect(deep.foreignSquares).toBe(0);
        }
      });
    }
  }
});

