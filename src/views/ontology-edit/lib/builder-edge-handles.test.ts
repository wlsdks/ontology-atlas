import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { resolveBuilderEdgeEndpointHandles } from "./builder-edge-handles";

function node(id: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
  };
}

describe("resolveBuilderEdgeEndpointHandles", () => {
  it("routes left-to-right edges through side ports instead of node centers", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 360, 0))).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("routes right-to-left edges through opposite side ports", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 360, 0), node("b", 0, 0))).toEqual({
      sourceHandle: "source-left",
      targetHandle: "target-right",
    });
  });

  it("routes vertically stacked relation edges through facing top/bottom ports", () => {
    // 같은 세로줄(작은 Δx)에 아래로 쌓인 노드 → source 하단에서 나가 target
    // 상단으로 곧게 들어간다. 예전 same-side(right→right) 대신 마주보는 상/하.
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 20, 240))).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });

  it("routes upward vertically stacked edges through source-top/target-bottom", () => {
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 240), node("b", 20, 0))).toEqual({
      sourceHandle: "source-top",
      targetHandle: "target-bottom",
    });
  });

  it("routes vertically stacked containment edges through facing top/bottom ports too", () => {
    expect(
      resolveBuilderEdgeEndpointHandles(
        node("project", 0, 0),
        node("domain", 20, 240),
        "containment",
      ),
    ).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });

  it("never loops back on a horizontally-separated rank even when vertical delta is larger (regression: owner hairpin screenshot)", () => {
    // dagre LR: project 왼쪽, domain 이 한 rank 오른쪽(Δx≈290)이면서 세로로도
    // 크게 벌어진(Δy≈300) 최상/최하단 domain. 예전 로직은 |Δy|>|Δx| 만 보고
    // source-right→target-right(top domain 은 left→left) 같은 same-side 포트를
    // 골라 헤어핀 루프를 만들었다. 이제는 수평 분리를 우선해 마주보는 좌/우.
    const bottomDomain = resolveBuilderEdgeEndpointHandles(
      node("project", 0, 300),
      node("domain", 290, 600),
      "containment",
    );
    expect(bottomDomain).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });

    const topDomain = resolveBuilderEdgeEndpointHandles(
      node("project", 0, 300),
      node("domain", 290, 0),
      "containment",
    );
    expect(topDomain).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("faces left when the target sits to the upper-left across a rank", () => {
    // 역방향(타깃이 왼쪽) + 위쪽 큰 세로 오프셋에서도 루프 없이 마주보는 포트.
    expect(
      resolveBuilderEdgeEndpointHandles(node("a", 290, 600), node("b", 0, 300)),
    ).toEqual({
      sourceHandle: "source-left",
      targetHandle: "target-right",
    });
  });
});
