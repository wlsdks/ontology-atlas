"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

interface VaultEdgeData {
  semanticType?: "containment" | "relation";
}

const NODE_PORT_CLEARANCE = 18;

export function offsetEndpointAwayFromNode(
  point: { x: number; y: number },
  position: EdgeProps["sourcePosition"],
  clearance = NODE_PORT_CLEARANCE,
): { x: number; y: number } {
  switch (position) {
    case "left":
      return { x: point.x - clearance, y: point.y };
    case "right":
      return { x: point.x + clearance, y: point.y };
    case "top":
      return { x: point.x, y: point.y - clearance };
    case "bottom":
      return { x: point.x, y: point.y + clearance };
    default:
      return point;
  }
}

export function VaultEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  pathOptions,
}: EdgeProps) {
  const semanticType = (data as VaultEdgeData | undefined)?.semanticType;
  const isRelation = semanticType === "relation";
  const routedSource = offsetEndpointAwayFromNode(
    { x: sourceX, y: sourceY },
    sourcePosition,
  );
  const routedTarget = offsetEndpointAwayFromNode(
    { x: targetX, y: targetY },
    targetPosition,
  );
  const [edgePath] = getSmoothStepPath({
    sourceX: routedSource.x,
    sourceY: routedSource.y,
    sourcePosition,
    targetX: routedTarget.x,
    targetY: routedTarget.y,
    targetPosition,
    borderRadius: isRelation ? 22 : 16,
    offset: isRelation ? 36 : 28,
    ...pathOptions,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      interactionWidth={18}
      style={style}
    />
  );
}
