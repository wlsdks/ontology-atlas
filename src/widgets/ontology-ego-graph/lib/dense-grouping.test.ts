import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyEgoNeighbor } from "@/shared/lib/ontology-tree";
import { EGO_LABEL_DENSE_THRESHOLD } from "./label-visibility";
import {
  EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP,
  groupEgoNeighborsForDenseRing,
} from "./dense-grouping";

function node(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "element:x",
    title: "x",
    kind: "element",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

function neighbor(
  overrides: Partial<OntologyEgoNeighbor> & { hop: 1 | 2 },
): OntologyEgoNeighbor {
  const id = overrides.neighborId ?? `n${Math.random()}`;
  return {
    node: node({ id }),
    neighborId: id,
    edge: {
      id: `edge:${id}`,
      from: "center",
      to: id,
      type: "related_to",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: new Date(0),
      lastApprovedBy: "test",
    },
    direction: "outgoing",
    ...overrides,
  };
}

function ringOfKind(count: number, hop: 1 | 2, kind: string, idPrefix: string) {
  return Array.from({ length: count }, (_, i) => {
    const id = `${kind}:${idPrefix}-${i}`;
    return neighbor({ hop, neighborId: id, node: node({ id, kind }) });
  });
}

describe("groupEgoNeighborsForDenseRing", () => {
  it("passes small rings through unchanged (regression — <12 neighbors unaffected)", () => {
    const neighbors = [
      ...ringOfKind(5, 1, "element", "e"),
      ...ringOfKind(3, 2, "capability", "c"),
    ];

    const result = groupEgoNeighborsForDenseRing(neighbors);

    expect(result.visible).toHaveLength(8);
    expect(result.visible).toEqual(neighbors);
    expect(result.overflow).toEqual([]);
  });

  it("passes a ring through unchanged at exactly the dense threshold", () => {
    const neighbors = ringOfKind(EGO_LABEL_DENSE_THRESHOLD, 1, "element", "e");

    const result = groupEgoNeighborsForDenseRing(neighbors);

    expect(result.visible).toHaveLength(EGO_LABEL_DENSE_THRESHOLD);
    expect(result.overflow).toEqual([]);
  });

  it("caps a single-kind dense ring to the per-kind cap and reports the remainder as one overflow group", () => {
    const neighbors = ringOfKind(34, 1, "element", "e");

    const result = groupEgoNeighborsForDenseRing(neighbors);

    expect(result.visible).toHaveLength(EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP);
    expect(result.visible).toEqual(
      neighbors.slice(0, EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP),
    );
    expect(result.overflow).toEqual([
      { hop: 1, kind: "element", count: 34 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP },
    ]);
  });

  it("never draws a 194-dot ring — 2-hop dense breakdown caps drawn nodes per kind", () => {
    // dogfood-shaped case: capability:mcp-server has 34 1-hop, 194 2-hop.
    const hop1 = ringOfKind(34, 1, "element", "e1");
    const hop2 = [
      ...ringOfKind(120, 2, "element", "e2"),
      ...ringOfKind(74, 2, "capability", "c2"),
    ];

    const result = groupEgoNeighborsForDenseRing([...hop1, ...hop2]);

    const drawnHop2 = result.visible.filter((n) => n.hop === 2);
    expect(drawnHop2.length).toBeLessThan(30);
    expect(drawnHop2.length).toBe(EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP * 2);
    const overflowHop2 = result.overflow.filter((g) => g.hop === 2);
    expect(overflowHop2).toEqual(
      expect.arrayContaining([
        { hop: 2, kind: "element", count: 120 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP },
        { hop: 2, kind: "capability", count: 74 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP },
      ]),
    );
  });

  it("treats hop=1 and hop=2 rings independently — one ring can be dense while the other is not", () => {
    const hop1 = ringOfKind(5, 1, "element", "e"); // not dense
    const hop2 = ringOfKind(40, 2, "capability", "c"); // dense

    const result = groupEgoNeighborsForDenseRing([...hop1, ...hop2]);

    expect(result.visible.filter((n) => n.hop === 1)).toHaveLength(5);
    expect(result.visible.filter((n) => n.hop === 2)).toHaveLength(
      EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP,
    );
    expect(result.overflow).toEqual([
      { hop: 2, kind: "capability", count: 40 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP },
    ]);
  });

  it("groups missing (node === null) neighbors under an 'unknown' kind bucket", () => {
    const neighbors = Array.from({ length: 20 }, (_, i) =>
      neighbor({ hop: 1, neighborId: `missing-${i}`, node: null }),
    );

    const result = groupEgoNeighborsForDenseRing(neighbors);

    expect(result.visible).toHaveLength(EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP);
    expect(result.overflow).toEqual([
      { hop: 1, kind: "unknown", count: 20 - EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP },
    ]);
  });

  it("supports a custom per-kind cap", () => {
    const neighbors = ringOfKind(20, 1, "element", "e");

    const result = groupEgoNeighborsForDenseRing(neighbors, 3);

    expect(result.visible).toHaveLength(3);
    expect(result.overflow).toEqual([{ hop: 1, kind: "element", count: 17 }]);
  });
});
