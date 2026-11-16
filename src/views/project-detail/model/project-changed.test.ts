import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildProjectChanged } from "./project-changed";

const SLUG = "shop";

function node(id: string, title: string, projectIds: string[] = [SLUG], display?: string): KnowledgeGraphNode {
  return {
    id,
    title,
    ...(display ? { display } : {}),
    kind: id.split(":")[0]!,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

describe("buildProjectChanged", () => {
  it("keeps only this project's concepts from the lens window, the project itself included", () => {
    const nodes = [node("capability:pay", "Pay"), node("capability:ship", "Ship", ["other"]), node(`project:${SLUG}`, "Shop", [])];
    const lens = [
      { id: "capability:pay", agoDays: 1 },
      { id: "capability:ship", agoDays: 0 },
      { id: `project:${SLUG}`, agoDays: 2 },
    ];
    const result = buildProjectChanged(lens, nodes, SLUG);
    expect(result.total).toBe(2);
    expect([...result.changedIds]).toEqual(["capability:pay", `project:${SLUG}`]);
  });

  it("shows the three newest, ties by the display name, and counts the rest", () => {
    const nodes = ["a", "b", "c", "d"].map((s) => node(`capability:${s}`, s.toUpperCase()));
    nodes[3] = node("capability:d", "D", [SLUG], "Aardvark");
    const lens = [
      { id: "capability:a", agoDays: 3 },
      { id: "capability:b", agoDays: 0 },
      { id: "capability:c", agoDays: 1 },
      { id: "capability:d", agoDays: 1 },
    ];
    const result = buildProjectChanged(lens, nodes, SLUG);
    expect(result.visible.map((r) => r.name)).toEqual(["B", "Aardvark", "C"]);
    expect(result.total).toBe(4);
  });

  it("ignores a lens row whose concept is no longer in the folder", () => {
    const result = buildProjectChanged([{ id: "capability:deleted", agoDays: 0 }], [], SLUG);
    expect(result).toMatchObject({ visible: [], total: 0 });
  });
});
