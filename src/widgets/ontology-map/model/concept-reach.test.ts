import { describe, expect, it } from "vitest";
import docsManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import { buildDialModel } from "../dial/dial-model";
import { cachedGraphAttention, resolveGraphAttention } from "../flat-graph/attention";
import { readConceptReach } from "./concept-reach";
import {
  directRelations,
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "./containment-tree";

const node = (id: string, label = id.split(":")[1]!): TreeInputNode => ({ id, label, kind: id.split(":")[0] as TreeInputNode["kind"] });
const contains = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
const rel = (source: string, target: string, relationType = "depends_on"): TreeInputEdge => ({ source, target, kind: "depends", relationType });

const nodes: TreeInputNode[] = [
  node("project:shop"),
  node("domain:orders"), node("domain:payments"), node("domain:catalog"), node("domain:legacy"),
  node("capability:checkout", "Checkout"), node("capability:cart", "Cart"), node("capability:charge", "Charge"),
  node("capability:refund", "Refund"), node("capability:browse", "Browse"), node("capability:search", "Search"),
  node("element:checkout-form", "Checkout form"), node("element:price-table", "Price table"),
];
const edges: TreeInputEdge[] = [
  ...["domain:orders", "domain:payments", "domain:catalog", "domain:legacy"].map((d) => contains("project:shop", d)),
  contains("domain:orders", "capability:checkout"), contains("domain:orders", "capability:cart"),
  contains("domain:payments", "capability:charge"), contains("domain:payments", "capability:refund"),
  contains("domain:catalog", "capability:browse"), contains("domain:catalog", "capability:search"),
  contains("capability:checkout", "element:checkout-form"), contains("capability:browse", "element:price-table"),
  rel("capability:checkout", "capability:charge"),
  rel("capability:checkout", "capability:cart"),
  rel("capability:checkout", "capability:browse", "uses"),
  rel("capability:refund", "capability:checkout"),
  rel("capability:refund", "capability:charge"),
  rel("capability:cart", "capability:charge"),
  rel("capability:checkout", "capability:search", "related_to"),
  rel("capability:checkout", "capability:cart", "is_a"),
  rel("element:checkout-form", "element:price-table"),
  rel("domain:legacy", "domain:catalog", "is_a"),
];

function modelOf(graphNodes: readonly TreeInputNode[], graphEdges: readonly TreeInputEdge[]) {
  const tree = readContainmentTree(graphNodes, graphEdges);
  const dependencies = rollDomainDependencies(tree, graphEdges);
  return buildDialModel({
    tree, dependencies,
    flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, graphEdges)),
    elementIds: graphNodes.filter((n) => n.kind === "element").map((n) => n.id),
    relates: rollRelatesCapabilityPairs(tree, graphEdges),
    direct: directRelations(graphEdges),
  });
}

function mapReach(focusId: string) {
  return cachedGraphAttention(modelOf(nodes, edges), focusId, true).reach;
}

/** A sample vault as the map's graph holds it: map concepts only, and the relations between them. */
function vaultGraph(manifest: unknown) {
  const derived = deriveOntologyFromVault(manifest as VaultManifest);
  const kinds = new Set(["project", "domain", "capability", "element"]);
  const graphNodes: TreeInputNode[] = (derived.nodes as { id: string; kind: string; title?: string }[])
    .filter((n) => kinds.has(n.kind))
    .map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const ids = new Set(graphNodes.map((n) => n.id));
  const graphEdges: TreeInputEdge[] = (derived.edges as { from: string; to: string; type: string }[])
    .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    .map((e) => ({ source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type }));
  return { graphNodes, graphEdges, model: modelOf(graphNodes, graphEdges) };
}

const VAULTS = [["docs", docsManifest], ["storefront", storefrontManifest]] as const;

describe("readConceptReach", () => {
  it.each(["capability:checkout", "capability:charge", "capability:refund", "domain:orders", "domain:payments", "domain:catalog"])(
    "counts %s as the map's count line does",
    (id) => {
      const reach = readConceptReach(nodes, edges, id)!;
      expect({ needs: reach.needs.length, neededBy: reach.neededBy.length }).toEqual(mapReach(id));
    },
  );

  it("orders a capability's rows by how many concepts need the far end, then by name", () => {
    const reach = readConceptReach(nodes, edges, "capability:checkout")!;
    expect(reach.needs.map((r) => r.label)).toEqual(["Charge", "Browse", "Cart"]);
    expect(reach.neededBy.map((r) => r.label)).toEqual(["Refund"]);
  });

  it("puts relates and a broader concept into the other links, never into a direction", () => {
    const reach = readConceptReach(nodes, edges, "capability:checkout")!;
    expect(reach.other.map((r) => [r.label, r.line])).toEqual([["Search", "relates"]]);
    expect(reach.needs.map((r) => r.id)).toContain("capability:cart");
  });

  it("lists a domain's partner domains with their link counts, largest first", () => {
    const reach = readConceptReach(nodes, edges, "domain:payments")!;
    expect(reach.needs.map((r) => [r.id, r.links])).toEqual([["domain:orders", 1]]);
    expect(reach.neededBy.map((r) => [r.id, r.links])).toEqual([["domain:orders", 2]]);
    const orders = readConceptReach(nodes, edges, "domain:orders")!;
    expect(orders.needs.map((r) => [r.id, r.links])).toEqual([["domain:payments", 2], ["domain:catalog", 1]]);
  });

  it("counts a domain with only a broader concept as needing nothing", () => {
    const reach = readConceptReach(nodes, edges, "domain:legacy")!;
    expect([reach.needs.length, reach.neededBy.length]).toEqual([0, 0]);
    expect(reach.other.map((r) => [r.id, r.line])).toEqual([["domain:catalog", "broader"]]);
  });

  it("reads an element's own relations by the same line rules", () => {
    const reach = readConceptReach(nodes, edges, "element:checkout-form")!;
    expect(reach.needs.map((r) => r.id)).toEqual(["element:price-table"]);
    expect(readConceptReach(nodes, edges, "element:price-table")!.neededBy.map((r) => r.id)).toEqual(["element:checkout-form"]);
  });

  it("has no reach for a project or a concept the map does not draw", () => {
    expect(readConceptReach(nodes, edges, "project:shop")).toBeNull();
    expect(readConceptReach(nodes, edges, "document:adr-1")).toBeNull();
  });
});

describe("a selected element on the map and in its panel", () => {
  it.each(VAULTS)("draws the %s vault's element lines exactly as the panel lists its rows", (_name, manifest) => {
    const { graphNodes, graphEdges, model } = vaultGraph(manifest);
    const elements = graphNodes.filter((n) => n.kind === "element");
    expect(elements.length).toBeGreaterThan(50);
    const differing = elements.flatMap(({ id }) => {
      const reach = readConceptReach(graphNodes, graphEdges, id)!;
      const rows = [...reach.needs, ...reach.neededBy, ...reach.other].map((r) => `${r.line} ${r.id}`).sort();
      const lines = resolveGraphAttention(model, id, true).lines.map((l) => `${l.kind} ${l.from === id ? l.to : l.from}`).sort();
      return JSON.stringify(rows) === JSON.stringify(lines) ? [] : [{ id, rows, lines }];
    });
    expect(differing).toEqual([]);
  });

  it.each(VAULTS)("counts a selected %s element's reach as the panel's two totals", (_name, manifest) => {
    const { graphNodes, graphEdges, model } = vaultGraph(manifest);
    for (const { id } of graphNodes.filter((n) => n.kind === "element")) {
      const reach = readConceptReach(graphNodes, graphEdges, id)!;
      expect(resolveGraphAttention(model, id, true).reach, id).toEqual({ needs: reach.needs.length, neededBy: reach.neededBy.length });
    }
  });

  it("lights an element with where it lives and its own far ends, never its capability's other lines", () => {
    const { model } = vaultGraph(docsManifest);
    for (const id of model.capabilityOf.keys()) {
      const attention = resolveGraphAttention(model, id, true);
      const owner = model.capabilityOf.get(id)!;
      const far = attention.lines.map((l) => (l.from === id ? l.to : l.from));
      expect(attention.lines.every((l) => l.from === id || l.to === id), id).toBe(true);
      expect([...attention.lit!].sort(), id).toEqual([...new Set([id, owner, model.domainOf.get(id)!, ...far])].sort());
    }
  });
});
