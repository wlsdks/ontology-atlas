"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ManualSourceChip, useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { getOntologyKindLabel } from "@/entities/ontology-class";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import { buildMeaningfulOntologyStats } from "@/shared/lib/ontology-tree";

export interface ProjectOntologyOverviewProps {
  /** 공개 surface — accountId 는 보통 null (projection 은 accountId 없으면 demo). */
  accountId: string | null;
  projectSlug: string;
  /** 옵션 — sample 노드 표시 limit. 기본 6. */
  limit?: number;
}

/**
 * 프로젝트 상세 페이지 inline 카드 — "이 프로젝트에 자란 ontology 노드 N".
 *
 * `knowledgePublicNodes` 자체 구독 + `projectIds.includes(projectSlug)` 필터.
 * project / document kind 는 메타라 sample 에서 제외 (capability / element / domain
 * 위주). 매치 0 은 자체 숨김.
 *
 * 클릭 시 `/ontology/?account=...` 점프 — 트리에서 해당 프로젝트 root 로 진입.
 */
export function ProjectOntologyOverview({
  accountId,
  projectSlug,
  limit = 6,
}: ProjectOntologyOverviewProps) {
  const nodes = useKnowledgePublicNodes(accountId);

  const matched = useMemo(
    () => nodes.filter((n) => n.projectIds.includes(projectSlug)),
    [nodes, projectSlug],
  );

  const stats = useMemo(() => buildMeaningfulOntologyStats(matched), [matched]);

  // sample — project / document 제외, 그 외에서 limit 까지.
  const sampleNodes = useMemo(
    () => matched.filter((n) => n.kind !== "project" && n.kind !== "document").slice(0, limit),
    [matched, limit],
  );

  if (stats.total === 0) return null;

  const ontologyHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";

  // kind 카운트 — buildMeaningfulOntologyStats 가 정의한 사용자 관심 단위.
  const orderedKinds = (["domain", "capability", "element", "unknown"] as const)
    .map((kind) => ({ kind, count: stats.byKind[kind] }))
    .filter((row) => row.count > 0);

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          이 프로젝트의 ontology 노드 {stats.total}
        </p>
        <Link
          href={ontologyHref}
          className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] hover:text-[color:var(--color-text-primary)]"
        >
          전체 트리 →
        </Link>
      </div>

      {orderedKinds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {orderedKinds.map(({ kind, count }) => (
            <span
              key={kind}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]"
            >
              {getOntologyKindLabel(kind)} {count}
            </span>
          ))}
        </div>
      ) : null}

      {sampleNodes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {sampleNodes.map((node) => (
            <li
              key={node.id}
              className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px]"
            >
              <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {getOntologyKindLabel(node.kind)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]"
                title={node.title}
              >
                {node.title}
              </span>
              <ManualSourceChip source={node.source} size="compact" />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        vault frontmatter (또는 빌더) 가 키워낸 개념·역량·요소. 이 프로젝트의 두 번째 척추.
      </p>
    </section>
  );
}
