"use client";

import { useTranslations } from "next-intl";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import {
  edgeRouteOptionsForSemanticType,
  offsetEndpointAwayFromNode,
} from "./VaultEdge";

interface EphemeralEdgeData {
  onPersist?: (edgeId: string) => void;
}

export function resolveEphemeralEdgeRoutePoints({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: Pick<
  EdgeProps,
  "sourceX" | "sourceY" | "targetX" | "targetY" | "sourcePosition" | "targetPosition"
>) {
  const clearance = edgeRouteOptionsForSemanticType("relation").clearance;
  return {
    source: offsetEndpointAwayFromNode(
      { x: sourceX, y: sourceY },
      sourcePosition,
      clearance,
    ),
    target: offsetEndpointAwayFromNode(
      { x: targetX, y: targetY },
      targetPosition,
      clearance,
    ),
  };
}

/**
 * 사용자가 ephemeral 노드 (palette 에서 막 추가, 아직 vault 에 .md 없음)
 * 와 다른 노드 사이에 그린 임시 edge. vault↔vault edge 는 OntologyEditCanvas
 * 의 handleConnect 가 자동으로 frontmatter array 에 patch 하지만, 한쪽이라도
 * ephemeral 인 경우엔 in-memory 로 남았다가 새로고침 시 사라진다.
 *
 * 본 custom edge 는 amber dashed 경로 + 가운데 "Save" 칩을 그려 사용자가
 * 명시적으로 영구화할 수 있게 한다. 칩 클릭 → ephemeral endpoint 들이
 * vault 에 createDoc 으로 저장되고, 그 slug 들로 connectVaultEdge 가
 * 호출돼 frontmatter array 까지 채워진다.
 *
 * 자동-저장 (drop 즉시 영구화) 을 채택 안 한 이유: ephemeral 노드에
 * title 이 비었을 때 `untitled.md` 가 vault 에 생기는 silent pollution
 * 위험. AGENTS.md 의 self-approving frontmatter 원칙 위반. 명시적 chip
 * intent + title 검증 (toastEdgePersistNeedsTitle) 으로 안전.
 */
export function EphemeralEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const t = useTranslations("ontologyPages.edit.canvas");
  const routed = resolveEphemeralEdgeRoutePoints({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: routed.source.x,
    sourceY: routed.source.y,
    sourcePosition,
    targetX: routed.target.x,
    targetY: routed.target.y,
    targetPosition,
  });
  const onPersist = (data as EphemeralEdgeData | undefined)?.onPersist;
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "rgba(255, 179, 71, 0.66)",
          strokeWidth: 1.5,
          strokeDasharray: "5 4",
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPersist?.(id);
          }}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(255,179,71,0.55)] bg-[color:rgba(14,16,22,0.92)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(255,179,71,0.95)] transition-colors hover:border-[color:rgba(255,179,71,0.85)] hover:bg-[color:rgba(255,179,71,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,179,71,0.55)]"
          aria-label={t("ephemeralEdgeSaveAria")}
          title={t("ephemeralEdgeSaveTooltip")}
        >
          {t("ephemeralEdgeSaveLabel")}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
