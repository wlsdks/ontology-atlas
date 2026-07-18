import { describe, expect, it } from "vitest";
import { buildMiniDomainMapLayout } from "./mini-domain-map-layout";

describe("buildMiniDomainMapLayout", () => {
  it("returns an empty node list (just the center) when there are no domains", () => {
    const layout = buildMiniDomainMapLayout([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.center.x).toBeGreaterThan(0);
    expect(layout.center.y).toBeGreaterThan(0);
  });

  it("places a single domain directly above the center (top of the ellipse)", () => {
    const layout = buildMiniDomainMapLayout([{ id: "domain:a", title: "A", total: 10 }]);
    expect(layout.nodes).toHaveLength(1);
    const [node] = layout.nodes;
    expect(node.x).toBeCloseTo(layout.center.x, 5);
    expect(node.y).toBeLessThan(layout.center.y);
  });

  it("spreads N domains evenly around the center, each with a distinct position", () => {
    const domains = [
      { id: "domain:a", title: "A", total: 10 },
      { id: "domain:b", title: "B", total: 20 },
      { id: "domain:c", title: "C", total: 5 },
    ];
    const layout = buildMiniDomainMapLayout(domains);
    expect(layout.nodes).toHaveLength(3);
    const positions = layout.nodes.map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`);
    expect(new Set(positions).size).toBe(3);
  });

  it("sizes rects monotonically with total count (bigger domain -> bigger rect)", () => {
    const layout = buildMiniDomainMapLayout([
      { id: "domain:small", title: "Small", total: 4 },
      { id: "domain:big", title: "Big", total: 100 },
    ]);
    const small = layout.nodes.find((n) => n.id === "domain:small")!;
    const big = layout.nodes.find((n) => n.id === "domain:big")!;
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(small.height);
  });

  it("marks only the first (largest, by input order) domain as top", () => {
    const layout = buildMiniDomainMapLayout([
      { id: "domain:a", title: "A", total: 50 },
      { id: "domain:b", title: "B", total: 10 },
    ]);
    expect(layout.nodes[0].isTop).toBe(true);
    expect(layout.nodes[1].isTop).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const domains = [
      { id: "domain:a", title: "A", total: 10 },
      { id: "domain:b", title: "B", total: 20 },
    ];
    expect(buildMiniDomainMapLayout(domains)).toEqual(buildMiniDomainMapLayout(domains));
  });
});
