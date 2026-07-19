"use client";

import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import {
  edgeCurvatureForSemanticType,
  parallelEndpointShift,
} from "../lib/builder-edge-route";

/**
 * vault↔vault edge — n8n 류 부드러운 cubic bezier 라우팅. 예전 smoothstep
 * (직교) 은 마주보지 않는 포트에서 큰 ㄷ자 우회를 만들어 owner 스크린샷의
 * 헤어핀/S자 뒤엉킴을 유발했다. bezier 는 포트 방향 접선으로 스윕해 세로
 * 오프셋이 커도 루프 없이 흐른다. 포트 선택 자체는 `builder-edge-handles.ts`
 * 가 마주보는 좌/우(또는 상/하) 로 골라 넘긴다.
 *
 * trace 문법(contains=실선, depends/relates=파선, evidence=점선) 은 이
 * 컴포넌트가 아니라 `use-vault-graph-flow.ts` 의 `edgeStrokeStyleByKey` 가
 * `style` prop 으로 계산해 넘긴다 — VaultEdge 는 그 style 을 BaseEdge 에
 * 그대로 전달하는 라우팅 전용 레이어.
 */
interface VaultEdgeData {
  semanticType?: "containment" | "relation";
  /** 같은 노드쌍을 잇는 평행 엣지 중 이 엣지의 순번(0-based). */
  parallelIndex?: number;
  /** 그 노드쌍의 평행 엣지 총 개수. 1 이면 분리 없음. */
  parallelCount?: number;
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
}: EdgeProps) {
  const edgeData = data as VaultEdgeData | undefined;
  const semanticType = edgeData?.semanticType;
  const curvature = edgeCurvatureForSemanticType(semanticType);
  // 평행 엣지(같은 두 노드 다중/양방향 관계) 를 연결선 법선으로 갈라 겹침 제거.
  const shifted = parallelEndpointShift(
    { sourceX, sourceY, targetX, targetY },
    edgeData?.parallelIndex ?? 0,
    edgeData?.parallelCount ?? 1,
  );
  const [edgePath] = getBezierPath({
    sourceX: shifted.sourceX,
    sourceY: shifted.sourceY,
    sourcePosition,
    targetX: shifted.targetX,
    targetY: shifted.targetY,
    targetPosition,
    curvature,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      interactionWidth={22}
      style={style}
    />
  );
}
