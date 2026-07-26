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

  it("면적은 개수에 비례하지 않는다 — 캡션이 「비례」라고 약속하면 안 되는 이유", () => {
    // 이 test 는 스케일을 고정하려는 게 아니라 **캡션의 상한**을 고정한다.
    // 읽히는 최소 크기(`+18` 바닥) 때문에 면적비는 데이터비보다 항상 작다.
    // 그래서 `minimapSublabel` 은 순서만 약속한다("많이 담긴 도메인이 더 크게").
    // 누군가 캡션을 「비례」로 되돌리려 하면 이 수치가 그걸 막는다.
    const layout = buildMiniDomainMapLayout([
      { id: "domain:big", title: "Big", total: 114 },
      { id: "domain:small", title: "Small", total: 7 },
    ]);
    const big = layout.nodes[0];
    const small = layout.nodes[1];
    const dataRatio = 114 / 7;
    const areaRatio = (big.width * big.height) / (small.width * small.height);

    expect(dataRatio).toBeCloseTo(16.29, 2);
    expect(areaRatio).toBeCloseTo(4.05, 1);
    // Tufte lie factor = 그려진 비 / 데이터 비. 1 이면 정직한 비례.
    expect(areaRatio / dataRatio).toBeLessThan(0.3);
    // 순서는 항상 지킨다 — 캡션이 약속하는 건 여기까지다.
    expect(big.width).toBeGreaterThan(small.width);
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
