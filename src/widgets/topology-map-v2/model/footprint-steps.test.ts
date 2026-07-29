import { describe, expect, it } from "vitest";

import { buildFootprintSteps, buildWalkedEdgeKeys, walkedEdgeKey } from "./footprint-steps";

describe("buildFootprintSteps", () => {
  it("재방문 노드는 순번을 여러 개 갖는다(1부터)", () => {
    const steps = buildFootprintSteps(["a", "b", "a", "c", "a"]);
    expect(steps.get("a")).toEqual([1, 3, 5]);
    expect(steps.get("b")).toEqual([2]);
    expect(steps.get("c")).toEqual([4]);
  });

  it("빈 트레일은 빈 맵", () => {
    expect(buildFootprintSteps([]).size).toBe(0);
  });
});

describe("buildWalkedEdgeKeys", () => {
  it("연달아 방문한 쌍만 후보가 된다", () => {
    const keys = buildWalkedEdgeKeys(["a", "b", "c"]);
    expect(keys.has(walkedEdgeKey("a", "b"))).toBe(true);
    expect(keys.has(walkedEdgeKey("b", "c"))).toBe(true);
    // a→c 는 연달아 방문한 적이 없다 — 걸은 길이 아니다.
    expect(keys.has(walkedEdgeKey("a", "c"))).toBe(false);
  });

  it("방향이 달라도 같은 키 — 엣지는 무향으로 조회된다", () => {
    expect(buildWalkedEdgeKeys(["b", "a"]).has(walkedEdgeKey("a", "b"))).toBe(true);
  });

  it("같은 노드로 이어지는 자기 쌍은 만들지 않는다", () => {
    expect(buildWalkedEdgeKeys(["a", "a"]).size).toBe(0);
  });

  it("걸음이 하나면 쌍이 없다", () => {
    expect(buildWalkedEdgeKeys(["a"]).size).toBe(0);
  });
});
