"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KNOWLEDGE_EDGE_TYPES } from "@/entities/knowledge-graph";
import { useOntologyInsight, isVaultSentinelDate } from "@/features/vault-ontology";
import {
  computeEdgeTypeDistribution,
  selectStrongEdges,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";

const TYPE_LABEL_KO: Record<string, string> = {
  contains: "포함",
  belongs_to: "소속",
  depends_on: "의존",
  implements: "구현",
  uses: "사용",
  describes: "설명",
  related_to: "연관",
};

/**
 * `/ontology/relations` — edge 단위 view.
 *
 * 트리 (노드 hierarchy) · 인사이트 (노드 통계) 와 다른 시각 — 의미 관계
 * (edge type) 의 분포 + 강한 관계 (evidence 풍부) 가 무엇인지.
 */
export function OntologyRelationsPage() {
  const searchParams = useSearchParams();
  const accountId = null;

  const { insight, error } = useOntologyInsight(accountId);

  // type 필터 — null 이면 전체. 분포 panel 의 행 클릭으로 toggle.
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const typeDist = useMemo(
    () => (insight ? computeEdgeTypeDistribution(insight.edges) : new Map<string, number>()),
    [insight],
  );
  const filteredEdges = useMemo(() => {
    if (!insight) return [];
    if (!selectedType) return insight.edges;
    return insight.edges.filter((e) => e.type === selectedType);
  }, [insight, selectedType]);
  const strongEdges = useMemo(
    () => (insight ? selectStrongEdges(filteredEdges, insight.nodes, 12) : []),
    [insight, filteredEdges],
  );

  // KNOWLEDGE_EDGE_TYPES 순서로 정렬 + 외래 type 은 끝에 추가.
  const typeRows = useMemo(() => {
    const known = KNOWLEDGE_EDGE_TYPES.map((t) => ({ type: t, count: typeDist.get(t) ?? 0 }));
    const extra = Array.from(typeDist.entries())
      .filter(([t]) => !KNOWLEDGE_EDGE_TYPES.includes(t as (typeof KNOWLEDGE_EDGE_TYPES)[number]))
      .map(([type, count]) => ({ type, count }));
    return [...known, ...extra];
  }, [typeDist]);
  const typeMax = typeRows.reduce((m, r) => Math.max(m, r.count), 0);
  const totalEdges = insight?.edges.length ?? 0;
  // vault / dogfood 모드는 노드 evidenceCount 0 → "강한 관계" 정렬 의미 0.
  // sentinel 모드면 panel 자체 hide.
  const isVaultSentinelMode = useMemo(
    () =>
      insight !== null &&
      insight.nodes.length > 0 &&
      insight.nodes.every((n) => isVaultSentinelDate(n.lastApprovedAt)),
    [insight],
  );

  return (
    <div>
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch accountId={accountId} returnTo="/ontology/relations/" />

      <section className="mb-8 space-y-3">
        {/* UX-8: 모바일 좌상단 back chevron (iOS 표준 패턴). md+ 는 기존
            우상단 link 유지. */}
        <Link
          href={"/ontology/"}
          aria-label="온톨로지 트리로 돌아가기"
          className="inline-flex items-center gap-1 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] md:hidden"
        >
          <span aria-hidden>←</span>
          <span>트리로</span>
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          Ontology · Relations
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            관계
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href={"/ontology/"}
              className="hidden h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
            >
              ← 트리로
            </Link>
            <Link
              href={"/ontology/insights/"}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
            >
              인사이트
            </Link>
          </div>
        </div>
        <p className="break-keep text-sm leading-7 text-[color:var(--color-text-secondary)]">
          노드는 트리, 통계는 인사이트. 관계는 *의미 관계 종류* 의 분포를 보여줍니다.
        </p>
      </section>

      {error ? (
        <div role="alert" className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]">
          관계 데이터를 불러오는 중 오류가 났어요. {error.message}
        </div>
      ) : null}

      {!insight ? (
        <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
          불러오는 중…
        </div>
      ) : totalEdges === 0 ? (
        <EmptyState
          tone="solid"
          align="center"
          title={
            <>
              아직 승인된 관계가 없어요.{" "}
              <Link
                href={"/ontology/"}
                className="text-[color:rgba(159,170,235,0.95)] underline"
              >
                트리
              </Link>{" "}
              에서 노드를 먼저 검토해 보세요.
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* edge type 분포 */}
          <section className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
            <header className="mb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                Edge type 분포
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
                총 {totalEdges} 관계
              </p>
            </header>
            <ul className="space-y-2">
              {typeRows
                .filter((r) => r.count > 0)
                .map(({ type, count }) => {
                  const pct = typeMax > 0 ? Math.round((count / typeMax) * 100) : 0;
                  const active = selectedType === type;
                  return (
                    <li key={type} className="text-[12px]">
                      <button
                        type="button"
                        onClick={() => setSelectedType(active ? null : type)}
                        aria-pressed={active}
                        title={active ? "필터 해제" : `${TYPE_LABEL_KO[type] ?? type} 만 보기`}
                        className={`block w-full rounded-md px-2 py-1 text-left transition-colors ${
                          active
                            ? "bg-[color:rgba(94,106,210,0.10)]"
                            : "hover:bg-[color:var(--color-overlay-1)]"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={
                              active
                                ? "text-[color:rgba(159,170,235,0.95)]"
                                : "text-[color:var(--color-text-secondary)]"
                            }
                          >
                            {TYPE_LABEL_KO[type] ?? type}
                            <span className="ml-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">{type}</span>
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                            {count}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: active ? "rgba(159,170,235,0.85)" : "rgba(159,170,235,0.45)",
                            }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
            {selectedType ? (
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                필터 해제
              </button>
            ) : null}
          </section>

          {/* 강한 관계 top — vault sentinel mode 는 노드 evidenceCount 0 이라
              "강한" 정렬 의미 0 → panel 자체 hide. cloud 모드에서만 노출. */}
          {isVaultSentinelMode ? null : (
          <section className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
            <header className="mb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                강한 관계
                {selectedType ? (
                  <span className="ml-1.5 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-[1px] text-[9px] tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                    {TYPE_LABEL_KO[selectedType] ?? selectedType}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
                근거 문서 많은 위 12 — 자주 인용되는 의미 연결
                {selectedType ? ` · ${filteredEdges.length} 매치` : ""}
              </p>
            </header>
            <ol className="space-y-1">
              {strongEdges.map(({ edge, evidence, fromTitle, toTitle, isCrossProject }) => {
                const fromHref = `${"/ontology/"}${accountId ? "&" : "?"}node=${encodeURIComponent(edge.from)}`;
                const toHref = `${"/ontology/"}${accountId ? "&" : "?"}node=${encodeURIComponent(edge.to)}`;
                return (
                  <li
                    key={edge.id}
                    data-cross-project={isCrossProject ? "true" : "false"}
                    className={
                      isCrossProject
                        ? "flex items-center gap-2 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.06)] px-2.5 py-1.5 text-[12px]"
                        : "flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px]"
                    }
                  >
                    <Link href={fromHref} className="min-w-0 max-w-[8rem] truncate text-[color:var(--color-text-primary)] hover:underline">
                      {fromTitle ?? edge.from}
                    </Link>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                      {TYPE_LABEL_KO[edge.type] ?? edge.type}
                    </span>
                    <Link href={toHref} className="min-w-0 max-w-[8rem] flex-1 truncate text-[color:var(--color-text-primary)] hover:underline">
                      {toTitle ?? edge.to}
                    </Link>
                    {/* UX-15: cross-project edge 인지 한 단어 chip + 인디고 border. 같은 type 안에서 시각 분기. */}
                    {isCrossProject ? (
                      <span
                        className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]"
                        title="두 노드가 다른 프로젝트에 속함 — cross-project 의존"
                      >
                        cross
                      </span>
                    ) : null}
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]" title={`evidence ${evidence}`}>
                      {evidence}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
