"use client";

import { useTranslations } from "next-intl";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import {
  buildBuilderBezierPath,
  edgeTangentStrength,
} from "../lib/builder-edge-route";

interface EphemeralEdgeData {
  onPersist?: (edgeId: string) => void;
}

/**
 * 사용자가 ephemeral 노드 (palette 에서 막 추가, 아직 vault 에 .md 없음)
 * 와 다른 노드 사이에 그린 임시 edge. vault↔vault edge 는 OntologyEditCanvas
 * 의 handleConnect 가 자동으로 frontmatter array 에 patch 하지만, 한쪽이라도
 * ephemeral 인 경우엔 in-memory 로 남았다가 새로고침 시 사라진다.
 *
 * 라우팅은 VaultEdge 와 같은 cubic bezier(관계선 곡률) — 캔버스 안 모든 선이
 * 같은 곡선 언어를 쓴다. 인디고 dashed 경로(`--topology-v2-indigo-bright`) +
 * 가운데 "Save" 칩으로 명시적 영구화. feat/builder-core 이전엔 amber 로
 * ephemeral 을 표시했지만, 새 계약은 ephemeral 상태 전체를 단일 인디고 신호로
 * 통일한다 — "둘 이상의 채색 시스템 금지" 원칙을 ephemeral 에도 적용.
 * 칩 클릭 → ephemeral endpoint 들이 vault 에 createDoc 으로 저장되고, 그
 * slug 들로 connectVaultEdge 가 호출돼 frontmatter array 까지 채워진다.
 *
 * 자동-저장 (drop 즉시 영구화) 을 채택 안 한 이유: ephemeral 노드에 title 이
 * 비었을 때 `untitled.md` 가 vault 에 생기는 silent pollution 위험. 명시적
 * 칩 intent + title 검증 (toastEdgePersistNeedsTitle) 으로 안전.
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
  // vault edge 와 같은 커스텀 접선 bezier — 캔버스 안 모든 선이 한 곡선 언어.
  const tangent = edgeTangentStrength(
    targetX - sourceX,
    targetY - sourceY,
    "relation",
  );
  const { path: edgePath, labelX, labelY } = buildBuilderBezierPath(
    { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition },
    tangent,
  );
  const onPersist = (data as EphemeralEdgeData | undefined)?.onPersist;
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={22}
        style={{
          stroke: "var(--topology-v2-indigo-bright)",
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
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--topology-v2-indigo-bright)] bg-[color:var(--color-panel)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--topology-v2-indigo-bright)] transition-colors hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-v2-indigo-bright)]"
          aria-label={t("ephemeralEdgeSaveAria")}
          title={t("ephemeralEdgeSaveTooltip")}
        >
          {t("ephemeralEdgeSaveLabel")}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
