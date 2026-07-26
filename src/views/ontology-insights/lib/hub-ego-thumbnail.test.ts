import { describe, expect, it } from "vitest";
import { buildHubEgoThumbnail } from "./hub-ego-thumbnail";

const nodes = [
  { id: "capability:mcp", title: "MCP Server", kind: "capability" },
  { id: "capability:a", title: "A", kind: "capability" },
  { id: "capability:b", title: "B", kind: "capability" },
  { id: "capability:c", title: "C", kind: "capability" },
];

describe("buildHubEgoThumbnail", () => {
  it("reports real degree and marks depends_on spokes as dashed", () => {
    const edges = [
      { from: "capability:a", to: "capability:mcp", type: "depends_on" },
      { from: "capability:mcp", to: "capability:b", type: "contains" },
      { from: "capability:mcp", to: "capability:c", type: "relates" },
    ];
    const thumb = buildHubEgoThumbnail("capability:mcp", nodes, edges);
    expect(thumb.degree).toBe(3);
    expect(thumb.spokes).toHaveLength(3);
    expect(thumb.spokes.filter((s) => s.dashed)).toHaveLength(1);
  });

  it("caps displayed spokes at 12 but keeps the real degree", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `capability:n${i}`, title: `N${i}`, kind: "capability" }));
    const edges = many.map((n) => ({ from: "capability:mcp", to: n.id, type: "contains" }));
    const thumb = buildHubEgoThumbnail("capability:mcp", [nodes[0], ...many], edges);
    expect(thumb.degree).toBe(20);
    expect(thumb.spokes).toHaveLength(12);
  });

  it("returns an empty thumbnail for a node with no connections", () => {
    const thumb = buildHubEgoThumbnail("capability:mcp", nodes, []);
    expect(thumb).toEqual({ degree: 0, spokes: [] });
  });

  it("distributes spoke angles evenly starting at -90deg (12 o'clock)", () => {
    const edges = [
      { from: "capability:mcp", to: "capability:a", type: "contains" },
      { from: "capability:mcp", to: "capability:b", type: "contains" },
    ];
    const thumb = buildHubEgoThumbnail("capability:mcp", nodes, edges);
    expect(thumb.spokes[0].angle).toBeCloseTo(-Math.PI / 2);
    expect(thumb.spokes[1].angle).toBeCloseTo(Math.PI / 2);
  });
});
