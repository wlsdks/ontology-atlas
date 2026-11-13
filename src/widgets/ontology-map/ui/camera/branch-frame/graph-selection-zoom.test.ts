import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import { buildDialModel } from "../../../dial/dial-model";
import type { DialLabels, DialModel, DialWorld } from "../../../dial/types";
import { cachedGraphAttention } from "../../../flat-graph/attention";
import { buildFlatGraphScene } from "../../../flat-graph/scene";
import { resolveFlatGraphTokens } from "../../../flat-graph/tokens";
import {
  directCapabilityRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs,
  rollRelatesDomainPairs, type TreeInputEdge, type TreeInputNode,
} from "../../../model/containment-tree";
import type { TopologyWorld } from "../../world/topology-world";

const TOKENS = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../flat-graph/tokens", async (actual) => ({ ...(await actual<object>()), readFlatGraphTokens: () => TOKENS.current }));
vi.mock("../../../dial/fit", () => ({ createMeasureText: () => (text: string, font: string) => text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 12) * 0.6 }));
vi.mock("../../../render/labels", async (actual) => ({ ...(await actual<object>()), labelFontFamily: () => "sans-serif" }));

import { selectionSlideTarget } from "./selection-margin";

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const tokens = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "");
TOKENS.current = tokens;

function storefrontModel(): DialModel {
  const d = deriveOntologyFromVault(storefrontManifest as unknown as VaultManifest);
  const kinds = new Set(["project", "domain", "capability", "element"]);
  const treeNodes: TreeInputNode[] = (d.nodes as { id: string; kind: string; title?: string }[])
    .filter((n) => kinds.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = (d.edges as { from: string; to: string; type: string }[]).map((e) => ({
    source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type,
  }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges)),
    elementIds: treeNodes.filter((n) => n.kind === "element").map((n) => n.id),
    relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directCapabilityRelations(tree, treeEdges),
  });
}

const LABELS = { units: (c: number, e: number) => `${c} capabilities · ${e} elements`, stale: (n: number) => `${n} stale`, orphans: (n: number) => `${n} unplaced` } as unknown as DialLabels;
const VIEWPORT = { width: 1512, height: 949 };
const INSETS = { safeInsetLeft: 376, safeInsetRight: 380, safeInsetTop: 148, safeInsetBottom: 96, overviewEntryRatio: 1, cameraMaxZoomRatio: 8, cameraScaleMax: 8 };

describe("an element selection's zoom", () => {
  const model = storefrontModel();
  const scene = buildFlatGraphScene(model, tokens.layout, null);
  const layout = scene.graph!;
  const at = (id: string) => layout.positions.get(id) ?? layout.itemAt.get(id)!;
  const world = { nodeById: new Map([...model.capabilityOf.keys(), ...layout.positions.keys()].map((id) => [id, { id, label: id, ...at(id) }])), dialScaleMax: null } as unknown as TopologyWorld;
  const dial = { model, scene, labels: LABELS } as unknown as DialWorld;
  const freeWidth = VIEWPORT.width - INSETS.safeInsetLeft - INSETS.safeInsetRight;

  it("keeps the scale it was made at when the far ends of its lines cannot all fit there", () => {
    const element = [...model.capabilityOf.keys()]
      .map((id) => {
        const ends = cachedGraphAttention(model, id, true).lines.flatMap((line) => [at(line.from), at(line.to)]);
        return { id, lines: ends.length / 2, span: Math.max(...ends.map((p) => p.x)) - Math.min(...ends.map((p) => p.x)) };
      })
      .filter((e) => e.lines >= 3)
      .sort((a, b) => b.span - a.span)[0]!;
    // Far ends twice wider than the free map, the element's own corner of the map well inside it.
    const scale = (2 * freeWidth) / element.span;
    const home = at(element.id);
    const camera = { tx: home.x, ty: home.y, tscale: scale };
    const target = selectionSlideTarget(world, dial, element.id, camera, VIEWPORT, INSETS, scale / 4);
    expect(target?.tscale ?? scale, `${element.id}: ${element.lines} lines over ${Math.round(element.span * scale)} px at the clicked scale`).toBeLessThanOrEqual(scale + 1e-9);
  });
});
