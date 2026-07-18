"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildRadialEgoLayout,
  UNKNOWN_TONE,
  type OntologyEgoSubgraph,
} from "@/shared/lib/ontology-tree";
import {
  computeEgoLabelDensity,
  shouldShowEgoLabel,
} from "../lib/label-visibility";
import { groupEgoNeighborsForDenseRing } from "../lib/dense-grouping";

export interface OntologyEgoGraphProps {
  ego: OntologyEgoSubgraph;
  /** center 노드 label/kind 표시용. ego.centerId 와 같은 노드여야 함. */
  centerNode: KnowledgeGraphNode;
  /** neighbor 클릭 시 호출 — 미존재 (node === null) 노드는 클릭 불가. */
  onSelectNeighbor?: (node: KnowledgeGraphNode) => void;
  /**
   * dense ring 의 "{kind} +N" overflow 칩 클릭 시 호출. 보통 호출자가 이미
   * 렌더하고 있는 neighbor 목록(패널 하단)을 펼치고 그쪽으로 스크롤 —
   * "숨긴 나머지"가 어디로 가는지 항상 도달 가능해야 하기 때문.
   */
  onOverflowClick?: () => void;
  /** 기본 320 — 패널 폭에 맞게 조정 가능. */
  width?: number;
  /** 기본 200 — 노드 라벨 안 잘리게 200 권장. */
  height?: number;
}

const NODE_RADIUS = 5;
const CENTER_RADIUS = 7;
const LABEL_MAX_CHARS = 12;

/**
 * 노드 1-hop ego subgraph 의 SVG 시각화.
 *
 * 중심 노드 + radial 배치된 neighbor + 방향 화살표. WebGL/sigma 대신 SVG —
 * 보통 < 12 노드라 svg 가 더 단순하고 SSR friendly. 큰 ego 는 트리 / 검색
 * surface 로 위임.
 *
 * 디자인 — Linear 무채색 + 인디고 baseline, 화살표 outgoing/incoming 시각 구분.
 */
export function OntologyEgoGraph({
  ego,
  centerNode,
  onSelectNeighbor,
  onOverflowClick,
  width = 320,
  height = 200,
}: OntologyEgoGraphProps) {
  const t = useTranslations('ontologyWidgets');
  const kindLabel = useOntologyKindLabel();

  // dense-scale 대응 (fable sigma-surfaces 리뷰 #2) — 194개 점을 다 그리는
  // moiré ring 을 만들지 않는다. kind 별로 최대 개수만 남기고 나머지는
  // "{kind} +N" overflow 칩으로 접는다. <12 ego 는 그대로 통과 (회귀 없음).
  const grouped = useMemo(
    () => groupEgoNeighborsForDenseRing(ego.neighbors),
    [ego.neighbors],
  );
  const cappedEgo: OntologyEgoSubgraph = useMemo(
    () => ({ centerId: ego.centerId, neighbors: grouped.visible }),
    [ego.centerId, grouped.visible],
  );
  const layout = useMemo(
    () => buildRadialEgoLayout(cappedEgo, width, height, { padding: 36 }),
    [cappedEgo, width, height],
  );

  // dense ring 일 때만 hover 한 라벨만 노출 — 다른 라벨은 native <title>
  // 툴팁으로 폴백. dense 가 아니면 hover 상태와 무관하게 모두 보임. capping
  // 이후의 목록 기준 — 그룹핑으로 threshold 아래로 줄었으면 항상 라벨 노출.
  const density = useMemo(
    () => computeEgoLabelDensity(grouped.visible),
    [grouped.visible],
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (ego.neighbors.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={
        ego.neighbors.some((n) => n.hop === 2)
          ? t('egoGraph.ariaLabelTwoHop', { title: centerNode.title })
          : t('egoGraph.ariaLabelOneHop', { title: centerNode.title })
      }
      className="block max-w-full"
    >
      {/* fable sigma-surfaces 리뷰 #4 — 아래 rgba(94,106,210,*) / rgba(159,170,235,*) /
          rgba(180,186,200,*) / rgba(140,148,168,*) 는 각 hop·direction 조합마다
          다른 alpha 가 필요해 1:1 매칭되는 --color-* 토큰이 없다 (94,106,210 자체는
          --color-indigo-brand 와 채널이 같지만 alpha 변형을 var() 로 표현할 토큰이
          없음). 이번 패스는 신규 토큰을 만들지 않기로 해 하드코딩 유지 — 다음 토큰
          정리 패스의 대상으로 남겨둔다. */}
      <defs>
        {/* 화살표 마커 — outgoing 인디고, incoming 무채색 */}
        <marker id="ego-arrow-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(159,170,235,0.85)" />
        </marker>
        <marker id="ego-arrow-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(180,186,200,0.65)" />
        </marker>
      </defs>

      {/* edges 먼저 그려 노드 아래로 배치. hop=2 는 더 약한 톤 (시각 위계). */}
      {layout.edges.map((edge) => {
        const isOut = edge.direction === "outgoing";
        const isHop2 = edge.hop === 2;
        const stroke = isOut
          ? isHop2
            ? "rgba(94,106,210,0.32)"
            : "rgba(94,106,210,0.55)"
          : isHop2
            ? "rgba(140,148,168,0.28)"
            : "rgba(140,148,168,0.45)";
        const marker = isOut ? "url(#ego-arrow-out)" : "url(#ego-arrow-in)";
        // R10b 후 모든 edge 가 'manual' (cloud LLM 추출 워커 영구 제거됨)
        // 이라 manual ↔ system 시각 구분이 의미 0 — strokeDasharray 제거.
        return (
          <line
            key={`${edge.edgeId}-${edge.hop}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={stroke}
            strokeWidth={isHop2 ? 0.9 : 1.2}
            markerEnd={marker}
          />
        );
      })}

      {/* neighbors — capped/grouped 목록 기준 (raw ego.neighbors 아님). */}
      {layout.neighbors.map((point, i) => {
        const neighbor = grouped.visible[i]!;
        const node = neighbor.node;
        const title = node?.title ?? neighbor.neighborId;
        const neighborKindLabel = node ? kindLabel(node.kind) : t('egoGraph.neighborMissingKind');
        const truncated = title.length > LABEL_MAX_CHARS ? `${title.slice(0, LABEL_MAX_CHARS - 1)}…` : title;
        const isHop2 = neighbor.hop === 2;
        const showLabel = shouldShowEgoLabel(neighbor.hop, i, density, hoveredIndex);
        const fill = node === null
          ? UNKNOWN_TONE.fillStrong
          : neighbor.direction === "outgoing"
            ? isHop2
              ? "rgba(94,106,210,0.13)"
              : "rgba(94,106,210,0.22)"
            : isHop2
              ? "var(--color-overlay-2)"
              : "var(--color-border-soft)";
        const stroke = node === null
          ? UNKNOWN_TONE.strokeStrong
          : neighbor.direction === "outgoing"
            ? isHop2
              ? "rgba(94,106,210,0.42)"
              : "rgba(94,106,210,0.65)"
            : isHop2
              ? "var(--color-border-strong)"
              : "var(--color-border-strong)";
        const radius = isHop2 ? NODE_RADIUS - 1 : NODE_RADIUS;
        // 라벨이 viewBox 밖으로 나가지 않도록 anchor 분기.
        const labelDx = point.x < layout.center.x - 4 ? -8 : point.x > layout.center.x + 4 ? 8 : 0;
        const labelAnchor = labelDx < 0 ? "end" : labelDx > 0 ? "start" : "middle";
        const labelDy = point.y < layout.center.y ? -8 : 14;
        const clickable = node !== null && !!onSelectNeighbor;
        return (
          <g
            key={`${neighbor.edge.id}-${neighbor.direction}`}
            className={clickable ? "cursor-pointer" : ""}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={t('egoGraph.neighborTitleAria', {
              title,
              kind: neighborKindLabel,
              direction:
                neighbor.direction === "outgoing"
                  ? t('egoGraph.directionOutgoing')
                  : t('egoGraph.directionIncoming'),
            })}
            data-neighbor-index={i}
            data-label-shown={showLabel ? "true" : "false"}
            onClick={clickable ? () => onSelectNeighbor!(node!) : undefined}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex((prev) => (prev === i ? null : prev))}
            onFocus={() => setHoveredIndex(i)}
            onBlur={() => setHoveredIndex((prev) => (prev === i ? null : prev))}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectNeighbor!(node!);
                    }
                  }
                : undefined
            }
          >
            {/* native SVG <title> — dense ring 에서 라벨 숨겨도 hover/focus
                툴팁으로 노드 정체 인지 가능. 스크린리더도 읽음. */}
            <title>{`${title} (${neighborKindLabel})`}</title>
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={fill}
              stroke={stroke}
              strokeWidth={1}
            />
            {showLabel ? (
              <text
                x={point.x + labelDx}
                y={point.y + labelDy}
                textAnchor={labelAnchor}
                fontSize={10}
                fill="var(--color-text-secondary)"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {truncated}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* center — 마지막에 그려 위로 */}
      <g aria-label={t('egoGraph.centerAria', { title: centerNode.title })}>
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={CENTER_RADIUS}
          fill="rgba(94,106,210,0.55)"
          stroke="rgba(159,170,235,0.95)"
          strokeWidth={1.4}
        />
      </g>
    </svg>
    {grouped.overflow.length > 0 ? (
      <div className="mt-1.5 flex flex-wrap gap-1 px-1 pb-1">
        {grouped.overflow.map((group) => {
          const overflowKindLabel =
            group.kind === "unknown"
              ? t('egoGraph.neighborMissingKind')
              : kindLabel(group.kind);
          return (
            <button
              key={`${group.hop}-${group.kind}`}
              type="button"
              onClick={onOverflowClick}
              title={t('egoGraph.overflowChipAria', {
                count: group.count,
                kind: overflowKindLabel,
              })}
              className="rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-secondary)]"
            >
              {t('egoGraph.overflowChip', { kind: overflowKindLabel, count: group.count })}
            </button>
          );
        })}
      </div>
    ) : null}
    </div>
  );
}
