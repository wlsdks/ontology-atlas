"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Network } from "lucide-react";
import { ManualSourceChip } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { useOntologyInsight } from "@/features/vault-ontology";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import {
  buildMeaningfulOntologyStats,
  selectRecentNodes,
} from "@/shared/lib/ontology-tree";

export interface DashboardOntologySummaryProps {
  accountId: string | null;
}

/**
 * `/knowledge` 대시보드 inline 카드 — ontology 의 큰 요약.
 *
 * `useOntologyInsight` (vault > 빌드타임 dogfood > Firestore 진실원
 * 우선순위) 구독. kind 분포 grid + 최근 활동 5 + "전체 트리 →" / "인사이트 →"
 * 두 진입점. 빈 ontology 면 자동 숨김.
 *
 * `WorkspaceOntologyStrip` (한 줄 stat) 와 다르게 — 이 카드는 dashboard
 * 의 큰 panel 단위, 사용자가 ontology 상태를 dashboard 에서 깊게 본다.
 */
export function DashboardOntologySummary({ accountId }: DashboardOntologySummaryProps) {
  const { insight } = useOntologyInsight(accountId);
  const kindLabel = useOntologyKindLabel();
  const nodes = insight?.nodes ?? [];

  const stats = useMemo(() => buildMeaningfulOntologyStats(nodes), [nodes]);
  const recent = useMemo(() => selectRecentNodes(nodes, 5), [nodes]);
  const totalMeaningful = stats.total;

  if (nodes.length === 0) return null;

  const ontologyHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";
  const insightsHref = accountId
    ? `/ontology/insights/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/insights/";

  // kind 분포 — buildMeaningfulOntologyStats 가 정의한 사용자 관심 단위.
  const kindRows = (["domain", "capability", "element", "unknown"] as const)
    .map((kind) => ({ kind, count: stats.byKind[kind] }))
    .filter((row) => row.count > 0);

  return (
    <section className="mt-10 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            Ontology · {totalMeaningful}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={ontologyHref}
            className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] hover:bg-[color:rgba(94,106,210,0.10)]"
          >
            트리 →
          </Link>
          <Link
            href={insightsHref}
            className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] hover:bg-[color:rgba(94,106,210,0.10)]"
          >
            인사이트 →
          </Link>
        </div>
      </div>

      {kindRows.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kindRows.map(({ kind, count }) => (
            <div
              key={kind}
              className={`rounded-xl border px-3 py-3 ${
                kind === "unknown"
                  ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
                  : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
              }`}
            >
              <p
                className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                  kind === "unknown"
                    ? "text-[color:rgba(238,198,128,0.95)]"
                    : "text-[color:var(--color-text-quaternary)]"
                }`}
              >
                {kindLabel(kind)}
              </p>
              <p className="mt-1 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {count}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            최근 활동
          </p>
          <ul className="mt-2 space-y-1">
            {recent.map((node) => (
              <li key={node.id}>
                <Link
                  href={`${ontologyHref}${accountId ? "&" : "?"}node=${encodeURIComponent(node.id)}`}
                  className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {kindLabel(node.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                    {node.title}
                  </span>
                  <ManualSourceChip source={node.source} size="compact" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
