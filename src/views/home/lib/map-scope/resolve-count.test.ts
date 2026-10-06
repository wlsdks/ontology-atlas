import { describe, expect, it } from "vitest";
import { resolveMapScopeCount } from "./resolve-count";

describe("map scope membership count", () => {
  const nodes = [{ id: "A" }, { id: "B" }, { id: "E" }];
  const edges = [
    { source: "A", target: "E", kind: "contains" as const },
    { source: "B", target: "E", kind: "contains" as const },
  ];

  it("counts the shared concept in either parent's realm", () => {
    expect(resolveMapScopeCount(nodes, edges, "A")).toBe(2);
    expect(resolveMapScopeCount(nodes, edges, "B")).toBe(2);
    expect(resolveMapScopeCount(nodes, edges.toReversed(), "B")).toBe(2);
    expect(resolveMapScopeCount(nodes, edges, null)).toBe(3);
  });

  it("counts once across duplicate and cyclic containment while excluding dependency and missing endpoints", () => {
    expect(resolveMapScopeCount(nodes, [
      ...edges, ...edges,
      { source: "E", target: "B", kind: "contains" },
      { source: "B", target: "A", kind: "depends" },
      { source: "B", target: "missing", kind: "contains" },
      { source: "missing", target: "A", kind: "contains" },
    ], "B")).toBe(2);
  });

  it("suppresses an unknown root and handles empty and single-concept maps", () => {
    expect(resolveMapScopeCount(nodes, edges, "unknown")).toBeNull();
    expect(resolveMapScopeCount([], [], null)).toBe(0);
    expect(resolveMapScopeCount([{ id: "E" }], [], "E")).toBe(1);
  });
});
