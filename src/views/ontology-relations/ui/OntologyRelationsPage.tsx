"use client";

import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { KNOWLEDGE_EDGE_TYPES } from "@/entities/knowledge-graph";
import { useOntologyInsight, isVaultSentinelDate } from "@/features/vault-ontology";
import {
  computeEdgeTypeDistribution,
  selectStrongEdges,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";

function getTypeLabel(
  t: ReturnType<typeof useTranslations>,
  type: string,
): string {
  switch (type) {
    case "contains":
      return t("edgeTypeKoContains");
    case "belongs_to":
      return t("edgeTypeKoBelongsTo");
    case "depends_on":
      return t("edgeTypeKoDependsOn");
    case "implements":
      return t("edgeTypeKoImplements");
    case "uses":
      return t("edgeTypeKoUses");
    case "describes":
      return t("edgeTypeKoDescribes");
    case "related_to":
      return t("edgeTypeKoRelatedTo");
    default:
      return type;
  }
}

/**
 * `/ontology/relations` — edge 단위 view.
 *
 * 트리 (노드 hierarchy) · 인사이트 (노드 통계) 와 다른 시각 — 의미 관계
 * (edge type) 의 분포 + 강한 관계 (evidence 풍부) 가 무엇인지.
 */
export function OntologyRelationsPage() {
  const t = useTranslations("ontologyPages.relations");
  // R10 — accountId 항상 null.
  const accountId: string | null = null;

  const { insight, error } = useOntologyInsight();

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
          aria-label={t("backTreeMobileAriaLabel")}
          className="inline-flex items-center gap-1 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] md:hidden"
        >
          <span aria-hidden>←</span>
          <span>{t("backTreeMobile")}</span>
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow")}
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("title")}
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href={"/ontology/"}
              className="hidden h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
            >
              {t("backTreeDesktop")}
            </Link>
            <Link
              href={"/ontology/insights/"}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("insightsLink")}
            </Link>
          </div>
        </div>
        <p className="break-keep text-sm leading-7 text-[color:var(--color-text-secondary)]">
          {t("subtitle")}
        </p>
      </section>

      {error ? (
        <div role="alert" className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]">
          {t("errorAlert", { message: error.message })}
        </div>
      ) : null}

      {!insight ? (
        <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
          {t("loading")}
        </div>
      ) : totalEdges === 0 ? (
        <EmptyState
          tone="solid"
          align="center"
          title={
            <>
              {t("emptyTitleBefore")}
              <Link
                href={"/ontology/"}
                className="text-[color:rgba(159,170,235,0.95)] underline"
              >
                {t("emptyTitleLink")}
              </Link>
              {t("emptyTitleAfter")}
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* edge type 분포 */}
          <section className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
            <header className="mb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t("typePanelTitle")}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("typePanelSubtitle", { count: totalEdges })}
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
                        title={
                          active
                            ? t("typeRowTitleClear")
                            : t("typeRowTitleSelect", { label: getTypeLabel(t, type) })
                        }
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
                            {getTypeLabel(t, type)}
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
                {t("typeFilterClear")}
              </button>
            ) : null}
          </section>

          {/* 강한 관계 top — vault sentinel mode 는 노드 evidenceCount 0 이라
              "강한" 정렬 의미 0 → panel 자체 hide. cloud 모드에서만 노출. */}
          {isVaultSentinelMode ? null : (
          <section className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
            <header className="mb-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t("strongPanelTitle")}
                {selectedType ? (
                  <span className="ml-1.5 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-[1px] text-[9px] tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                    {getTypeLabel(t, selectedType)}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("strongPanelSubtitleBase")}
                {selectedType
                  ? t("strongPanelSubtitleFiltered", { count: filteredEdges.length })
                  : ""}
              </p>
            </header>
            <ol className="space-y-1">
              {strongEdges.map(({ edge, evidence, fromTitle, toTitle, isCrossProject }) => {
                const fromHref = `/ontology/?node=${encodeURIComponent(edge.from)}`;
                const toHref = `/ontology/?node=${encodeURIComponent(edge.to)}`;
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
                      {getTypeLabel(t, edge.type)}
                    </span>
                    <Link href={toHref} className="min-w-0 max-w-[8rem] flex-1 truncate text-[color:var(--color-text-primary)] hover:underline">
                      {toTitle ?? edge.to}
                    </Link>
                    {/* UX-15: cross-project edge 인지 한 단어 chip + 인디고 border. 같은 type 안에서 시각 분기. */}
                    {isCrossProject ? (
                      <span
                        className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]"
                        title={t("crossChipTitle")}
                      >
                        {t("crossChip")}
                      </span>
                    ) : null}
                    <span
                      className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]"
                      title={t("evidenceTooltip", { count: evidence })}
                    >
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
