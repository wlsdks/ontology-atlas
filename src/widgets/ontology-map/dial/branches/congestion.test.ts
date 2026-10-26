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
import { countCrossings, namesCrossed, sampleStrips } from "@/widgets/ontology-map/dial/frame/frame";
import { buildDialMarks, emptyDialFrameMarks } from "@/widgets/ontology-map/dial/frame/marks";
import { resolveDialDisclosure } from "@/widgets/ontology-map/dial/frame/disclosure";
import { resolveDialInks } from "@/widgets/ontology-map/dial/ink";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import { applyBranchMemberAction } from "./member-disclosure";
import { resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";
import type { Box, DialLabels, DialModel, Point } from "@/widgets/ontology-map/dial/types";
import type { OntologyMapTokens } from "@/widgets/ontology-map/tokens/read-map-tokens";



const KINDS = new Set(["project", "domain", "capability", "element"]);
const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const MAP = {
  radiusProject: 22, radiusCapability: 11, canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
  labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
  nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
  nodeStrokeDim: "#44465a", egoRestAlpha: 0.32,
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

const measure = createMeasureText();

interface FrameOptions { width: number; indexOpen: boolean; zoom?: number; focusDomain?: string; focusNode?: string; recenter?: boolean;
  pose?: { x: number; y: number; scale: number; height: number; free: Box; more: boolean };
}

function frame({ model, labelOf }: ReturnType<typeof load>, opts: FrameOptions) {
  const scene = layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
  const free: Box = opts.pose?.free ?? { minX: 8 + (opts.indexOpen ? INDEX_PX : 0), minY: 70, maxX: opts.width - 64, maxY: VIEW_H - 36 };
  const height = opts.pose?.height ?? VIEW_H;
  if (opts.pose?.more) applyBranchMemberAction(scene, { type: "branch-members", domainId: opts.focusDomain!, direction: "more" }, 0);
  const pad = dialOverviewPad(scene, model, LABELS, measure, TOKENS);
  const e = scene.extent;
  const fit = Math.min(
    (free.maxX - free.minX - pad.left - pad.right) / (e.maxX - e.minX),
    (free.maxY - free.minY - pad.top - pad.bottom) / (e.maxY - e.minY),
  );
  const scale = opts.pose?.scale ?? fit * (opts.zoom ?? 1);
  const focusId = opts.focusNode ?? opts.focusDomain ?? null;
  const focus = focusId && opts.recenter !== false ? scene.positions.get(focusId)! : null;
  const cx = opts.pose?.x ?? (focus ? focus.x : (e.minX + e.maxX) / 2 + (pad.right - pad.left) / 2 / scale);
  const cy = opts.pose?.y ?? (focus ? focus.y : (e.minY + e.maxY) / 2 + (pad.bottom - pad.top) / 2 / scale);
  const sx = opts.pose ? opts.width / 2 : (free.minX + free.maxX) / 2;
  const sy = opts.pose ? height / 2 : (free.minY + free.maxY) / 2;
  const toScreen = (x: number, y: number): Point => ({ x: sx + (x - cx) * scale, y: sy + (y - cy) * scale });
  const nodeScreen = (id: string) => {
    const p = scene.positions.get(id);
    return p ? toScreen(p.x, p.y) : null;
  };

  const attention = resolveDialAttention(model, null, focusId);
  const marks = emptyDialFrameMarks();
  const result = buildDialMarks({
    model, scene, tokens: TOKENS, mapTokens: MAP, inks: resolveDialInks(MAP, TOKENS), labels: LABELS, evidence: null,
    attention, inkAttention: attention, previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: opts.zoom ?? 1, viewportWidth: opts.width, viewportHeight: height, freeRect: free,
    nodeScreen, toScreen, appearOf: () => 1, measureText: measure, elementLabel: (id) => labelOf.get(id) ?? null,
    focusedNodeId: focusId, hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    hubLines: opts.pose ? ["Evidence not measured"] : undefined, reducedMotion: true,
    disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: opts.width, viewportHeight: height, toScreen }, free, attention, TOKENS),
  }, marks);
  return { scene, flows: result.flows, picks: result.picks, rows: result.rows, marks, lines: sampleStrips(marks.strips), texts: marks.texts, scale, fit, free, nodeScreen };
}


function denseGraph(domains: number): Graph {
  const nodes: { id: string; kind: string; title: string }[] = [{ id: "p", kind: "project", title: "Project" }];
  const edges: { from: string; to: string; type: string }[] = [];
  for (let d = 0; d < domains; d++) {
    nodes.push({ id: `d${d}`, kind: "domain", title: `Domain ${d}` });
    nodes.push({ id: `c${d}`, kind: "capability", title: `Capability ${d}` });
    edges.push({ from: "p", to: `d${d}`, type: "contains" }, { from: `d${d}`, to: `c${d}`, type: "contains" });
    for (let n = 1; n <= 7; n++) edges.push({ from: `c${d}`, to: `c${(d + n) % domains}`, type: "depends_on" });
  }
  return { nodes, edges };
}

const cases = [
  { name: "dogfood", graph: () => deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest) as unknown as Graph, domains: 4, crossings: 2, names: 0 },
  { name: "storefront", graph: () => deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest) as unknown as Graph, domains: 9, crossings: 10, names: 3 },
  { name: "dense 15", graph: () => denseGraph(15), domains: 15, crossings: 40, names: 2 },
  { name: "dense 33", graph: () => denseGraph(33), domains: 33, crossings: 15, names: 3 },
];


const RECOVERY_POSES = [
  {"vault":"storefront","width":1448,"domain":"domain:customer","pose":{"x":592.2635555242086,"y":-263.05337799240857,"scale":2.2040440690517418,"height":982,"free":{"minX":0,"minY":148,"maxX":1064,"maxY":886},"more":false},"missing":["domain:customer\u0000domain:order"]},
  {"vault":"storefront","width":1448,"domain":"domain:catalog","pose":{"x":-500.71153992313083,"y":-6.826923480709301,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:catalog\u0000domain:inventory"]},
  {"vault":"storefront","width":1448,"domain":"domain:inventory","pose":{"x":-500.71153992313083,"y":-312.8269234807093,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:inventory\u0000domain:marketing","domain:inventory\u0000domain:support"]},
  {"vault":"storefront","width":1448,"domain":"domain:marketing","pose":{"x":-500.71153992313083,"y":299.1730765192907,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:marketing\u0000domain:support"]},
  {"vault":"storefront","width":1448,"domain":"domain:order","pose":{"x":-500.71153992313083,"y":-618.8269234807093,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:order\u0000domain:support"]},
  {"vault":"storefront","width":1448,"domain":"domain:fulfillment","pose":{"x":500.71153992313083,"y":-567.8269234807093,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:fulfillment\u0000domain:inventory"]},
  {"vault":"storefront","width":1448,"domain":"domain:loyalty","pose":{"x":500.71153992313083,"y":350.1730765192907,"scale":2.5999998462200162,"height":982,"free":{"minX":0,"minY":148,"maxX":1448,"maxY":886},"more":false},"missing":["domain:loyalty\u0000domain:payment"]},
  {"vault":"storefront","width":976,"domain":"domain:catalog","pose":{"x":-510.16617863558656,"y":-6.2482894781033735,"scale":1.880514665842056,"height":720,"free":{"minX":0,"minY":112,"maxX":976,"maxY":648},"more":false},"missing":["domain:catalog\u0000domain:inventory"]},
  {"vault":"storefront","width":976,"domain":"domain:inventory","pose":{"x":-510.16617863558656,"y":-312.2482894781034,"scale":1.880514665842056,"height":720,"free":{"minX":0,"minY":112,"maxX":976,"maxY":648},"more":false},"missing":["domain:inventory\u0000domain:marketing","domain:inventory\u0000domain:support"]},
  {"vault":"storefront","width":976,"domain":"domain:marketing","pose":{"x":-510.16617863558656,"y":299.75171052189665,"scale":1.880514665842056,"height":720,"free":{"minX":0,"minY":112,"maxX":976,"maxY":648},"more":false},"missing":["domain:marketing\u0000domain:support"]},
  {"vault":"storefront","width":976,"domain":"domain:order","pose":{"x":-510.16617863558656,"y":-618.2482894781034,"scale":1.880514665842056,"height":720,"free":{"minX":0,"minY":112,"maxX":976,"maxY":648},"more":false},"missing":["domain:order\u0000domain:support"]},
  {"vault":"storefront","width":976,"domain":"domain:fulfillment","pose":{"x":510.16617863558656,"y":-567.2482894781033,"scale":1.880514665842056,"height":720,"free":{"minX":0,"minY":112,"maxX":976,"maxY":648},"more":false},"missing":["domain:fulfillment\u0000domain:inventory","domain:fulfillment\u0000domain:order"]},
  {"vault":"dogfood","width":976,"domain":"domain:agent-access","pose":{"x":1027.5557082403564,"y":-318.3227708214597,"scale":0.42760168910026564,"height":720,"free":{"minX":0,"minY":112,"maxX":600,"maxY":648},"more":false},"missing":["domain:agent-access\u0000domain:meaning-layer","domain:agent-access\u0000domain:code-evidence"]},
];

describe("production branch flow congestion", () => {
  for (const width of [976, 1018]) it(`keeps domain cards separated with the conversation open at ${width}px of map space`, () => {
    const vault = load(deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest) as unknown as Graph);
    const painted = frame(vault, { width, indexOpen: false });
    const cards = painted.marks.blocks!.filter((block) => block.alpha > 0.5);
    expect(cards).toHaveLength(4);
    for (let i = 0; i < cards.length; i++) for (const b of cards.slice(i + 1)) {
      const a = cards[i]!;
      const horizontalGap = Math.max(b.box.minX - a.box.maxX, a.box.minX - b.box.maxX);
      const verticalGap = Math.max(b.box.minY - a.box.maxY, a.box.minY - b.box.maxY);
      expect(Math.max(horizontalGap, verticalGap), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(TOKENS.ledgerGapPx);
    }
  });

  for (const recorded of RECOVERY_POSES) it(`${recorded.vault} ${recorded.width} ${recorded.domain}: recovers omitted selected pairs with actual painted stubs`, () => {
    const manifest = recorded.vault === "storefront" ? storefrontManifest : dogfoodManifest;
    const vault = load(deriveOntologyFromVault(manifest as unknown as VaultManifest) as unknown as Graph);
    const painted = frame(vault, { width: recorded.width, indexOpen: false, focusDomain: recorded.domain, pose: recorded.pose });
    for (const key of recorded.missing) {
      expect(painted.flows.drawn, key).toContain(key);
      expect(painted.marks.strips.some((strip) => strip.flowKey === key && strip.role === "stub"), key).toBe(true);
      expect(painted.flows.stubs.some((stub) => stub.flowKey === key), key).toBe(true);
    }
    expect(namesCrossed(painted.lines, painted.texts)).toEqual({ count: 0, names: [] });
  });

  for (const [state, pose] of Object.entries({
    expanded: { x: -82.91981316980947, y: -667.5189903964313, scale: 0.2178308749198914, more: true },
    collapsed: { x: -209.03695838123065, y: -631.5185208319245, scale: 0.42760168910026564, more: false },
  })) it(`keeps every painted caption clear of relation lines in the actual Orders 1040 ${state} pose`, () => {
    const vault = load(deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest) as unknown as Graph);
    const painted = frame(vault, { width: 976, indexOpen: false, focusDomain: "domain:order", pose: { ...pose, height: 720, free: { minX: 0, minY: 112, maxX: 600, maxY: 648 } } });
    const crossed = namesCrossed(painted.lines, painted.texts);
    console.info(`[orders-1040-${state}] ${JSON.stringify(crossed)}`);
    expect(crossed).toEqual({ count: 0, names: [] });
    expect(painted.flows.drawn.length).toBeGreaterThan(0);
    expect(painted.flows.links.map((link) => [link.key, link.uv, link.vu, link.total])).toEqual(vault.model.flows.map((flow) => [flow.key, flow.ab, flow.ba, flow.total]));
    const within = (point: Point) => point.x >= painted.free.minX && point.x <= painted.free.maxX && point.y >= painted.free.minY && point.y <= painted.free.maxY;
    for (const link of painted.flows.links.filter((link) => link.attended)) {
      if (within(painted.nodeScreen(link.u)!) && within(painted.nodeScreen(link.v)!)) expect(painted.flows.drawn).toContain(link.key);
    }
    for (const member of painted.scene.clusterByDomain.get("domain:order")!.items.filter((item) => !item.direct).slice(0, pose.more ? 4 : 2)) {
      expect(painted.texts.some((text) => text.id === member.id && text.role === "capability")).toBe(true);
      expect(painted.rows.some((row) => row.id === member.id)).toBe(true);
    }
  });

  for (const sample of cases) for (const width of [1512, 1040]) {
    it(`${sample.name} at ${width}: measures the actual painted branches inside crossing and name budgets`, () => {
      const vault = load(sample.graph());
      const painted = frame(vault, { width, indexOpen: true });
      expect(painted.scene.clusters).toHaveLength(sample.domains);
      const crossings = countCrossings(painted.lines, width, VIEW_H);
      const crossedNames = namesCrossed(painted.lines, painted.texts).count;
      console.info(`[branch-congestion] ${sample.name} ${width}: ${JSON.stringify({ crossings, crossedNames, drawn: painted.flows.drawn.length, total: painted.flows.links.length })}`);
      expect(crossings).toBeLessThanOrEqual(sample.crossings);
      expect(crossedNames).toBeLessThanOrEqual(sample.names);
      for (const text of painted.texts) {
        expect(text.box.minX, text.text).toBeGreaterThanOrEqual(painted.free.minX);
        expect(text.box.maxX, text.text).toBeLessThanOrEqual(painted.free.maxX);
        expect(text.box.minY, text.text).toBeGreaterThanOrEqual(painted.free.minY);
        expect(text.box.maxY, text.text).toBeLessThanOrEqual(painted.free.maxY);
      }
      expect(painted.flows.links.length).toBeGreaterThan(0);
      expect(painted.flows.drawn.length).toBeGreaterThan(0);
      const omitted = painted.flows.links.filter((link) => !link.relatesOnly && !painted.flows.drawn.includes(link.key));
      expect(painted.flows.budget.total).toBe(painted.flows.links.filter((link) => !link.relatesOnly).length);
      const focusCap = vault.model.capabilityDependencies.find((dependency) => dependency.fromDomain !== dependency.toDomain && vault.model.capabilityById.has(dependency.from))?.from;
      if (focusCap) {
        const selectedCap = frame(vault, { width, indexOpen: true, focusNode: focusCap, recenter: false });
        const attended = selectedCap.flows.links.filter((link) => link.attended && !link.relatesOnly);
        expect(attended.length).toBeGreaterThan(0);
        for (const link of attended) expect(selectedCap.flows.drawn, link.key).toContain(link.key);
      }
      for (const domain of new Set(omitted.flatMap((link) => [link.u, link.v]))) {
        const selected = frame(vault, { width, indexOpen: true, focusDomain: domain });
        for (const link of selected.flows.links.filter((link) => link.attended)) {
          const ends = [selected.nodeScreen(link.u), selected.nodeScreen(link.v)];
          if (ends.some((p) => !p || p.x < selected.free.minX || p.x > selected.free.maxX || p.y < selected.free.minY || p.y > selected.free.maxY)) continue;
          expect(selected.flows.drawn, link.key).toContain(link.key);
        }
      }
    });
  }
});
