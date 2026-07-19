"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import {
  buildBuilderBezierPath,
  edgeTangentStrength,
  parallelEndpointShift,
} from "../lib/builder-edge-route";

/**
 * vault↔vault edge — n8n 류 부드러운 cubic bezier 라우팅. 예전 smoothstep
 * (직교) 은 마주보지 않는 포트에서 큰 ㄷ자 우회를 만들어 owner 스크린샷의
 * 헤어핀/S자 뒤엉킴을 유발했다.
 *
 * 2차 튜닝: xyflow 의 `getBezierPath` 는 마주보는 포트에서 곡률 파라미터를
 * 무시하고 접선을 `0.5×간격` 으로 하드코딩해 곡선이 뻣뻣했다("부드럽지도
 * 않고"). 이제 `builder-edge-route` 의 커스텀 경로를 쓴다 — 접선 세기를 수평
 * 간격뿐 아니라 세로 오프셋에도 비례시켜, 멀리 가는 선일수록 크게 부풀며
 * 부채꼴로 벌어진다. 포트 선택 자체는 `builder-edge-handles.ts` 가 마주보는
 * 좌/우(또는 상/하, 관계선은 같은 쪽) 로 골라 넘긴다.
 *
 * trace 문법(contains=실선, depends/relates=파선, evidence=점선) 과 관계선의
 * 낮춘 opacity 는 이 컴포넌트가 아니라 `use-vault-graph-flow.ts` 의
 * `edgeStrokeStyleByKey` 가 `style` prop 으로 계산해 넘긴다 — VaultEdge 는 그
 * style 을 BaseEdge 에 그대로 전달하는 라우팅 전용 레이어.
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
  // 평행 엣지(같은 두 노드 다중/양방향 관계) 를 연결선 법선으로 갈라 겹침 제거.
  const shifted = parallelEndpointShift(
    { sourceX, sourceY, targetX, targetY },
    edgeData?.parallelIndex ?? 0,
    edgeData?.parallelCount ?? 1,
  );
  // 접선 세기 = 실제 끝점 간 Δ 기반(포트 shift 반영). 세로 오프셋 비례로 팬 생성.
  const tangent = edgeTangentStrength(
    shifted.targetX - shifted.sourceX,
    shifted.targetY - shifted.sourceY,
    semanticType,
  );
  const { path } = buildBuilderBezierPath(
    {
      sourceX: shifted.sourceX,
      sourceY: shifted.sourceY,
      sourcePosition,
      targetX: shifted.targetX,
      targetY: shifted.targetY,
      targetPosition,
    },
    tangent,
  );

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      interactionWidth={22}
      style={style}
    />
  );
}
