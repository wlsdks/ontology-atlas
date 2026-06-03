"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

interface VaultEdgeData {
  semanticType?: "containment" | "relation";
}

type VaultEdgeSemanticType = NonNullable<VaultEdgeData["semanticType"]>;

const NODE_PORT_CLEARANCE = 20;

export function edgeRouteOptionsForSemanticType(
  semanticType: VaultEdgeSemanticType | undefined,
): { borderRadius: number; clearance: number; offset: number } {
  if (semanticType === "relation") {
    return {
      borderRadius: 30,
      clearance: 42,
      offset: 72,
    };
  }
  return {
    borderRadius: 16,
    clearance: NODE_PORT_CLEARANCE,
    offset: 32,
  };
}

export function resolveSmoothStepRouteOptions(
  semanticType: VaultEdgeSemanticType | undefined,
  pathOptions: EdgeProps["pathOptions"] = {},
): EdgeProps["pathOptions"] {
  const routeOptions = edgeRouteOptionsForSemanticType(semanticType);
  return {
    ...pathOptions,
    borderRadius: routeOptions.borderRadius,
    offset: routeOptions.offset,
  };
}

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
  const routeOptions = edgeRouteOptionsForSemanticType(semanticType);
  const routedSource = offsetEndpointAwayFromNode(
    { x: sourceX, y: sourceY },
    sourcePosition,
    routeOptions.clearance,
  );
  const routedTarget = offsetEndpointAwayFromNode(
    { x: targetX, y: targetY },
    targetPosition,
    routeOptions.clearance,
  );
  const [edgePath] = getSmoothStepPath({
    sourceX: routedSource.x,
    sourceY: routedSource.y,
    sourcePosition,
    targetX: routedTarget.x,
    targetY: routedTarget.y,
    targetPosition,
    ...resolveSmoothStepRouteOptions(semanticType, pathOptions),
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
