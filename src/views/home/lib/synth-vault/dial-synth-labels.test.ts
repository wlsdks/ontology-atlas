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
import { createMeasureText, dialOverviewPad } from "@/widgets/ontology-map/dial/fit";
import { dialTextGround } from "@/widgets/ontology-map/dial/frame/paint";
import { namesCrossed, sampleStrips } from "@/widgets/ontology-map/dial/frame/frame";
import { buildDialMarks, emptyDialFrameMarks } from "@/widgets/ontology-map/dial/frame/marks";
import { resolveDialDisclosure } from "@/widgets/ontology-map/dial/frame/disclosure";
import { resolveDialInks } from "@/widgets/ontology-map/dial/ink";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
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
  nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", egoRestAlpha: 0.32, radiusProject: 22, cameraMaxZoomRatio: 3.2,
} as unknown as OntologyMapTokens;
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
const VIEW_W = 1512;
const VIEW_H = 982;
const INDEX_PX = 320;

type Graph = { nodes: readonly { id: string; kind: string; title?: string }[]; edges: readonly { from: string; to: string; type: string }[] };

function load({ nodes, edges }: Graph): { model: DialModel; labelOf: Map<string, string> } {
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

const VAULTS = {
  storefront: () => load(deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest) as unknown as Graph),
  dogfood: () => load(deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest) as unknown as Graph),
  "synth 10,000": () => load(synthesizeVaultGraph(10000)),
  "layered 10,000": () => load(synthesizeVaultGraph(10000, { shape: "layered", dependencies: true })),
};

interface FrameOptions { width: number; indexOpen: boolean; zoom?: number; focusDomain?: string }

function frame({ model, labelOf }: ReturnType<typeof load>, opts: FrameOptions) {
  const scene = layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
  const measure = createMeasureText();
  const free: Box = { minX: 8 + (opts.indexOpen ? INDEX_PX : 0), minY: 70, maxX: opts.width - 64, maxY: VIEW_H - 36 };
  const pad = dialOverviewPad(scene, model, LABELS, measure, TOKENS);
  const e = scene.extent;
  const fit = Math.min(
    (free.maxX - free.minX - pad.left - pad.right) / (e.maxX - e.minX),
    (free.maxY - free.minY - pad.top - pad.bottom) / (e.maxY - e.minY),
  );
  const scale = fit * (opts.zoom ?? 1);
  const focus = opts.focusDomain ? scene.clusterByDomain.get(opts.focusDomain)!.chip : null;
  const cx = focus ? focus.x : (e.minX + e.maxX) / 2 + (pad.right - pad.left) / 2 / scale;
  const cy = focus ? focus.y : (e.minY + e.maxY) / 2 + (pad.bottom - pad.top) / 2 / scale;
  const sx = (free.minX + free.maxX) / 2;
  const sy = (free.minY + free.maxY) / 2;
  const toScreen = (x: number, y: number): Point => ({ x: sx + (x - cx) * scale, y: sy + (y - cy) * scale });
  const nodeScreen = (id: string) => {
    const p = scene.positions.get(id);
    return p ? toScreen(p.x, p.y) : null;
  };

  const attention = resolveDialAttention(model, null, null);
  const marks = emptyDialFrameMarks();
  const result = buildDialMarks({
    model, scene, tokens: TOKENS, mapTokens: MAP, inks: resolveDialInks(MAP, TOKENS), labels: LABELS,
    evidence: null, attention, inkAttention: attention, previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: opts.zoom ?? 1, viewportWidth: opts.width, viewportHeight: VIEW_H, freeRect: free,
    nodeScreen, toScreen, appearOf: () => 1, measureText: measure, elementLabel: (id) => labelOf.get(id) ?? null,
    hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: opts.width, viewportHeight: VIEW_H, toScreen }, free, attention, TOKENS),
  }, marks);
  const lines = sampleStrips(marks.strips);
  const texts = [...marks.texts, ...marks.extraTexts].map((t) => ({ id: t.id, role: t.role, text: t.text, box: t.box }));
  return { scene, flows: result.flows, lines, texts, scale, fit, free, ground: new Set(dialTextGround(marks)) };
}

function textOverlaps(texts: readonly { id: string | null; text: string; box: Box }[]): number {
  let n = 0;
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i]!.box;
      const b = texts[j]!.box;
      if (texts[i]!.text !== texts[j]!.text && (texts[i]!.id === null || texts[i]!.id !== texts[j]!.id) && a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY) n += 1;
    }
  }
  return n;
}

const REST_BARS = { storefront: 3, dogfood: 3, "synth 10,000": 3, "layered 10,000": 6 } as const;

describe("dial labels at real vault sizes", () => {
  for (const [name, ceiling] of Object.entries(REST_BARS)) {
    it(`${name} at rest, 1512: names crossed ≤ ${ceiling}, no text overlaps, no ellipsis`, () => {
      const f = frame(VAULTS[name as keyof typeof VAULTS](), { width: VIEW_W, indexOpen: true });
      const crossed = namesCrossed(f.lines, f.texts, f.ground);
      expect(crossed.count, crossed.names.join(" | ")).toBeLessThanOrEqual(ceiling);
      expect(f.texts.length).toBeGreaterThan(0);
      expect(textOverlaps(f.texts)).toBe(0);
      expect(f.texts.some((t) => t.text.includes("…"))).toBe(false);
    });
  }

  it("synth 10,000: all 33 domain names at 1512, at least 26 at 1040 with INDEX open", () => {
    const vault = VAULTS["synth 10,000"]();
    const shown = (width: number, indexOpen: boolean) => new Set(frame(vault, { width, indexOpen }).texts.filter((t) => t.role === "domain").map((t) => t.id)).size;
    expect(vault.model.domains).toHaveLength(33);
    expect(shown(VIEW_W, true)).toBe(33);
    expect(shown(1040, true)).toBeGreaterThanOrEqual(26);
  });

  it("storefront at 2.6× on Orders, entered domain resolved: names crossed ≤ 5", () => {
    const vault = VAULTS.storefront();
    const orders = vault.model.domains.find((d) => d.label === "Orders");
    expect(orders).toBeDefined();
    const f = frame(vault, { width: VIEW_W, indexOpen: true, zoom: 2.6, focusDomain: orders!.id });
    expect(f.flows.resolved).toBe(true);
    const crossed = namesCrossed(f.lines, f.texts, f.ground);
    expect(crossed.count, crossed.names.join(" | ")).toBeLessThanOrEqual(5);
    expect(textOverlaps(f.texts)).toBe(0);
  });
});
