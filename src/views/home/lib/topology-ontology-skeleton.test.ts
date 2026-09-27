import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildOntologySkeleton } from "./topology-ontology-skeleton";
import { synthesizeVaultGraph } from "./synth-vault";

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

  it("surfaces one evidence element landmark and hides the rest", () => {
    const { nodes, edges } = fixture();
    const s = buildOntologySkeleton(nodes, edges, { perDomainCap: 3 });
    expect(s.levelBySlug.get("c3")).toBe("hidden");
    expect(s.levelBySlug.get("e1")).toBe("landmark");
    expect(s.levelBySlug.get("e2")).toBe("hidden");
    expect(s.levelBySlug.get("doc")).toBe("hidden");
    expect(s.skeletonSlugs.has("c3")).toBe(false);
    expect(s.skeletonSlugs.has("c1")).toBe(true);
    expect(s.skeletonSlugs.has("e1")).toBe(true);
    expect(s.evidenceLandmarksByDomain.get("d1")).toEqual(["e1"]);
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
      evidence: [...s.evidenceLandmarksByDomain.entries()].sort(),
    });
    expect(norm(a)).toEqual(norm(b));
  });

  it("terminates on containment cycles and counts each element once", () => {
    const nodes = [
      n("p", "project"),
      n("d", "domain"),
      n("c1", "capability"),
      n("c2", "capability"),
      n("e1", "element"),
      n("e2", "element"),
    ];
    const edges = [
      e("p", "d", "contains"),
      e("d", "p", "contains"),
      e("d", "c1", "contains"),
      e("d", "c2", "contains"),
      e("c1", "e1", "contains"),
      e("e1", "c1", "contains"),
      e("c1", "c2", "contains"),
      e("c2", "c1", "contains"),
      e("e2", "c2", "belongs_to"),
    ];
    const s = buildOntologySkeleton(nodes, edges);
    expect(["p", "d", "c1", "c2"].map((slug) => s.subtreeWeightBySlug.get(slug))).toEqual([2, 2, 2, 2]);
    expect(s.landmarksByDomain.get("d")).toEqual(["c1", "c2"]);
    expect(s.evidenceLandmarksByDomain.get("d")).toEqual(["e1"]);
  });

  it("counts an element two capabilities share once in their domain", () => {
    const nodes = [
      n("p", "project"),
      n("d", "domain"),
      n("c1", "capability"),
      n("c2", "capability"),
      n("shared", "element"),
      n("own", "element"),
      n("doc", "document"),
    ];
    const edges = [
      e("p", "d", "contains"),
      e("d", "c1", "contains"),
      e("d", "c2", "contains"),
      e("c1", "shared", "contains"),
      e("c2", "shared", "contains"),
      e("c2", "own", "contains"),
      e("doc", "shared", "describes"),
    ];
    const s = buildOntologySkeleton(nodes, edges);
    expect(["c1", "c2", "d", "p"].map((slug) => s.subtreeWeightBySlug.get(slug))).toEqual([1, 2, 2, 2]);
    expect(s.landmarksByDomain.get("d")).toEqual(["c2", "c1"]);
    expect(s.evidenceLandmarksByDomain.get("d")).toEqual(["shared"]);
  });

  it("returns an empty skeleton for an empty graph", () => {
    const s = buildOntologySkeleton([], []);
    const sizes = [s.skeletonSlugs, s.levelBySlug, s.subtreeWeightBySlug, s.landmarksByDomain, s.evidenceLandmarksByDomain, s.overflowByDomain]
      .map((collection) => collection.size);
    expect(sizes).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

/** `synthesizeVaultGraph` with describing documents and dependencies, so fan-in and slug decide ties in weight. */
function referencedVault(size: number) {
  const { nodes, edges } = synthesizeVaultGraph(size);
  const targets = nodes.filter((node) => node.kind === "capability" || node.kind === "element").map((node) => node.id);
  targets.forEach((id, index) => {
    for (let doc = 0; doc < index % 3; doc += 1) {
      nodes.push(n(`doc-${index}-${doc}`, "document"));
      edges.push(e(`doc-${index}-${doc}`, id, "describes"));
    }
    if (index % 4 === 1) edges.push(e(targets[(index * 7) % targets.length], id, "depends_on"));
  });
  return { nodes, edges };
}

/** The ranking as defined, reading each slug's incoming edges. */
function rankByDefinition(slugs: readonly string[], edges: readonly KnowledgeGraphEdge[], weight: (slug: string) => number) {
  const incoming = Map.groupBy(edges, (edge) => edge.to);
  const fanIn = (slug: string, type: string) => (incoming.get(slug) ?? []).filter((edge) => edge.type === type).length;
  return slugs
    .map((slug) => ({ slug, weight: weight(slug), describes: fanIn(slug, "describes"), dependsOn: fanIn(slug, "depends_on") }))
    .sort((a, b) => b.weight - a.weight || b.describes - a.describes || b.dependsOn - a.dependsOn || a.slug.localeCompare(b.slug))
    .map((entry) => entry.slug);
}

describe("buildOntologySkeleton on synthetic vaults", () => {
  it.each([100, 1000, 10000])("ranks landmarks, overflow, evidence and levels as defined at %i nodes", (size) => {
    const { nodes, edges } = referencedVault(size);
    const s = buildOntologySkeleton(nodes, edges);
    const kindById = new Map(nodes.map((node) => [node.id, node.kind]));
    const children = new Map<string, string[]>();
    for (const edge of edges) {
      const [parent, child] = edge.type === "contains" ? [edge.from, edge.to] : edge.type === "belongs_to" ? [edge.to, edge.from] : [];
      if (!parent || !child) continue;
      const list = children.get(parent);
      if (list) list.push(child);
      else children.set(parent, [child]);
    }
    const elementsUnder = (start: string) => {
      const seen = new Set([start]);
      const queue = [start];
      for (let i = 0; i < queue.length; i += 1) {
        for (const child of children.get(queue[i]) ?? []) {
          if (seen.has(child)) continue;
          seen.add(child);
          queue.push(child);
        }
      }
      return queue.filter((id) => kindById.get(id) === "element");
    };
    const weight = (slug: string) => s.subtreeWeightBySlug.get(slug) ?? 0;

    for (const domain of nodes.filter((node) => node.kind === "domain")) {
      const capabilities = [...new Set(children.get(domain.id) ?? [])].filter((id) => kindById.get(id) === "capability");
      const ranked = rankByDefinition(capabilities, edges, weight);
      expect(s.landmarksByDomain.get(domain.id)).toEqual(ranked.slice(0, 3));
      expect(s.overflowByDomain.get(domain.id)).toBe(Math.max(0, ranked.length - 3));
    }
    expect(s.evidenceLandmarksByDomain.size).toBe(1);
    const [[evidenceDomain, [evidence]]] = [...s.evidenceLandmarksByDomain];
    const candidates = [...new Set(s.landmarksByDomain.get(evidenceDomain)!.flatMap(elementsUnder))];
    expect(evidence).toBe(rankByDefinition(candidates, edges, () => 0)[0]);

    const landmarks = new Set([...[...s.landmarksByDomain.values()].flat(), evidence]);
    const levelOf = (node: KnowledgeGraphNode) =>
      node.kind === "project" || node.kind === "domain" ? "anchor" : landmarks.has(node.id) ? "landmark" : "hidden";
    expect(nodes.filter((node) => s.levelBySlug.get(node.id) !== levelOf(node))).toEqual([]);
  });

  it("keeps edge reads linear in the edge count however many capabilities tie on weight", () => {
    const { nodes, edges } = referencedVault(1000);
    let reads = 0;
    const counted = new Proxy(edges, {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    buildOntologySkeleton(nodes, counted);
    expect(reads).toBeLessThanOrEqual(3 * edges.length);
  });
});
