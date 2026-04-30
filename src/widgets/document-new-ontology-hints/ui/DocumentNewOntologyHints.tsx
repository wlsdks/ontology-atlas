"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import { findSimilarOntologyNodes } from "@/shared/lib/ontology-tree";
import { CandidateOntologyMatch } from "@/widgets/candidate-ontology-match";

export interface DocumentNewOntologyHintsProps {
  accountId: string | null;
  /** 사용자가 입력 중인 문서 title — frontmatter wizard 의 dedup 신호. */
  title: string;
  /** 문서 kind — title 매치와 함께 cross-check. extraction 후보 의 kind 와 비교. */
  kind: string;
}

/**
 * `/knowledge/documents/new` 페이지 inline hint — 사용자가 title 입력 시 비슷한
 * 기존 ontology 노드 미리 보여주기 (dedup 회피).
 *
 * 이미 비슷한 노드가 있으면 사용자가 새 문서 작성 전에 "기존 노드 보러 가기"
 * 또는 "그래도 새로 만들기" 결정 가능. iter 21 의 `findSimilarOntologyNodes`
 * 매처 + `CandidateOntologyMatch` widget 재사용.
 *
 * title 짧음 (< 2 글자) 이거나 매치 0 시 자체 숨김.
 */
export function DocumentNewOntologyHints({
  accountId,
  title,
  kind,
}: DocumentNewOntologyHintsProps) {
  const ontologyNodes = useKnowledgePublicNodes(accountId);
  const trimmed = title.trim();
  const candidate = useMemo(
    () => ({ title: trimmed, kind: kind || "capability" }),
    [trimmed, kind],
  );

  // 짧은 title 은 noise — 2 글자 미만이면 매처 호출 안 함.
  if (trimmed.length < 2) return null;
  if (ontologyNodes.length === 0) return null;

  // CandidateOntologyMatch 가 자체 숨김 (매치 0). 따로 wrapper UI 만 추가.
  // 단 onSelectMatch 가 없으면 navigation X — 여기서는 ontology 트리로 점프.
  const ontologyHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";

  // 미리 매치 계산해서 0 이면 wrapper 도 숨김.
  const matches = findSimilarOntologyNodes(candidate, ontologyNodes, 5);
  if (matches.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        Ontology dedup 신호
      </p>
      <CandidateOntologyMatch candidate={candidate} existingNodes={ontologyNodes} />
      <p className="mt-1.5 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        이미 비슷한 노드가 있어요. 같은 개념이면{" "}
        <Link href={ontologyHref} className="text-[color:rgba(159,170,235,0.95)] underline">
          기존 노드를 evidence 로 묶는 문서
        </Link>{" "}
        를 쓰는 게 더 깔끔해요.
      </p>
    </div>
  );
}
