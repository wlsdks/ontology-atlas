import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildProjectOntologyCounts,
  pickDominantOntologyKind,
} from "./project-ontology-counts";

function n(
  id: string,
  kind: string,
  projectIds: string[] = [],
): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(),
    lastApprovedBy: "system",
  } as KnowledgeGraphNode;
}

describe("buildProjectOntologyCounts", () => {
  it("returns empty map for no nodes", () => {
    expect(buildProjectOntologyCounts([]).size).toBe(0);
  });

  it("aggregates a single project — meaningful kinds only", () => {
    const nodes = [
      n("dom1", "domain", ["alpha"]),
      n("cap1", "capability", ["alpha"]),
      n("cap2", "capability", ["alpha"]),
      n("el1", "element", ["alpha"]),
      n("u1", "unknown", ["alpha"]),
    ];
    const map = buildProjectOntologyCounts(nodes);
    const alpha = map.get("alpha");
    expect(alpha).toBeDefined();
    expect(alpha?.total).toBe(5);
    expect(alpha?.byKind).toEqual({
      domain: 1,
      capability: 2,
      element: 1,
      unknown: 1,
    });
  });

  it("excludes project / document kinds from aggregation", () => {
    const nodes = [
      n("p1", "project", ["alpha"]),
      n("d1", "document", ["alpha"]),
      n("dom1", "domain", ["alpha"]),
    ];
    const map = buildProjectOntologyCounts(nodes);
    expect(map.get("alpha")?.total).toBe(1);
    expect(map.get("alpha")?.byKind.domain).toBe(1);
  });

  it("counts a node into every project listed in projectIds (sum semantics)", () => {
    const nodes = [n("dom1", "domain", ["alpha", "beta"])];
    const map = buildProjectOntologyCounts(nodes);
    expect(map.get("alpha")?.byKind.domain).toBe(1);
    expect(map.get("beta")?.byKind.domain).toBe(1);
  });

  it("ignores empty / falsy slugs in projectIds", () => {
    const nodes = [n("dom1", "domain", ["", "alpha", null as unknown as string])];
    const map = buildProjectOntologyCounts(nodes);
    expect(map.size).toBe(1);
    expect(map.get("alpha")?.total).toBe(1);
  });

  it("returns zero-filled byKind for project that only had unknown kinds", () => {
    const nodes = [n("u1", "unknown", ["solo"])];
    const counts = buildProjectOntologyCounts(nodes).get("solo");
    expect(counts?.byKind).toEqual({
      domain: 0,
      capability: 0,
      element: 0,
      unknown: 1,
    });
  });
});

describe("pickDominantOntologyKind", () => {
  it("returns null for undefined or zero-total counts", () => {
    expect(pickDominantOntologyKind(undefined)).toBeNull();
    expect(
      pickDominantOntologyKind({
        byKind: { domain: 0, capability: 0, element: 0, unknown: 0 },
        total: 0,
      }),
    ).toBeNull();
  });

  it("prioritizes unknown when stub is present (검수 신호)", () => {
    const dominant = pickDominantOntologyKind({
      byKind: { domain: 5, capability: 3, element: 2, unknown: 1 },
      total: 11,
    });
    expect(dominant).toBe("unknown");
  });

  it("returns the kind with highest count when no unknown", () => {
    const dominant = pickDominantOntologyKind({
      byKind: { domain: 1, capability: 4, element: 2, unknown: 0 },
      total: 7,
    });
    expect(dominant).toBe("capability");
  });

  it("breaks ties by MEANINGFUL_ONTOLOGY_KINDS order (domain > capability > element)", () => {
    const dominant = pickDominantOntologyKind({
      byKind: { domain: 2, capability: 2, element: 2, unknown: 0 },
      total: 6,
    });
    expect(dominant).toBe("domain");
  });

  it("returns the only non-zero kind", () => {
    const dominant = pickDominantOntologyKind({
      byKind: { domain: 0, capability: 0, element: 7, unknown: 0 },
      total: 7,
    });
    expect(dominant).toBe("element");
  });
});
