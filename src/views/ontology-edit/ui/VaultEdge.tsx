"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

/**
 * vault↔vault edge — smoothstep 라우팅은 feat/builder-core 에서도 그대로
 * 유지(변경 없음, 아래 route helper 들이 owner-approved 값). 시안 계약이
 * 요구하는 실선/파선/점선 trace 문법(contains=실선, depends/relates=파선,
 * evidence=점선) 은 이 컴포넌트가 아니라 `use-vault-graph-flow.ts` 의
 * `edgeStrokeStyleByKey` 가 `style` prop 으로 계산해 넘긴다 — VaultEdge 는
 * 그 style 을 그대로 BaseEdge 에 전달하는 라우팅 전용 레이어.
 */
interface VaultEdgeData {
  semanticType?: "containment" | "relation";
}

type VaultEdgeSemanticType = NonNullable<VaultEdgeData["semanticType"]>;

const NODE_PORT_CLEARANCE = 28;
const CONTAINMENT_EDGE_CLEARANCE = 36;

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
    clearance: CONTAINMENT_EDGE_CLEARANCE,
    offset: 44,
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
