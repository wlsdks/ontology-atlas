"use client";

import { useMemo } from "react";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { getOntologyKindLabel } from "@/entities/ontology-class";
import {
  findSimilarOntologyNodes,
  type SimilarityCandidate,
} from "@/shared/lib/ontology-tree";

export interface CandidateOntologyMatchProps {
  candidate: SimilarityCandidate;
  existingNodes: readonly KnowledgeGraphNode[];
  /** 옵션 — 매치 클릭 시 호출. promote 대신 기존 노드에 evidence 묶기 등에 사용. */
  onSelectMatch?: (node: KnowledgeGraphNode) => void;
  /** 옵션 — 표시 limit. 기본 5. */
  limit?: number;
}

/**
 * 검수 후보 옆에 inline — "이미 비슷한 ontology 노드 N 개" 매치 표시.
 *
 * 검수자가 promote 결정 전에 dedup 회피·중복 분기 방지. 매치 score ≥ 80
 * (정확 일치) 시 amber 톤 경고 — "이미 같은 노드가 있어 보입니다".
 *
 * 매치 0 자동 숨김. 권한·subscribe 는 호출자가 처리 (이 widget 은 순수 표시).
 */
export function CandidateOntologyMatch({
  candidate,
  existingNodes,
  onSelectMatch,
  limit = 5,
}: CandidateOntologyMatchProps) {
  const matches = useMemo(
    () => findSimilarOntologyNodes(candidate, existingNodes, limit),
    [candidate, existingNodes, limit],
  );

  if (matches.length === 0) return null;

  const hasStrong = matches[0]!.score >= 80;
  const accentClass = hasStrong
    ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
    : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]";
  const labelClass = hasStrong
    ? "text-[color:rgba(238,198,128,0.95)]"
    : "text-[color:var(--color-text-quaternary)]";

  return (
    <div className={`mt-2 rounded-md border px-3 py-2 ${accentClass}`}>
      <p className={`font-mono text-[9px] uppercase tracking-[0.14em] ${labelClass}`}>
        {hasStrong
          ? `이미 같은 노드가 있어 보임 — 매치 ${matches.length}`
          : `비슷한 기존 노드 ${matches.length}`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {matches.map(({ node, score }) => {
          const inner = (
            <>
              <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {getOntologyKindLabel(node.kind)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]"
                title={node.title}
              >
                {node.title}
              </span>
              <span
                className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                title={`매치 점수 ${score}`}
              >
                {scoreLabel(score)}
              </span>
            </>
          );
          const className =
            "flex w-full items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-left text-[11px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]";
          return (
            <li key={node.id}>
              {onSelectMatch ? (
                <button type="button" onClick={() => onSelectMatch(node)} className={className}>
                  {inner}
                </button>
              ) : (
                <div className={className}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function scoreLabel(score: number): string {
  if (score >= 100) return "정확";
  if (score >= 80) return "정확 · 다른 kind";
  if (score >= 60) return "prefix";
  if (score >= 50) return "prefix · 다른 kind";
  if (score >= 40) return "substring";
  if (score >= 30) return "substring · 다른 kind";
  return "id 매치";
}
