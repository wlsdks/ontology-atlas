import type { Edge, Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

type BuilderEdgeSemanticType = "containment" | "relation";

export function resolveBuilderEdgeEndpointHandles(
  source: Pick<Node, "position">,
  target: Pick<Node, "position">,
  semanticType: BuilderEdgeSemanticType = "relation",
): Pick<Edge, "sourceHandle" | "targetHandle"> {
  const sourceCenter = {
    x: source.position.x + NODE_WIDTH / 2,
    y: source.position.y + NODE_HEIGHT / 2,
  };
  const targetCenter = {
    x: target.position.x + NODE_WIDTH / 2,
    y: target.position.y + NODE_HEIGHT / 2,
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  const horizontalOverlap = Math.abs(deltaX) < NODE_WIDTH * 0.75;

  if (
    semanticType === "containment" &&
    !horizontalOverlap &&
    Math.abs(deltaX) >= Math.abs(deltaY)
  ) {
    return {
      sourceHandle: "source-right",
      targetHandle: "target-left",
    };
  }

  if (horizontalOverlap || Math.abs(deltaY) > Math.abs(deltaX)) {
    return deltaY >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-right" }
      : { sourceHandle: "source-left", targetHandle: "target-left" };
  }

  return deltaX >= 0
    ? { sourceHandle: "source-right", targetHandle: "target-left" }
    : { sourceHandle: "source-left", targetHandle: "target-right" };
}
