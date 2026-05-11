"use client";

import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildOntologyNodeHref,
  useEdgeTypeLabel,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  UNKNOWN_TONE,
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

/**
 * `/ontology/insights` — ontology 의 구조를 한눈에.
 *
 * 패널: kind 분포 · 프로젝트별 분포 · edge type 분포 · 허브 노드 (degree 상위)
 * · cross-project edge 카운트 · 최근 노드 · 미연결 노드 (orphans).
 * `/ontology` 트리 뷰의 보조 surface — 트리는 hierarchy, 인사이트는 통계.
 *
 * R10b 후 lastApprovedAt 이 모든 노드에서 VAULT_SENTINEL_DATE (epoch 0) 라
 * "30일 활동 timeline" 패널과 노드별 relative timestamp 는 영구 의미 0 → 제거됨.
 */
export function OntologyInsightsPage() {
  const t = useTranslations("ontologyPages.insights");
  const kindLabel = useOntologyKindLabel();
  const edgeTypeLabel = useEdgeTypeLabel();

  const { insight, error } = useOntologyInsight();

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

  const totalNodes = insight?.nodes.length ?? 0;
  const totalEdges = insight?.edges.length ?? 0;

  // kind 분포 — sorted desc + 시각용 합계.
  const kindRows = useMemo(() => {
    const rows = Array.from(kindDist.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    return rows;
  }, [kindDist]);
  const kindMax = kindRows[0]?.count ?? 0;

  // 프로젝트별 ontology 분포 — 어느 프로젝트가 ontology 측면에서 큰지
  // 한 카드로 보여준다. project / document 메타 kind 는 집계 제외하고
  // 4 kind (domain / capability / element / unknown) 만 합산.
  const projectRows = useMemo(() => {
    if (!insight) return [] as Array<{ project: string; total: number }>;
    const counts = buildProjectOntologyCounts(insight.nodes);
    return Array.from(counts.entries())
      .map(([project, c]) => ({ project, total: c.total }))
      .sort((a, b) => b.total - a.total);
  }, [insight]);
  const projectMax = projectRows[0]?.total ?? 0;

  // edge type 분포 — 어떤 관계 type 이 우세한지 즉시 인지 (belongs_to /
  // implements / contains / uses 등). 트리는 hierarchy, 인사이트는
  // 통계, relations 페이지는 edge 단위 view — 여기는 mini bar 만.
  const edgeTypeDist = useMemo(
    () => (insight ? computeEdgeTypeDistribution(insight.edges) : new Map<string, number>()),
    [insight],
  );
  const edgeTypeRows = useMemo(
    () => buildEdgeTypeRows(edgeTypeDist),
    [edgeTypeDist],
  );
  // edgeTypeRows 는 canonical 순서 (contains, belongs_to, …) 라 [0] 가 max
  // 가 아니다 — 실제 max 는 reduce 로 별도 계산. 이전엔 bar pct 가 잘못된
  // baseline 으로 정규화돼 100% 초과 / 비율 왜곡 회귀가 있었다.
  const edgeTypeMax = useMemo(
    () => edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0),
    [edgeTypeRows],
  );

  // cross-project edge 카운트 — 양 끝 노드의 projectIds 가 disjoint 인 edge
  // 만 셈. 전체 edge 의 비율로 사용자에게 \"ontology 가 얼마나 분산됐나\"
  // 신호 노출.
  const crossProjectEdgeCount = useMemo(
    () => (insight ? countCrossProjectEdges(insight.edges, insight.nodes) : 0),
    [insight],
  );

  return (
    <div>
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch />

      <section className="mb-8 space-y-3">
        {/* eyebrow + back pill 은 OperationsNav 의 SubNav 행이 'ONTOLOGY'
            caption + active '인사이트' pill 로 이미 노출 → 중복 제거. */}
        <h1 className="break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h1>
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
                href={"/docs/"}
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
                // share-of-total — bar 의 시각 정보가 *kindMax 대비* 라 사용자
                // 가 "전체 중 비중" 을 따로 인지 못 함. raw count 옆에 share
                // (`{count} · {share}%`) 를 monospace 로 같이 노출 — 디자인
                // 헌장의 무채색 quaternary 톤 유지.
                const share =
                  totalNodes > 0 ? Math.round((count / totalNodes) * 100) : 0;
                return (
                  <li key={kind} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[color:var(--color-text-secondary)]">
                        {kindLabel(kind)}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                        {count} · {share}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            kind === "unknown"
                              ? UNKNOWN_TONE.strokeStrong
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

          {/* edge type 분포 — Cut A 후 /ontology/relations 의 분포 패널을
              여기로 흡수. 의미 관계 type 비율 (belongs_to / implements /
              contains / uses / depends_on 등). cross-project edge 비율은
              별도 카드 대신 이 패널 상단 caption 으로 fold — kind 분포
              다음 자리로 이동 (구조 진단 = core).  */}
          {edgeTypeRows.length > 0 ? (
            <Panel
              title={t("edgeTypePanelTitle")}
              subtitle={t("edgeTypePanelSubtitle", { count: totalEdges })}
            >
              {crossProjectEdgeCount > 0 ? (
                <p
                  className="mb-3 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]"
                  data-testid="insights-cross-project-inline"
                >
                  {t("edgeTypeCrossProjectInline", {
                    count: crossProjectEdgeCount,
                    total: totalEdges,
                    pct:
                      totalEdges > 0
                        ? Math.round((crossProjectEdgeCount / totalEdges) * 1000) / 10
                        : 0,
                  })}
                </p>
              ) : null}
              <ul className="space-y-1.5" data-testid="insights-edge-type-rows">
                {edgeTypeRows.map(({ type, count }) => {
                  const pct = edgeTypeMax > 0 ? Math.round((count / edgeTypeMax) * 100) : 0;
                  const share =
                    totalEdges > 0 ? Math.round((count / totalEdges) * 100) : 0;
                  return (
                    <li
                      key={type}
                      className="text-[12px]"
                      data-testid="insights-edge-type-row"
                      data-edge-type={type}
                    >
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        {/* 영문 코드 (contains / related_to) 노출 안 함 — 한글
                            라벨이면 충분, 비개발자에게 코드명은 noise. */}
                        <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">
                          {edgeTypeLabel(type)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                          {count} · {share}%
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

          {/* 프로젝트별 분포 — 어느 프로젝트가 가장 많은 도메인/기능/요소를
              가진지 시각 확인. document / project 메타 kind 제외 (4 kind
              합계). */}
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

          {/* 허브 노드 — degree 상위 */}
          <Panel title={t("hubsPanelTitle")} subtitle={t("hubsPanelSubtitle")}>
            {topHubs.length === 0 ? (
              <p className="text-[12px] text-[color:var(--color-text-tertiary)]">{t("hubsEmpty")}</p>
            ) : (
              <ol className="space-y-1">
                {topHubs.map(({ node, degree }, idx) => (
                  <li key={node.id}>
                    <Link
                      href={buildOntologyNodeHref(node.id)}
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
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--color-text-tertiary)]">
                        {degree}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* 최근 노드 — vault sentinel mode 라 timestamp 없이 chip / 제목만. */}
          <Panel
            title={t("recentPanelTitle")}
            subtitle={t("recentSubtitle", { count: recent.length })}
          >
            <ol className="space-y-1">
              {recent.map((node) => (
                <li key={node.id}>
                  <Link
                    href={buildOntologyNodeHref(node.id)}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {kindLabel(node.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                      {node.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>

          {/* 미연결 노드 — 0 개면 panel 자체 hide (모두 트리에 연결됨이 default 라
              빈 카드로 자리 차지할 가치 없음). orphan 가 있을 때만 amber 톤 강조. */}
          {orphans.length > 0 ? (
            <Panel
              title={t("orphansPanelTitle")}
              subtitle={t("orphansPanelSubtitle", { count: orphans.length })}
              accent="amber"
            >
              <ul className="space-y-1">
                {orphans.slice(0, 10).map((node) => (
                  <li key={node.id}>
                    <Link
                      href={buildOntologyNodeHref(node.id)}
                      className="flex items-center gap-2 rounded-md border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[color:rgba(255,179,71,0.40)] hover:bg-[color:rgba(255,179,71,0.08)]"
                    >
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.08)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                        {kindLabel(node.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                        {node.title}
                      </span>
                    </Link>
                  </li>
                ))}
                {orphans.length > 10 ? (
                  <li className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {t("orphansMore", { count: orphans.length - 10 })}
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
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

