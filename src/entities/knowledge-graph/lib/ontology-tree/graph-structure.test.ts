import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import {
  buildContainmentParents,
  computeDegreeCentrality,
  nearestDomainId,
  selectRecentNodes,
} from "./graph-structure";

const node = (
  id: string,
  kind = "capability",
  approvedAt = new Date("2026-04-27T00:00:00Z"),
): KnowledgeGraphNode => ({
  id,
  title: id,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: approvedAt,
  lastApprovedBy: "test",
});
const edge = (id: string, from: string, to: string): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type: "depends_on",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-04-27T00:00:00Z"),
  lastApprovedBy: "test",
});

describe("computeDegreeCentrality", () => {
  it("includes every input node, including degree 0", () => {
    const degrees = computeDegreeCentrality([node("a"), node("b"), node("c")], []);
    expect(degrees.get("a")).toBe(0);
    expect(degrees.get("b")).toBe(0);
    expect(degrees.get("c")).toBe(0);
  });

  it("sums outgoing and incoming edges", () => {
    const degrees = computeDegreeCentrality(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "c", "a")],
    );
    expect(degrees.get("a")).toBe(2); // out + in
    expect(degrees.get("b")).toBe(1);
    expect(degrees.get("c")).toBe(1);
  });

  it("counts a self-loop once", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("loop", "a", "a")]);
    expect(degrees.get("a")).toBe(1);
  });

  it("ignores edges to missing nodes", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("e", "a", "ghost")]);
    expect(degrees.get("a")).toBe(1);
    expect(degrees.has("ghost")).toBe(false);
  });
});

describe("nearestDomainId", () => {
  it("returns null when containment cycles", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("capability:login", "capability"),
      node("capability:session", "capability"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "capability:session", "capability:login"), type: "contains" },
      { ...edge("e2", "capability:login", "capability:session"), type: "contains" },
    ];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const parentOf = buildContainmentParents(edges, nodeById);

    expect(nearestDomainId(nodes[1], parentOf, nodeById)).toBeNull();
    expect(nearestDomainId(nodes[0], parentOf, nodeById)).toBe("domain:auth");
  });
});

describe("selectRecentNodes", () => {
  it("sorts by lastApprovedAt descending with a limit", () => {
    const D1 = new Date("2026-04-20T00:00:00Z");
    const D2 = new Date("2026-04-25T00:00:00Z");
    const D3 = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes(
      [node("a", "capability", D1), node("b", "capability", D2), node("c", "capability", D3)],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("c");
    expect(result[1]?.id).toBe("b");
  });

  it("breaks timestamp ties by title ascending", () => {
    const sameDate = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes([
      node("zebra", "capability", sameDate),
      node("apple", "capability", sameDate),
    ]);
    expect(result[0]?.id).toBe("apple");
    expect(result[1]?.id).toBe("zebra");
  });
});
