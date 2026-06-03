"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

interface VaultEdgeData {
  semanticType?: "containment" | "relation";
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
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
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
