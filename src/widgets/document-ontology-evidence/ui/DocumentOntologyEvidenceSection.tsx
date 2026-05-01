"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ManualSourceChip, useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { getOntologyKindLabel } from "@/entities/ontology-class";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

export interface DocumentOntologyEvidenceSectionProps {
  accountId: string | null;
  /** 이 문서의 ID — `KnowledgeGraphNode.evidenceIds` 에 매칭. */
  documentId: string;
  /** 옵션 — 표시 limit. 기본 8. */
  limit?: number;
}

/**
 * 문서 상세 페이지 inline 섹션 — "이 문서가 근거인 ontology 노드 N".
 *
 * `knowledgePublicNodes` 를 자체 구독해 `evidenceIds.includes(documentId)` 인
 * 노드를 필터. 검수 → 결과 흐름의 마지막 closure — 사용자가 자기 문서로
 * 어떤 ontology 가 자랐는지 즉각 확인.
 *
 * 권한 게이팅은 Firestore rules. 권한 없으면 빈 배열 → 섹션 자체 숨김.
 */
export function DocumentOntologyEvidenceSection({
  accountId,
  documentId,
  limit = 8,
}: DocumentOntologyEvidenceSectionProps) {
  const nodes = useKnowledgePublicNodes(accountId);

  const matched = useMemo(() => {
    if (!documentId) return [] as KnowledgeGraphNode[];
    return nodes.filter((node) => node.kind !== "document" && node.evidenceIds.includes(documentId));
  }, [nodes, documentId]);

  if (matched.length === 0) return null;

  const visible = matched.slice(0, limit);
  const hidden = Math.max(0, matched.length - visible.length);
  const ontologyHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          이 문서가 근거인 ontology 노드 {matched.length}
        </p>
        <Link
          href={ontologyHref}
          className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] hover:text-[color:var(--color-text-primary)]"
        >
          전체 트리 →
        </Link>
      </div>
      <ul className="mt-3 space-y-1.5">
        {visible.map((node) => (
          <li key={node.id} className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px]">
            <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {getOntologyKindLabel(node.kind)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]" title={node.title}>
              {node.title}
            </span>
            <ManualSourceChip source={node.source} size="compact" />
            {node.summary ? (
              <span className="hidden min-w-0 max-w-[18rem] truncate text-[11px] text-[color:var(--color-text-quaternary)] md:block" title={node.summary}>
                {node.summary}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-2 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
          +{hidden}개 더 — <Link href={ontologyHref} className="underline hover:text-[color:rgba(159,170,235,0.95)]">트리에서 보기</Link>
        </p>
      ) : null}
      <p className="mt-3 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        이 문서가 어떤 개념·역량·요소의 evidence 로 frontmatter 에서 참조되는지 보여줍니다.
      </p>
    </section>
  );
}
