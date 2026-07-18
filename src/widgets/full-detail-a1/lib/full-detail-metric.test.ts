import { describe, expect, it } from "vitest";
import { formatFullDetailMetricLine } from "./full-detail-metric";

describe("formatFullDetailMetricLine", () => {
  it("담는 것 · 쓰는 곳 · 기대는 곳 · N단계 도달 순서로 하나의 engraved line", () => {
    const line = formatFullDetailMetricLine(
      { contains: 18, usedBy: 2, dependsOn: 1, reach: 279 },
      {
        contains: "담는 것",
        usedBy: "이 노드를 쓰는 곳",
        dependsOn: "이 노드가 기대는 곳",
        reach: "3단계 도달",
      },
    );
    expect(line).toBe(
      "담는 것 18 · 이 노드를 쓰는 곳 2 · 이 노드가 기대는 곳 1 · 3단계 도달 279",
    );
  });

  it("0 도 명시적으로 렌더 (누락 아님)", () => {
    const line = formatFullDetailMetricLine(
      { contains: 0, usedBy: 0, dependsOn: 0, reach: 0 },
      { contains: "a", usedBy: "b", dependsOn: "c", reach: "d" },
    );
    expect(line).toBe("a 0 · b 0 · c 0 · d 0");
  });
});
