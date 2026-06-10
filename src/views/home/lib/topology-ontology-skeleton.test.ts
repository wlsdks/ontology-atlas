import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildOntologySkeleton } from "./topology-ontology-skeleton";

function n(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id.toUpperCase(),
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
}

function e(from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id: `${from}>${to}:${type}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
}

/**
 * Fixture: 1 project, 2 domains.
 *  d1 contains c1(3 elements) c2(2) c3(1) c4(1) — over the cap=3, one overflow.
 *  d2 contains c5(1).
 *  c3 vs c4 tie on subtree weight (1) — c4 has a describes-evidence edge so it
 *  ranks above c3 on the first tiebreak.
 */
function fixture(): {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
} {
  const nodes = [
    n("p", "project"),
    n("d1", "domain"),
    n("d2", "domain"),
    n("c1", "capability"),
    n("c2", "capability"),
    n("c3", "capability"),
    n("c4", "capability"),
    n("c5", "capability"),
    n("e1", "element"),
    n("e2", "element"),
    n("e3", "element"),
    n("e4", "element"),
    n("e5", "element"),
    n("e6", "element"),
    n("e7", "element"),
    n("e8", "element"),
    n("doc", "document"),
  ];
  const edges = [
    e("p", "d1", "contains"),
    e("p", "d2", "contains"),
    e("d1", "c1", "contains"),
    e("d1", "c2", "contains"),
    e("d1", "c3", "contains"),
    e("d1", "c4", "contains"),
    e("d2", "c5", "contains"),
    e("c1", "e1", "contains"),
    e("c1", "e2", "contains"),
    e("c1", "e3", "contains"),
    e("c2", "e4", "contains"),
    e("c2", "e5", "contains"),
    e("c3", "e6", "contains"),
    e("c4", "e7", "contains"),
    e("c5", "e8", "contains"),
    e("doc", "c4", "describes"),
  ];
  return { nodes, edges };
}

describe("buildOntologySkeleton", () => {
  it("anchors every project and domain unconditionally", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges);
    expect(s.levelBySlug.get("p")).toBe("anchor");
    expect(s.levelBySlug.get("d1")).toBe("anchor");
    expect(s.levelBySlug.get("d2")).toBe("anchor");
  });

  it("computes subtree weight as the transitive contained-element count", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges);
    expect(s.subtreeWeightBySlug.get("c1")).toBe(3);
    expect(s.subtreeWeightBySlug.get("c2")).toBe(2);
    expect(s.subtreeWeightBySlug.get("c3")).toBe(1);
    expect(s.subtreeWeightBySlug.get("d1")).toBe(7);
    expect(s.subtreeWeightBySlug.get("d2")).toBe(1);
    expect(s.subtreeWeightBySlug.get("p")).toBe(8);
  });

  it("selects per-domain landmark capabilities by subtree weight up to the cap", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges, { perDomainCap: 3 });
    // d1: c1(3), c2(2), then the tie c3/c4(1) broken by describes-evidence → c4
    expect(s.landmarksByDomain.get("d1")).toEqual(["c1", "c2", "c4"]);
    expect(s.landmarksByDomain.get("d2")).toEqual(["c5"]);
    expect(s.levelBySlug.get("c1")).toBe("landmark");
    expect(s.levelBySlug.get("c4")).toBe("landmark");
    expect(s.levelBySlug.get("c5")).toBe("landmark");
  });

  it("hides non-landmark capabilities, elements, and documents", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges, { perDomainCap: 3 });
    expect(s.levelBySlug.get("c3")).toBe("hidden");
    expect(s.levelBySlug.get("e1")).toBe("hidden");
    expect(s.levelBySlug.get("doc")).toBe("hidden");
    expect(s.skeletonSlugs.has("c3")).toBe(false);
    expect(s.skeletonSlugs.has("c1")).toBe(true);
  });

  it("reports per-domain overflow (capabilities hidden beyond the cap)", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges, { perDomainCap: 3 });
    expect(s.overflowByDomain.get("d1")).toBe(1);
    expect(s.overflowByDomain.get("d2") ?? 0).toBe(0);
  });

  it("guarantees at least one landmark for a non-empty domain even at cap 1", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges, { perDomainCap: 1 });
    expect(s.landmarksByDomain.get("d1")).toEqual(["c1"]);
    expect(s.overflowByDomain.get("d1")).toBe(3);
  });

  it("is deterministic — identical output across runs (replay-safe)", () => {
    const { nodes, edges } = fixture();
    const a = buildOntologySkeleton(nodes, edges);
    const b = buildOntologySkeleton(nodes, edges);
    const norm = (s: ReturnType<typeof buildOntologySkeleton>) => ({
      skeleton: [...s.skeletonSlugs].sort(),
      levels: [...s.levelBySlug.entries()].sort(),
      weights: [...s.subtreeWeightBySlug.entries()].sort(),
      landmarks: [...s.landmarksByDomain.entries()].sort(),
    });
    expect(norm(a)).toEqual(norm(b));
  });
});
