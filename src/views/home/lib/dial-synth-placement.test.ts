import { describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import type { VaultManifest } from "@/entities/docs-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import { buildDialModel } from "@/widgets/ontology-map/dial/dial-model";
import { layoutDial } from "@/widgets/ontology-map/dial/layout";
import { circularDomainOrder } from "@/widgets/ontology-map/dial/order";
import { capabilityTierRead, createDialPlacement } from "@/widgets/ontology-map/dial/placement";
import type { DialMemory, DialModel, DialScene } from "@/widgets/ontology-map/dial/types";
import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "@/widgets/ontology-map/model/containment-tree";

import { synthesizeVaultGraph } from "./synth-vault";

const tokens = {
  pitch: 34,
  spiralC: 0.61,
  spiralK0: 4.5,
  elementRoom: 0.42,
  elementHole: 0.13,
  angularGap: 0.9,
  ringGap: 2.1,
  hubClearance: 78,
  orphanPitch: 0.5,
};

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
  return buildDialModel({ tree, dependencies, flows, elementIds });
}

function lay(model: DialModel, memory: DialMemory | null): DialScene {
  return layoutDial(model, circularDomainOrder(model, memory?.order ?? null).order, tokens, memory);
}

function vault(manifest: unknown) {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  return { nodes: d.nodes as Node[], edges: d.edges as Edge[] };
}

const TIER_BY_KIND: Record<string, number> = { project: 0, domain: 2, capability: 3, element: 4 };
const TIER_FOLDERS = ["projects", "domains", "capabilities", "elements"];
const QUARTER_MIN = 400;

function tierOf(node: Node, folders: boolean): number {
  if (!folders) return TIER_BY_KIND[node.kind] ?? 5;
  const slash = node.id.indexOf("/");
  if (slash < 0) return 0;
  const at = TIER_FOLDERS.indexOf(node.id.slice(0, slash));
  return at < 0 ? 5 : at + 1;
}

function loaderBatches(nodes: readonly Node[], folders: boolean): { ids: Set<string>; tierRead: boolean }[] {
  const tiers = nodes.map((n) => tierOf(n, folders));
  const order = nodes.map((_, i) => i).sort((a, b) => tiers[a]! - tiers[b]! || a - b);
  const batches: { ids: Set<string>; tierRead: boolean }[] = [];
  const seen = new Set<string>();
  for (let tier = 0; tier <= 5; tier += 1) {
    const members = order.filter((i) => tiers[i] === tier);
    if (members.length === 0) continue;
    const cuts = members.length >= QUARTER_MIN ? [0.25, 0.5, 0.75, 1] : [1];
    let at = 0;
    for (const cut of cuts) {
      const end = Math.round(cut * members.length);
      for (; at < end; at += 1) seen.add(nodes[members[at]!]!.id);
      batches.push({ ids: new Set(seen), tierRead: folders ? capabilityTierRead(seen) : tier > 3 || (tier === 3 && cut === 1) });
    }
  }
  return batches;
}

interface Replay { driftPx: number; heldAtEnd: number; ringsChanged: number; releases: number; states: string[] }

function replay(nodes: readonly Node[], edges: readonly Edge[], folders: boolean): Replay {
  const placement = createDialPlacement();
  const batches = loaderBatches(nodes, folders);
  let memory: DialMemory | null = null;
  let first: DialScene | null = null;
  let firstSteps = new Map<string, number>();
  let heldAtEnd = 0;
  let releases = 0;
  const states: string[] = [];
  let final: { scene: DialScene; model: DialModel } | null = null;
  batches.forEach((batch, k) => {
    const reading = k < batches.length - 1;
    const model = modelOf(nodes.filter((n) => batch.ids.has(n.id)), edges.filter((e) => batch.ids.has(e.from) && batch.ids.has(e.to)));
    const step = placement.next({ model, reading, capabilityTierRead: batch.tierRead, memory: null });
    if (states.at(-1) !== step.state) states.push(step.state);
    if (step.released) releases += 1;
    if (step.state === "settled") heldAtEnd = step.held;
    if (step.state === "reading") return;
    const scene = lay(step.model, memory);
    memory = scene.memory;
    if (!first) {
      first = scene;
      firstSteps = new Map(scene.clusters.map((c) => [c.domainId, c.step]));
    }
    final = { scene, model };
  });
  const end = final as unknown as { scene: DialScene; model: DialModel };
  const start = (first as DialScene | null) ?? end.scene;
  let max = 0;
  for (const [id, p] of start.positions) {
    const q = end.scene.positions.get(id);
    if (!q || !(end.model.domainById.has(id) || end.model.capabilityById.has(id))) continue;
    max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y));
  }
  const w = end.scene.extent.maxX - end.scene.extent.minX;
  const h = end.scene.extent.maxY - end.scene.extent.minY;
  let ringsChanged = 0;
  for (const c of end.scene.clusters) if (firstSteps.has(c.domainId) && firstSteps.get(c.domainId) !== c.step) ringsChanged += 1;
  return { driftPx: max * Math.min(1512 / w, 982 / h), heldAtEnd, ringsChanged, releases, states };
}

const report = (label: string, r: Replay) =>
  console.info(`[B22] ${label}: drift ${r.driftPx.toFixed(2)} px, held ${r.heldAtEnd}, rings changed ${r.ringsChanged}, releases ${r.releases}, states ${r.states.join(">")}`);

describe("progressive dial placement replay", () => {
  it("real vaults: nothing moves after the capability tier", () => {
    for (const [label, manifest] of [["storefront", storefrontManifest], ["dogfood", dogfoodManifest]] as const) {
      const v = vault(manifest);
      const r = replay(v.nodes, v.edges, true);
      report(label, r);
      expect(r.driftPx).toBe(0);
      expect(r.heldAtEnd).toBe(r.ringsChanged);
    }
  });

  it.each([
    [2000, 3.4],
    [10000, 2.5],
  ])("uniform synth %i moves at most %f px after the capability tier", (n, bar) => {
    for (const dependencies of [false, true]) {
      const g = synthesizeVaultGraph(n, { dependencies });
      const r = replay(g.nodes, g.edges, false);
      report(`synth ${n} deps=${dependencies}`, r);
      expect(r.states).toEqual(["reading", "provisional", "settled"]);
      expect(r.driftPx).toBeLessThanOrEqual(bar);
      expect(r.ringsChanged).toBe(0);
    }
  });

  it("layered 10,000: every ring change is held, then applied in one event", () => {
    const g = synthesizeVaultGraph(10000, { shape: "layered", dependencies: true });
    const r = replay(g.nodes, g.edges, false);
    report("layered 10000", r);
    expect(r.ringsChanged).toBeGreaterThan(0);
    expect(r.heldAtEnd).toBe(r.ringsChanged);
    expect(r.releases).toBe(1);
  });
});
