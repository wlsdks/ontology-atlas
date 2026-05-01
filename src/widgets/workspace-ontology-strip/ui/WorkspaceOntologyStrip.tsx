"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import { buildMeaningfulOntologyStats } from "@/shared/lib/ontology-tree";

export interface WorkspaceOntologyStripProps {
  accountId: string | null;
}

/**
 * 워크스페이스 전반 ontology 한 줄 stat strip.
 *
 * 프로젝트 목록·대시보드 헤더 등에서 ontology 의 가벼운 가시.
 * `knowledgePublicNodes` 자체 구독, 매치 0 (또는 권한 없음) 자동 숨김.
 *
 * 표시: 총 노드 / 도메인 / 역량 / 요소 카운트 + stub 강조 (있을 때만 amber) +
 * "트리 →" 링크. 최소 노이즈.
 */
export function WorkspaceOntologyStrip({ accountId }: WorkspaceOntologyStripProps) {
  const nodes = useKnowledgePublicNodes(accountId);

  const stats = useMemo(() => buildMeaningfulOntologyStats(nodes), [nodes]);
  const counts = {
    total: stats.total,
    domain: stats.byKind.domain,
    capability: stats.byKind.capability,
    element: stats.byKind.element,
    stub: stats.byKind.unknown,
  };

  if (counts.total === 0) return null;

  const ontologyHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";
  // 미해결 stub 은 /ontology 의 OntologyStubList 위젯에서 처리 (promote/dismiss).
  const stubHref = ontologyHref;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-text-tertiary)]">
      <Link
        href={ontologyHref}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.16)]"
        aria-label="온톨로지 트리 열기"
      >
        Ontology {counts.total}
        <span aria-hidden>→</span>
      </Link>
      {counts.domain > 0 ? <CountChip label="도메인" value={counts.domain} /> : null}
      {counts.capability > 0 ? <CountChip label="역량" value={counts.capability} /> : null}
      {counts.element > 0 ? <CountChip label="요소" value={counts.element} /> : null}
      {counts.stub > 0 ? (
        <Link
          href={stubHref}
          className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(255,179,71,0.32)] bg-[color:rgba(255,179,71,0.08)] px-2.5 py-1 text-[10px] tracking-[0.02em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:bg-[color:rgba(255,179,71,0.16)]"
          aria-label="미해결 참조 — 트리에서 승격 또는 폐기"
          title="frontmatter 의 relates.target 이 가리킨 아직 존재하지 않는 노드. /ontology 트리 하단의 stub 리스트에서 승격 또는 폐기."
        >
          미해결 참조 {counts.stub}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
      {label} {value}
    </span>
  );
}
