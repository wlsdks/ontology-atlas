import { describe, expect, it } from "vitest";

import { relaxNodeSeparation, type SeparationNode } from "./separation";

const dist = (a: SeparationNode, b: SeparationNode) => Math.hypot(b.x - a.x, b.y - a.y);

describe("relaxNodeSeparation", () => {
  it("겹친 쌍을 최소 거리 이상으로 밀어낸다", () => {
    const nodes: SeparationNode[] = [
      { id: "parent", x: 0, y: 0, r: 28 },
      { id: "child", x: 5, y: 0, r: 7 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual((28 + 7) * 1.35 - 0.01);
  });

  it("핀 노드는 절대 움직이지 않는다 — 상대만 밀린다", () => {
    const nodes: SeparationNode[] = [
      { id: "pinned", x: 0, y: 0, r: 17 },
      { id: "other", x: 3, y: 0, r: 17 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2, pinnedId: "pinned" });
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual(34 * 1.35 - 0.01);
  });

  it("이미 떨어진 쌍은 건드리지 않는다 (결정론·무부작용)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 10 },
      { id: "b", x: 200, y: 0, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 200, y: 0 });
  });

  it("완전 동일 좌표도 결정론적으로 분리한다 (0 나누기 방어)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 50, y: 50, r: 10 },
      { id: "b", x: 50, y: 50, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(0);
  });
});
