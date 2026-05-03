"use client";

import { Link } from "@/i18n/navigation";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { KNOWLEDGE_EDGE_TYPES } from "@/entities/knowledge-graph";
import { useOntologyInsight } from "@/features/vault-ontology";
import { computeEdgeTypeDistribution } from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";

function getTypeLabel(
  t: ReturnType<typeof useTranslations>,
  type: string,
): string {
  switch (type) {
    case "contains":
      return t("edgeTypeContains");
    case "belongs_to":
      return t("edgeTypeBelongsTo");
    case "depends_on":
      return t("edgeTypeDependsOn");
    case "implements":
      return t("edgeTypeImplements");
    case "uses":
      return t("edgeTypeUses");
    case "describes":
      return t("edgeTypeDescribes");
    case "related_to":
      return t("edgeTypeRelatedTo");
    default:
      return type;
  }
}

/**
 * `/ontology/relations` — edge 단위 view.
 *
 * 트리 (노드 hierarchy) · 인사이트 (노드 통계) 와 다른 시각 — 의미 관계
 * (edge type) 의 분포.
 */
export function OntologyRelationsPage() {
  const t = useTranslations("ontologyPages.relations");

  const { insight, error } = useOntologyInsight();

  const typeDist = useMemo(
    () => (insight ? computeEdgeTypeDistribution(insight.edges) : new Map<string, number>()),
    [insight],
  );

  // KNOWLEDGE_EDGE_TYPES 순서로 정렬 + 외래 type 은 끝에 추가.
  const typeRows = useMemo(() => {
    const known = KNOWLEDGE_EDGE_TYPES.map((t) => ({ type: t, count: typeDist.get(t) ?? 0 }));
    const extra = Array.from(typeDist.entries())
      .filter(([t]) => !KNOWLEDGE_EDGE_TYPES.includes(t as (typeof KNOWLEDGE_EDGE_TYPES)[number]))
      .map(([type, count]) => ({ type, count }));
    return [...known, ...extra];
  }, [typeDist]);
  const typeMax = useMemo(
    () => typeRows.reduce((m, r) => Math.max(m, r.count), 0),
    [typeRows],
  );
  const totalEdges = insight?.edges.length ?? 0;

  return (
    <div>
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch />

      <section className="mb-8 space-y-3">
        {/* 모바일 한정 좌상단 back chevron — 한 손 도달 가능 위치 (iOS
            표준 패턴). md+ 데스크톱은 우상단 link 유지. */}
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
                return (
                  <li key={type} className="px-2 py-1 text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[color:var(--color-text-secondary)]">
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
                          backgroundColor: "rgba(159,170,235,0.45)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}
