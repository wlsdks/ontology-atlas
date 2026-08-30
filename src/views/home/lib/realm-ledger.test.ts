import { describe, expect, it } from "vitest";

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyTree } from "@/entities/knowledge-graph/lib/ontology-tree";
import {
  collectRealmMemberIds,
  computeRealmBoundary,
  computeRealmCensus,
  findRealmSubtree,
} from "./realm-ledger";

/**
 * Realm ledger derivations over a small ontology:
 *   project P ─contains→ domain D1 ─contains→ cap C1 ─contains→ elem E1
 *                     └─contains→ cap C2
 *   project P ─contains→ domain D2 ─contains→ cap C3
 *   lateral boundary: C1 ─depends_on→ C3   (leaves D1's realm for D2)
 *                     E1 ─uses→ E9 (an element outside the graph, no domain)
 * Structural `contains` edges must be excluded from the boundary.
 */
const node = (id: string, kind: string, title = id): KnowledgeGraphNode => ({
  id,
  title,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date(0),
  lastApprovedBy: "test",
});

const edge = (from: string, to: string, type: string): KnowledgeGraphEdge => ({
  id: `${from}-${type}-${to}`,
  from,
  to,
  type,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date(0),
  lastApprovedBy: "test",
});

const nodes: KnowledgeGraphNode[] = [
  node("P", "project"),
  node("D1", "domain"),
  node("D2", "domain"),
  node("C1", "capability"),
  node("C2", "capability"),
  node("C3", "capability"),
  node("E1", "element"),
  node("E9", "element"),
];
const edges: KnowledgeGraphEdge[] = [
  edge("P", "D1", "contains"),
  edge("P", "D2", "contains"),
  edge("D1", "C1", "contains"),
  edge("D1", "C2", "contains"),
  edge("C1", "E1", "contains"),
  edge("D2", "C3", "contains"),
  edge("C1", "C3", "depends_on"),
  edge("E1", "E9", "uses"),
];

const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
const roots = buildOntologyTree(nodes, edges).roots;

describe("findRealmSubtree", () => {
  it("locates a nested (non-root) node's subtree", () => {
    const subtree = findRealmSubtree(roots, "D1");
    expect(subtree?.node.id).toBe("D1");
    // D1 has C1, C2 (and C1 has E1) — the subtree carries its descendants.
    expect(subtree?.children.map((c) => c.node.id).sort()).toEqual(["C1", "C2"]);
  });

  it("returns null for an unknown slug", () => {
    expect(findRealmSubtree(roots, "nope")).toBeNull();
  });
});

describe("computeRealmCensus", () => {
  it("counts descendants by kind and reports the deepest relative depth", () => {
    const subtree = findRealmSubtree(roots, "D1")!;
    const census = computeRealmCensus(subtree);
    // C1, C2 (capabilities) + E1 (element). D1 root itself not counted.
    expect(census.capabilityCount).toBe(2);
    expect(census.elementCount).toBe(1);
    expect(census.domainCount).toBe(0);
    expect(census.descendantCount).toBe(3);
    // D1 → C1 → E1 = depth 2.
    expect(census.depth).toBe(2);
  });

  it("reports zero for a leaf realm", () => {
    const subtree = findRealmSubtree(roots, "E1")!;
    expect(computeRealmCensus(subtree)).toEqual({
      elementCount: 0,
      capabilityCount: 0,
      domainCount: 0,
      descendantCount: 0,
      depth: 0,
    });
  });
});

describe("collectRealmMemberIds", () => {
  it("includes the root and every descendant", () => {
    const subtree = findRealmSubtree(roots, "D1")!;
    expect([...collectRealmMemberIds(subtree)].sort()).toEqual(["C1", "C2", "D1", "E1"]);
  });
});

describe("computeRealmBoundary", () => {
  it("keeps only lateral edges that cross the member boundary", () => {
    const memberIds = collectRealmMemberIds(findRealmSubtree(roots, "D1")!);
    const boundary = computeRealmBoundary({ edges, memberIds, nodeById });
    // C1 -depends_on-> C3 (out to D2) and E1 -uses-> E9 (out to E9). The
    // parent contains P->D1 is structural → excluded.
    expect(boundary.total).toBe(2);
    const byEdge = new Map(boundary.crossings.map((c) => [c.edgeId, c]));
    expect(byEdge.get("C1-depends_on-C3")?.outsideId).toBe("C3");
    // C3's nearest domain ancestor is D2 → jump target.
    expect(byEdge.get("C1-depends_on-C3")?.jumpRealmId).toBe("D2");
    // E9 has no domain ancestor → jump falls back to the node itself.
    expect(byEdge.get("E1-uses-E9")?.jumpRealmId).toBe("E9");
  });

  it("excludes structural containment edges", () => {
    const memberIds = collectRealmMemberIds(findRealmSubtree(roots, "D1")!);
    const boundary = computeRealmBoundary({ edges, memberIds, nodeById });
    expect(boundary.crossings.every((c) => c.relationType !== "contains")).toBe(true);
  });

  it("returns nothing when the realm has no outward relations", () => {
    const memberIds = collectRealmMemberIds(findRealmSubtree(roots, "C2")!);
    const boundary = computeRealmBoundary({ edges, memberIds, nodeById });
    expect(boundary.total).toBe(0);
  });

  it("is deterministic in ordering", () => {
    const memberIds = collectRealmMemberIds(findRealmSubtree(roots, "D1")!);
    const a = computeRealmBoundary({ edges, memberIds, nodeById });
    const b = computeRealmBoundary({ edges: [...edges].reverse(), memberIds, nodeById });
    expect(a.crossings.map((c) => c.edgeId)).toEqual(b.crossings.map((c) => c.edgeId));
  });
});
