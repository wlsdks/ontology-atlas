import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import {
  countCrossProjectEdges,
  isContainmentRelation,
} from "./relations";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");
const node = (
  id: string,
  title = id,
  projectIds: string[] = [],
): KnowledgeGraphNode => ({
  id,
  title,
  kind: "capability",
  projectIds,
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
const edge = (
  id: string,
  from: string,
  to: string,
  type = "depends_on",
  evidenceIds: string[] = [],
): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type,
  projectIds: [],
  evidenceIds,
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});

describe("countCrossProjectEdges", () => {
  it("counts 0 for empty input", () => {
    expect(countCrossProjectEdges([], [])).toBe(0);
  });

  it("counts 0 for an edge within one project", () => {
    const ns = [node("a", "A", ["p1"]), node("b", "B", ["p1"])];
    const es = [edge("e1", "a", "b", "depends_on")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });

  it("counts only edges between disjoint projectIds", () => {
    const ns = [
      node("a", "A", ["demo-iam"]),
      node("b", "B", ["sample-app"]),
      node("c", "C", ["demo-iam"]),
      node("d", "D", ["demo-iam"]),
    ];
    const es = [
      edge("e1", "a", "b", "depends_on"), // cross
      edge("e2", "c", "d", "uses"), // Same project
      edge("e3", "b", "a", "uses"), // cross
    ];
    expect(countCrossProjectEdges(es, ns)).toBe(2);
  });

  it("counts 0 for an edge to a missing node", () => {
    const ns = [node("a", "A", ["p1"])];
    const es = [edge("e1", "a", "ghost", "depends_on")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });

  it("counts 0 for nodes without projectIds", () => {
    const ns = [node("a", "A", []), node("b", "B", ["p2"])];
    const es = [edge("e1", "a", "b", "uses")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });
});

describe("isContainmentRelation", () => {
  it("treats contains and belongs_to as containment", () => {
    expect(isContainmentRelation("contains")).toBe(true);
    expect(isContainmentRelation("belongs_to")).toBe(true);
  });
  it("does not treat dependency or association as containment", () => {
    expect(isContainmentRelation("depends_on")).toBe(false);
    expect(isContainmentRelation("related_to")).toBe(false);
    expect(isContainmentRelation("relates")).toBe(false);
    expect(isContainmentRelation("describes")).toBe(false);
    expect(isContainmentRelation("")).toBe(false);
  });
});
