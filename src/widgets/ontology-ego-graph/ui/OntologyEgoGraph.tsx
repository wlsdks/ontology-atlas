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

export interface OntologyEgoGraphProps {
  ego: OntologyEgoSubgraph;
  /** center 노드 label/kind 표시용. ego.centerId 와 같은 노드여야 함. */
  centerNode: KnowledgeGraphNode;
  /** neighbor 클릭 시 호출 — 미존재 (node === null) 노드는 클릭 불가. */
  onSelectNeighbor?: (node: KnowledgeGraphNode) => void;
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
  width = 320,
  height = 200,
}: OntologyEgoGraphProps) {
  const t = useTranslations('ontologyWidgets');
  const kindLabel = useOntologyKindLabel();
  const layout = useMemo(
    () => buildRadialEgoLayout(ego, width, height, { padding: 36 }),
    [ego, width, height],
  );

  // dense ring 일 때만 hover 한 라벨만 노출 — 다른 라벨은 native <title>
  // 툴팁으로 폴백. dense 가 아니면 hover 상태와 무관하게 모두 보임.
  const density = useMemo(() => computeEgoLabelDensity(ego.neighbors), [ego.neighbors]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (ego.neighbors.length === 0) {
    return null;
  }

  return (
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
        // manual edge — strokeDasharray 점선 표시. 사용자가 직접 그린 관계.
        const isManual = ego.neighbors.find((n) => n.edge.id === edge.edgeId)?.edge.source === "manual";
        return (
          <line
            key={`${edge.edgeId}-${edge.hop}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={stroke}
            strokeWidth={isHop2 ? 0.9 : 1.2}
            strokeDasharray={isManual ? "4 3" : undefined}
            markerEnd={marker}
          />
        );
      })}

      {/* neighbors */}
      {layout.neighbors.map((point, i) => {
        const neighbor = ego.neighbors[i]!;
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
              strokeDasharray={node?.source === "manual" ? "3 2" : undefined}
            />
            {showLabel ? (
              <text
                x={point.x + labelDx}
                y={point.y + labelDy}
                textAnchor={labelAnchor}
                fontSize={10}
                fill="rgba(220,226,240,0.80)"
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
          strokeDasharray={centerNode.source === "manual" ? "3 2" : undefined}
        />
      </g>
    </svg>
  );
}
