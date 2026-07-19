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

  it("arcs vertically stacked RELATION edges out one side instead of skewering", () => {
    // 2차 owner 피드백: 같은 컬럼에 쌓인 도메인끼리의 relates 를 상/하 포트로
    // 이으면 제어점이 끝점과 같은 x 라 곡률 0 인 직선 세로선이 되어 그 사이
    // 카드들을 관통하는 스큐어가 됐다. 관계선은 같은 쪽(오른쪽) 포트로 카드
    // 옆을 호로 감아 나간다. default semanticType = relation.
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 20, 240))).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-right",
    });
    // 위로 쌓인 경우도 방향 무관하게 같은 쪽으로 감는다.
    expect(resolveBuilderEdgeEndpointHandles(node("a", 0, 240), node("b", 20, 0))).toEqual({
      sourceHandle: "source-right",
      targetHandle: "target-right",
    });
  });

  it("routes vertically stacked CONTAINMENT edges through facing top/bottom ports", () => {
    // 포함선은 계층이라 곧은 세로 연결이 자연스럽다 — 상/하 마주보기.
    expect(
      resolveBuilderEdgeEndpointHandles(node("a", 0, 0), node("b", 20, 240), "containment"),
    ).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
    expect(
      resolveBuilderEdgeEndpointHandles(node("a", 0, 240), node("b", 20, 0), "containment"),
    ).toEqual({
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
