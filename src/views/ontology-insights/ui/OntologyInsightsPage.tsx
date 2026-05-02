"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  KNOWLEDGE_EDGE_TYPES,
  ManualSourceChip,
} from "@/entities/knowledge-graph";
import { useOntologyInsight, isVaultSentinelDate } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  buildActivityTimeline,
  buildOntologyTree,
  buildProjectOntologyCounts,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  countCrossProjectEdges,
  selectRecentNodes,
  selectTopByDegree,
} from "@/shared/lib/ontology-tree";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";

// UX-14: edge type 한국어 라벨 — relations 페이지 (UX-1) 와 통일.
function getEdgeTypeLabel(
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
 * `/ontology/insights` — ontology 의 활동·구조를 한눈에.
 *
 * 4 패널: kind 분포 / 허브 노드 (degree 상위) / 최근 활동 / 미연결 노드 (orphans).
 * `/ontology` 트리 뷰의 보조 surface — 트리는 hierarchy, 인사이트는 통계.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const searchParams = useSearchParams();
  const accountId = null;

  const { insight, error } = useOntologyInsight(accountId);

  const kindDist = useMemo(
    () => (insight ? computeKindDistribution(insight.nodes) : new Map<string, number>()),
    [insight],
  );
  const topHubs = useMemo(
    () => (insight ? selectTopByDegree(insight.nodes, insight.edges, 10) : []),
    [insight],
  );
  const recent = useMemo(
    () => (insight ? selectRecentNodes(insight.nodes, 10) : []),
    [insight],
  );
  const orphans = useMemo(() => {
    if (!insight) return [];
    return buildOntologyTree(insight.nodes, insight.edges).orphans;
  }, [insight]);
  const activity = useMemo(
    () => (insight ? buildActivityTimeline(insight.nodes, { days: 30 }) : []),
    [insight],
  );
  const activityMax = useMemo(() => activity.reduce((m, d) => Math.max(m, d.count), 0), [activity]);
  const activityTotal = useMemo(() => activity.reduce((s, d) => s + d.count, 0), [activity]);

  const totalNodes = insight?.nodes.length ?? 0;
  const totalEdges = insight?.edges.length ?? 0;
  // vault / dogfood 모드는 lastApprovedAt 이 sentinel (epoch 0 = 1970-01-01).
  // 30일 활동 timeline + 노드별 timestamp 표시는 의미 0 이라 mode-aware hide.
  const isVaultSentinelMode = useMemo(
    () =>
      insight !== null &&
      insight.nodes.length > 0 &&
      insight.nodes.every((n) => isVaultSentinelDate(n.lastApprovedAt)),
    [insight],
  );

  // kind 분포 — sorted desc + 시각용 합계.
  const kindRows = useMemo(() => {
    const rows = Array.from(kindDist.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    return rows;
  }, [kindDist]);
  const kindMax = kindRows[0]?.count ?? 0;

  // UX-13: 프로젝트별 ontology 분포 — 외부 visitor 가 12 외부 프로젝트 별
  // 노드 분포를 한 카드에서 보고 어느 프로젝트가 큰지 즉시 인지.
  // buildProjectOntologyCounts 는 project / document 메타 kind 제외하고
  // 4 kind (domain / capability / element / unknown) 만 집계.
  const projectRows = useMemo(() => {
    if (!insight) return [] as Array<{ project: string; total: number }>;
    const counts = buildProjectOntologyCounts(insight.nodes);
    return Array.from(counts.entries())
      .map(([project, c]) => ({ project, total: c.total }))
      .sort((a, b) => b.total - a.total);
  }, [insight]);
  const projectMax = projectRows[0]?.total ?? 0;

  // UX-14: edge type 분포 — 운영 1185 엣지에서 어떤 관계 type 이 우세한지
  // 즉시 인지 (belongs_to / implements / contains / uses 등). 트리는
  // hierarchy, 인사이트는 통계 — relations 페이지는 edge 단위 view 라
  // 별도 surface. 여기는 mini bar 표시.
  const edgeTypeDist = useMemo(
    () => (insight ? computeEdgeTypeDistribution(insight.edges) : new Map<string, number>()),
    [insight],
  );
  const edgeTypeRows = useMemo(() => {
    const known = KNOWLEDGE_EDGE_TYPES.map((t) => ({
      type: t,
      count: edgeTypeDist.get(t) ?? 0,
    }));
    const extra = Array.from(edgeTypeDist.entries())
      .filter(
        ([t]) =>
          !KNOWLEDGE_EDGE_TYPES.includes(t as (typeof KNOWLEDGE_EDGE_TYPES)[number]),
      )
      .map(([type, count]) => ({ type, count }));
    return [...known, ...extra].filter((r) => r.count > 0);
  }, [edgeTypeDist]);
  const edgeTypeMax = edgeTypeRows[0]?.count ?? 0;

  // UX-17: cross-project edge 카운트 — 운영 D-cont-1 시드된 7 cross-project
  // 의존을 인사이트에서 별도 인지. 전체 edge 의 비율로 보여 사용자가
  // "내 ontology 가 얼마나 분산됐나" 인지.
  const crossProjectEdgeCount = useMemo(
    () => (insight ? countCrossProjectEdges(insight.edges, insight.nodes) : 0),
    [insight],
  );

  return (
    <div>
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch accountId={accountId} returnTo="/ontology/insights/" />

      <section className="mb-8 space-y-3">
        {/* UX-8: 모바일 한정 좌상단 back chevron — 한 손 도달 가능 위치
            (iOS 표준 패턴). md+ 데스크톱은 기존 우상단 link 유지. */}
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
          <Link
            href={"/ontology/"}
            className="hidden h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
          >
            {t("backTreeDesktop")}
          </Link>
        </div>
        <p className="break-keep text-sm leading-7 text-[color:var(--color-text-secondary)]">
          {t("subtitle")}
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
        >
          {t("errorAlert", { message: error.message })}
        </div>
      ) : null}

      {!insight ? (
        <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
          {t("loading")}
        </div>
      ) : insight.nodes.length === 0 ? (
        <EmptyState
          tone="solid"
          align="center"
          title={
            <>
              {t("emptyTitleBefore")}
              <Link
                href={"/knowledge/documents/"}
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
          {/* kind 분포 */}
          <Panel
            title={t("kindPanelTitle")}
            subtitle={t("kindPanelSubtitle", {
              nodes: totalNodes,
              edges: totalEdges,
            })}
          >
            <ul className="space-y-2">
              {kindRows.map(({ kind, count }) => {
                const pct = kindMax > 0 ? Math.round((count / kindMax) * 100) : 0;
                return (
                  <li key={kind} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[color:var(--color-text-secondary)]">
                        {kindLabel(kind)}
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
                          backgroundColor:
                            kind === "unknown"
                              ? "rgba(255,179,71,0.6)"
                              : kind === "project"
                                ? "rgba(159,170,235,0.65)"
                                : "rgba(159,170,235,0.40)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* UX-13: 프로젝트별 분포 — 외부 visitor 가 12 외부 프로젝트
              별 노드 누적을 한 카드에서 인지. document/project 메타
              kind 제외 (4 kind 합계). 운영 시드 후 어느 프로젝트가
              가장 많은 도메인/기능/요소를 가진지 시각 확인. */}
          {projectRows.length > 0 ? (
            <Panel
              title={t("projectPanelTitle")}
              subtitle={t("projectPanelSubtitle", { count: projectRows.length })}
            >
              <ul className="space-y-1.5" data-testid="insights-project-rows">
                {projectRows.slice(0, 12).map(({ project, total }) => {
                  const pct = projectMax > 0 ? Math.round((total / projectMax) * 100) : 0;
                  return (
                    <li
                      key={project}
                      className="text-[12px]"
                      data-testid="insights-project-row"
                      data-project={project}
                    >
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        <span className="min-w-0 truncate font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                          {project}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                          {total}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: "rgba(159,170,235,0.55)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {/* UX-14: edge type 분포 — 운영 누적 엣지의 의미 관계 type
              비율을 한 카드에서 인지 (belongs_to / implements / contains
              / uses / depends_on 등). relations 페이지의 분포 패널과
              같은 helper 사용. */}
          {edgeTypeRows.length > 0 ? (
            <Panel
              title={t("edgeTypePanelTitle")}
              subtitle={t("edgeTypePanelSubtitle", { count: totalEdges })}
            >
              <ul className="space-y-1.5" data-testid="insights-edge-type-rows">
                {edgeTypeRows.slice(0, 8).map(({ type, count }) => {
                  const pct = edgeTypeMax > 0 ? Math.round((count / edgeTypeMax) * 100) : 0;
                  return (
                    <li
                      key={type}
                      className="text-[12px]"
                      data-testid="insights-edge-type-row"
                      data-edge-type={type}
                    >
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">
                          {getEdgeTypeLabel(t, type)}
                          <span className="ml-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                            {type}
                          </span>
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
            </Panel>
          ) : null}

          {/* UX-17: cross-project edge 카운트 — 운영 D-cont-1 시드된
              cross-project 의존을 별도 패널로 인지. 전체 edge 대비 비율
              표시해 ontology 분산도 즉시 인지. crossProjectEdgeCount 가
              0 이면 카드 hide (조건부 surface). */}
          {crossProjectEdgeCount > 0 ? (
            <Panel
              title={t("crossProjectPanelTitle")}
              subtitle={t("crossProjectPanelSubtitle")}
            >
              <div
                className="flex items-baseline gap-3"
                data-testid="insights-cross-project-card"
              >
                <span className="text-[28px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] tabular-nums">
                  {crossProjectEdgeCount}
                </span>
                <span className="text-[12px] text-[color:var(--color-text-tertiary)]">
                  / {totalEdges}
                </span>
                <span className="ml-auto font-mono text-[10px] tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
                  {totalEdges > 0
                    ? `${Math.round((crossProjectEdgeCount / totalEdges) * 1000) / 10}%`
                    : "—"}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t("crossProjectFooterBefore")}
                <Link
                  href={"/ontology/relations/"}
                  className="underline text-[color:rgba(159,170,235,0.95)]"
                >
                  {t("crossProjectFooterLink")}
                </Link>
                {t("crossProjectFooterAfter")}
              </p>
            </Panel>
          ) : null}

          {/* 허브 노드 — degree 상위 */}
          <Panel title={t("hubsPanelTitle")} subtitle={t("hubsPanelSubtitle")}>
            {topHubs.length === 0 ? (
              <p className="text-[12px] text-[color:var(--color-text-tertiary)]">{t("hubsEmpty")}</p>
            ) : (
              <ol className="space-y-1">
                {topHubs.map(({ node, degree }, idx) => (
                  <li key={node.id}>
                    <Link
                      href={`${"/ontology/"}${accountId ? "&" : "?"}node=${encodeURIComponent(node.id)}`}
                      className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
                    >
                      <span className="w-5 shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {idx + 1}
                      </span>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                        {kindLabel(node.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                        {node.title}
                      </span>
                      <ManualSourceChip source={node.source} size="compact" />
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-text-tertiary)]">
                        {degree}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* 최근 노드 (vault sentinel mode 면 timestamp 의미 0 — chip / 제목만) */}
          <Panel
            title={isVaultSentinelMode ? t("recentPanelTitleSentinel") : t("recentPanelTitleNormal")}
            subtitle={
              isVaultSentinelMode
                ? t("recentSubtitleSentinel", { count: recent.length })
                : t("recentSubtitleNormal")
            }
          >
            <ol className="space-y-1">
              {recent.map((node) => (
                <li key={node.id}>
                  <Link
                    href={`${"/ontology/"}${accountId ? "&" : "?"}node=${encodeURIComponent(node.id)}`}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {kindLabel(node.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                      {node.title}
                    </span>
                    <ManualSourceChip source={node.source} size="compact" />
                    {isVaultSentinelMode ? null : (
                      <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {formatRelativeDate(t, node.lastApprovedAt)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>

          {/* 30일 활동 타임라인 — vault sentinel mode 에서는 timeline 의미 0 이라 hide */}
          {isVaultSentinelMode ? null : (
          <div className="md:col-span-2">
            <Panel
              title={t("activityPanelTitle")}
              subtitle={t("activityPanelSubtitle", { count: activityTotal })}
            >
              {activityTotal === 0 ? (
                <p className="text-[12px] text-[color:var(--color-text-tertiary)]">
                  {t("activityEmpty")}
                </p>
              ) : (
                <div>
                  <div
                    className="flex h-20 items-end gap-[3px]"
                    role="img"
                    aria-label={t("activityChartAriaLabel", { count: activityTotal })}
                  >
                    {activity.map((day) => {
                      const heightPct = activityMax > 0 ? (day.count / activityMax) * 100 : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 rounded-t-sm transition-colors"
                          style={{
                            height: `${Math.max(heightPct, day.count > 0 ? 6 : 2)}%`,
                            backgroundColor: day.count > 0 ? "rgba(159,170,235,0.55)" : "var(--color-overlay-2)",
                          }}
                          title={`${day.date} · ${day.count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    <span>{activity[0]?.date}</span>
                    <span>{t("activityToday")}</span>
                  </div>
                </div>
              )}
            </Panel>
          </div>
          )}

          {/* 미연결 노드 */}
          <Panel
            title={t("orphansPanelTitle")}
            subtitle={t("orphansPanelSubtitle", { count: orphans.length })}
            accent={orphans.length > 0 ? "amber" : undefined}
          >
            {orphans.length === 0 ? (
              <p className="text-[12px] text-[color:var(--color-text-tertiary)]">{t("orphansEmpty")}</p>
            ) : (
              <ul className="space-y-1">
                {orphans.slice(0, 10).map((node) => (
                  <li
                    key={node.id}
                    className="flex items-center gap-2 rounded-md border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.08)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                      {kindLabel(node.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                      {node.title}
                    </span>
                    <ManualSourceChip source={node.source} size="compact" />
                  </li>
                ))}
                {orphans.length > 10 ? (
                  <li className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {t("orphansMore", { count: orphans.length - 10 })}
                  </li>
                ) : null}
              </ul>
            )}
          </Panel>
        </div>
      )}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "amber";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "amber"
      ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
      : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]";
  return (
    <section className={`rounded-2xl border px-5 py-4 ${accentClass}`}>
      <header className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function formatRelativeDate(
  t: ReturnType<typeof useTranslations>,
  d: Date,
): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return t("relativeToday");
  const days = Math.floor(diffMs / day);
  if (days < 7) return t("relativeDays", { count: days });
  if (days < 30) return t("relativeWeeks", { count: Math.floor(days / 7) });
  if (days < 365) return t("relativeMonths", { count: Math.floor(days / 30) });
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short" });
}
