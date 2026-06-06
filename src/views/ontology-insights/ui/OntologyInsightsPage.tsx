"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  buildEdgeTypeRows,
  buildOntologyBuilderNodeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyNodeHref,
  resolveOntologyBuilderNodeSlug,
  type KnowledgeGraphNode,
  useEdgeTypeLabel,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  UNKNOWN_TONE,
  buildAgentReadinessSummary,
  buildAgentGraphDbQueryPack,
  buildAgentInvestigationPlaybooks,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  buildOntologyTree,
  buildProjectOntologyCounts,
  computeDomainCouplingMatrix,
  computeEdgeTypeDistribution,
  computeKindDistribution,
  computeOntologyChangeset,
  countCrossProjectEdges,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  rankAllByDegree,
  selectRecentNodes,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { formatQueryOntologyCall as formatInsightsQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { EmptyState } from "@/shared/ui";
import { resolveDomainTint } from "@/shared/lib/domain-color";
import {
  parseOntologyReaderIntent,
  type OntologyReaderIntent,
} from "@/shared/lib/ontology-reader-intent";
import { buildInsightsCollaboratorBrief } from "../lib/collaborator-insights-brief";
import {
  buildInsightsOrphanNodeActions,
  formatInsightsOrphanRepairMcpPacket,
  formatInsightsOrphanRepairPacket,
} from "../lib/orphan-node-actions";
import { resolveInsightsQueryNode } from "../lib/resolve-insights-query-node";
import { formatDomainCouplingPathCheck } from "../lib/domain-coupling-path-check";
import { CopyAgentTextButton } from "./parts/CopyAgentTextButton";
import { InsightsQueryPackCockpit } from "./parts/InsightsQueryPackCockpit";
import { AgentReadinessPanel } from "./parts/AgentReadinessPanel";
import { AgentQueryRecipesPanel } from "./parts/AgentQueryRecipesPanel";
import { InsightsFocusedNodeProofPanel } from "./parts/InsightsFocusedNodeProofPanel";
import { InsightsCollaboratorBriefPanel } from "./parts/InsightsCollaboratorBriefPanel";
import { InsightsChangeStrip } from "./parts/InsightsChangeStrip";
import { Panel } from "./parts/Panel";
import { InsightsInfoButton } from "./parts/InsightsInfoButton";

/**
 * 노드 row 좌측 accent bar 색 — 빌더의 도메인 grouping 과 시각 일관.
 * domain 노드 자체만 자기 hue 로 tint (capability/element 는 domain 정보가
 * KnowledgeGraphNode shape 에 직접 없어 자체 hue 미지원, follow-up).
 */
function rowAccentColor(node: { id: string; kind: string }): string | null {
  if (node.kind !== 'domain') return null;
  const tail = node.id.split('/').pop() ?? node.id;
  return resolveDomainTint(tail).accent;
}

/**
 * 노드 row 에 일관 적용하는 hover transition + 선택적 accent bar.
 * 디자인 시스템의 no-glow 규칙에 맞춰 hover 는 border/background 로만 표시한다.
 */
const ROW_BASE_CLASS =
  "flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] " +
  "bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px] " +
  "transition-[border-color,background-color] duration-200 " +
  "hover:border-[color:rgba(139,151,255,0.4)] " +
  "hover:bg-[color:rgba(94,106,210,0.07)]";

const DOMAIN_COUPLING_LIMIT = 6;
const DOMAIN_COUPLING_LOCAL_TYPES = ["depends_on", "related_to", "describes"] as const;
const DOMAIN_COUPLING_CLI_TYPES = "depends_on,relates,describes";
const DOMAIN_COUPLING_MCP_TYPES = ["depends_on", "relates", "describes"] as const;
const EMPTY_ORPHANS: KnowledgeGraphNode[] = [];
const SESSION_PROOF_PACKET = [
  "# Direct MCP proof inside the current Claude Code / Codex session",
  "1. Confirm tools/list shows the ontology-atlas MCP server with query_ontology and index_project.",
  "2. Run the first calls from the live MCP tool surface:",
  "   - list_kinds({})",
  '   - query_ontology({"operation":"agent_brief"})',
  '   - query_ontology({"operation":"workspace_brief"})',
  '   - query_ontology({"operation":"health"})',
  "",
  "# CLI fallback proof only when direct MCP tools are unavailable",
  "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
  "",
  "# Cache mismatch recovery",
  "If tools/list still shows 23 tools or query_ontology is missing, reload/restart the agent session and refresh cached MCP tools before claiming direct MCP proof.",
].join("\n");
type InsightsPageTab = "proof" | "collaboration" | "agent" | "census";

export function getInsightsTabForReaderIntent(
  intent: OntologyReaderIntent | null,
): InsightsPageTab {
  if (intent === "agent") return "agent";
  if (intent === "planning" || intent === "marketing" || intent === "leadership") {
    return "collaboration";
  }
  return "proof";
}

export function getInsightsTabDescriptionKey(tab: InsightsPageTab): string {
  if (tab === "proof") return "surfaceTabProofDesc";
  if (tab === "collaboration") return "surfaceTabCollaborationDesc";
  if (tab === "agent") return "surfaceTabAgentDesc";
  return "surfaceTabCensusDesc";
}

export function InsightsPageHeaderChrome({
  eyebrow,
  title,
  subtitle,
  infoLabel,
  proofPoints = [],
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  infoLabel: string;
  proofPoints?: string[];
}) {
  return (
    <section className="mb-6 space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {eyebrow}
      </p>
      <div className="flex items-center gap-2">
        <h1 className="break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </h1>
        <InsightsInfoButton label={infoLabel} content={subtitle} />
      </div>
      <p className="max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
        {subtitle}
      </p>
      {proofPoints.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label={title}>
          {proofPoints.map((point) => (
            <li
              key={point}
              className="inline-flex min-h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
            >
              {point}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function InsightsReaderIntentStrip({
  label,
  title,
  body,
  actionLabel,
  actionHref,
}: {
  label: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <section
      aria-label={label}
      className="mb-5 border-y border-[color:var(--color-border-soft)] py-3"
      data-testid="insights-reader-intent"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {label}
          </p>
          <p className="mt-1 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {title}
          </p>
          <p className="mt-1 max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {body}
          </p>
        </div>
        <Link
          href={actionHref}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}

function buildInsightsReaderActionHref(intent: OntologyReaderIntent): string {
  if (intent === "developer") return "/ontology/edit/?reader=developer";
  return "/ontology/insights/";
}

export function InsightsProofBandHeader({
  eyebrow,
  description,
  infoLabel,
}: {
  eyebrow: string;
  description: string;
  infoLabel: string;
}) {
  return (
    <header className="space-y-1 md:col-span-2" data-testid="insights-band-proof">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
          {eyebrow}
        </p>
        <InsightsInfoButton label={infoLabel} content={description} />
      </div>
      <p className="max-w-2xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
        {description}
      </p>
    </header>
  );
}

export function InsightsSessionProofStrip({
  title,
  items,
  copyLabel,
  copiedLabel,
  copyText,
}: {
  title: string;
  items: Array<{ title: string; body: string; tone: "ready" | "direct" | "fallback" }>;
  copyLabel?: string;
  copiedLabel?: string;
  copyText?: string;
}) {
  const toneClass = {
    ready:
      "border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.07)] text-[color:rgba(151,230,198,0.95)]",
    direct:
      "border-[color:rgba(255,179,71,0.28)] bg-[color:rgba(255,179,71,0.07)] text-[color:rgba(238,198,128,0.95)]",
    fallback:
      "border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.07)] text-[color:var(--color-indigo-accent)]",
  };

  return (
    <section
      aria-label={title}
      className="grid gap-2 md:col-span-2 md:grid-cols-3"
      data-testid="insights-session-proof-strip"
    >
      <div className="flex flex-col gap-2 md:col-span-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
          {title}
        </p>
        {copyText && copyLabel && copiedLabel ? (
          <CopyAgentTextButton
            label={copyLabel}
            copiedLabel={copiedLabel}
            text={copyText}
            compact
          />
        ) : null}
      </div>
      {items.map((item) => (
        <article
          key={item.title}
          className={`rounded-lg border p-3 ${toneClass[item.tone]}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]">
            {item.title}
          </p>
          <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
            {item.body}
          </p>
        </article>
      ))}
    </section>
  );
}

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const readerIntent = parseOntologyReaderIntent(searchParams.get("reader"));
  const [activeInsightsTabState, setActiveInsightsTabState] = useState<{
    readerIntent: OntologyReaderIntent | null;
    tab: InsightsPageTab;
  }>(() => ({
    readerIntent,
    tab: getInsightsTabForReaderIntent(readerIntent),
  }));
  const activeInsightsTab =
    activeInsightsTabState.readerIntent === readerIntent
      ? activeInsightsTabState.tab
      : getInsightsTabForReaderIntent(readerIntent);
  const setActiveInsightsTab = (tab: InsightsPageTab) => {
    setActiveInsightsTabState({ readerIntent, tab });
  };

  const { insight, error } = useOntologyInsight();
  const queryNodeId = searchParams.get("node");
  const readerIntentStrip = readerIntent
    ? {
        label: t("readerIntentLabel", {
          reader: t(`readerIntent.${readerIntent}.reader`),
        }),
        title: t(`readerIntent.${readerIntent}.title`),
        body: t(`readerIntent.${readerIntent}.body`),
        actionLabel: t(`readerIntent.${readerIntent}.action`),
        actionHref: buildInsightsReaderActionHref(readerIntent),
      }
    : null;
  // B2 (insights half) — /ontology·/topology 와 공유하는 baseline 스토어를 읽어
  // "기준 이후 변경점" 요약을 분석 surface 에도 노출. baseline 있을 때만 마운트.
  const changeBaseline = useChangeBaseline();
  const insightsChangeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );
  const insightsNodeById = useMemo(() => {
    const map = new Map<string, KnowledgeGraphNode>();
    if (insight) for (const n of insight.nodes) map.set(n.id, n);
    return map;
  }, [insight]);

  const kindDist = useMemo(
    () => (insight ? computeKindDistribution(insight.nodes) : new Map<string, number>()),
    [insight],
  );
  const HUB_DISPLAY_LIMIT = 10;
  // 전체 허브 후보를 한 번에 구해 truncation 을 사용자에게 알린다 (silent cap
  // 회피) — 상위 HUB_DISPLAY_LIMIT 만 표시하되 전체 개수를 caption 으로 노출.
  const hubRanking = useMemo(
    () => (insight ? rankAllByDegree(insight.nodes, insight.edges) : []),
    [insight],
  );
  const topHubs = useMemo(
    () => hubRanking.slice(0, HUB_DISPLAY_LIMIT),
    [hubRanking],
  );
  const recent = useMemo(
    () => (insight ? selectRecentNodes(insight.nodes, 10) : []),
    [insight],
  );
  const treeResult = useMemo(
    () => (insight ? buildOntologyTree(insight.nodes, insight.edges) : null),
    [insight],
  );
  const orphans = treeResult?.orphans ?? EMPTY_ORPHANS;
  const agentReadiness = useMemo(
    () =>
      insight && treeResult
        ? buildAgentReadinessSummary(insight.nodes, insight.edges, treeResult)
        : null,
    [insight, treeResult],
  );
  const agentEntrypoints = useMemo(
    () => (insight ? selectAgentQueryEntrypoints(insight.nodes, insight.edges, 4) : []),
    [insight],
  );
  const agentProjectEntrypoint = useMemo(
    () => (insight ? selectAgentProjectEntrypoint(insight.nodes, insight.edges) : null),
    [insight],
  );
  const agentQueryRecipes = useMemo(
    () =>
      agentReadiness
        ? buildAgentQueryRecipes(
            agentReadiness.status,
            agentEntrypoints,
            agentProjectEntrypoint,
          )
        : [],
    [agentEntrypoints, agentProjectEntrypoint, agentReadiness],
  );
  const agentPlaybooks = useMemo(
    () => buildAgentInvestigationPlaybooks(agentEntrypoints, agentProjectEntrypoint),
    [agentEntrypoints, agentProjectEntrypoint],
  );
  const agentTraversalStrategies = useMemo(
    () => buildAgentTraversalStrategies(agentEntrypoints, agentProjectEntrypoint),
    [agentEntrypoints, agentProjectEntrypoint],
  );
  const agentGraphDbQueryPack = useMemo(
    () => buildAgentGraphDbQueryPack(agentEntrypoints),
    [agentEntrypoints],
  );
  const agentGuardrails = useMemo(
    () => buildAgentWriteGuardrails(agentEntrypoints),
    [agentEntrypoints],
  );

  const totalNodes = insight?.nodes.length ?? 0;
  const totalEdges = insight?.edges.length ?? 0;
  const focusedQueryNode = useMemo(
    () => (insight ? resolveInsightsQueryNode(queryNodeId, insight.nodes) : null),
    [insight, queryNodeId],
  );

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
  const domainCoupling = useMemo(
    () =>
      insight
        ? computeDomainCouplingMatrix(insight.nodes, insight.edges, DOMAIN_COUPLING_LIMIT, {
            types: DOMAIN_COUPLING_LOCAL_TYPES,
          })
        : null,
    [insight],
  );
  const domainCouplingCliCommand =
    `ontology-atlas domain-matrix [vault] --limit ${DOMAIN_COUPLING_LIMIT} ` +
    `--types ${DOMAIN_COUPLING_CLI_TYPES}`;
  const domainCouplingMcpPayload = formatInsightsQueryOntologyCall({
    operation: "domain_matrix",
    limit: DOMAIN_COUPLING_LIMIT,
    types: DOMAIN_COUPLING_MCP_TYPES,
  });
  const collaboratorBrief = useMemo(() => {
    if (!insight || !domainCoupling) return null;
    return buildInsightsCollaboratorBrief({
      nodeCount: totalNodes,
      relationCount: totalEdges,
      domainCount: domainCoupling.domainCount,
      crossDomainEdgeCount: domainCoupling.crossDomainEdgeCount,
      orphanCount: orphans.length,
      impactHandoffs: domainCoupling.connections.slice(0, 3).map((connection) => {
        const strongest = connection.relationCounts[0];
        const example = connection.examples[0];
        return {
          fromDomain: connection.from.title,
          toDomain: connection.to.title,
          count: connection.count,
          topologyPathHref:
            strongest && example
              ? `/topology/?mode=path&pathFrom=${encodeURIComponent(example.from)}&pathTo=${encodeURIComponent(example.to)}`
              : undefined,
          example:
            strongest && example
              ? {
                  from: example.from,
                  type: edgeTypeLabel(strongest.type),
                  to: example.to,
                }
              : undefined,
        };
      }),
      openQuestions: orphans.slice(0, 3).map((node) => {
        const actions = buildInsightsOrphanNodeActions(node);
        return {
          id: node.id,
          title: node.title,
          kind: node.kind,
          ontologyHref: actions.ontologyHref,
          topologyHref: actions.topologyHref,
          builderHref: actions.builderHref,
        };
      }),
      topHubs: topHubs.map(({ node, degree }) => ({
        id: node.id,
        title: node.title,
        kind: node.kind,
        degree,
        ontologyHref: buildOntologyNodeHref(node.id),
        topologyHref: `/topology/?mode=focus&p=${encodeURIComponent(node.id)}`,
        builderHref: buildOntologyBuilderNodeHref(node),
      })),
    });
  }, [domainCoupling, edgeTypeLabel, insight, orphans, topHubs, totalNodes, totalEdges]);

  return (
    <div>
      <OperationsNav />
      <main id="main" className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <MountedGlobalSearch />

      <InsightsPageHeaderChrome
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
        infoLabel={t("titleInfoAriaLabel")}
        proofPoints={[t("titleProofLocal"), t("titleProofAgent"), t("titleProofRuntime")]}
      />

      {readerIntentStrip ? <InsightsReaderIntentStrip {...readerIntentStrip} /> : null}

      {insight && changeBaseline !== null ? (
        <InsightsChangeStrip
          changeset={insightsChangeset}
          nodeById={insightsNodeById}
          onSelectNode={(node) =>
            router.replace(buildOntologyInsightsNodeHref(node), { scroll: false })
          }
        />
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
        >
          {t("errorAlert", { message: error.message })}
        </div>
      ) : null}

      {!insight ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]"
        >
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
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label={t("surfaceTabsAriaLabel")}
            className="flex flex-wrap gap-1 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-1"
          >
            {(
              [
                ["proof", t("surfaceTabProof")],
                ["collaboration", t("surfaceTabCollaboration")],
                ["agent", t("surfaceTabAgent")],
                ["census", t("surfaceTabCensus")],
              ] as const
            ).map(([tab, label]) => {
              const active = activeInsightsTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`insights-tabpanel-${tab}`}
                  id={`insights-tab-${tab}`}
                  onClick={() => setActiveInsightsTab(tab)}
                  className={
                    active
                      ? "inline-flex h-8 items-center rounded-md border border-[color:rgba(94,106,210,0.36)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                      : "inline-flex h-8 items-center rounded-md px-3 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p
            className="break-keep rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]"
            data-testid="insights-tab-purpose"
          >
            {t(getInsightsTabDescriptionKey(activeInsightsTab))}
          </p>
          <div
            role="tabpanel"
            id={`insights-tabpanel-${activeInsightsTab}`}
            aria-labelledby={`insights-tab-${activeInsightsTab}`}
            aria-label={t(getInsightsTabDescriptionKey(activeInsightsTab))}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
          {/* census vs proof 내러티브 분리 (A4) — 같은 그리드를 두 의도 밴드로
              라벨링. proof = "agent 가 쓸 준비/검증", census = "뭐가 들어있나". */}
          {activeInsightsTab === "proof" ? (
            <>
          {focusedQueryNode ? (
            <section
              aria-label={t("focusedProofRailAriaLabel")}
              className="md:col-span-2 rounded-2xl border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.055)] px-4 py-3"
              data-testid="insights-focused-proof-rail"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                    {t("focusedProofRailEyebrow")}
                  </p>
                  <p className="mt-1 truncate text-[14px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {t("focusedProofRailTitle", { title: focusedQueryNode.title })}
                  </p>
                  <p className="mt-1 hidden break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)] sm:block">
                    {t("focusedProofRailBody", {
                      kind: kindLabel(focusedQueryNode.kind),
                      slug: resolveOntologyBuilderNodeSlug(focusedQueryNode),
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <a
                    href="#insights-focused-node-proof"
                    className="inline-flex h-8 items-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 font-mono text-[10px] text-[color:rgba(211,215,255,0.96)] transition-colors hover:border-[color:rgba(139,151,255,0.46)] hover:bg-[color:rgba(94,106,210,0.14)]"
                  >
                    {t("focusedProofRailJump")}
                  </a>
                  <Link
                    href={buildOntologyNodeHref(focusedQueryNode.id)}
                    className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.34)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {t("focusedProofOpenBrowse")}
                  </Link>
                  <Link
                    href={buildOntologyBuilderNodeHref(focusedQueryNode)}
                    className="inline-flex h-8 items-center rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.08)] px-3 font-mono text-[10px] text-[color:rgba(211,215,255,0.96)] transition-colors hover:border-[color:rgba(139,151,255,0.42)] hover:bg-[color:rgba(139,151,255,0.13)]"
                  >
                    {t("focusedProofOpenBuilder")}
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {agentGraphDbQueryPack.length > 0 ? (
            <InsightsQueryPackCockpit
              graphDbQueryPack={agentGraphDbQueryPack}
              readiness={agentReadiness}
            />
          ) : null}

          {focusedQueryNode ? (
            <InsightsFocusedNodeProofPanel node={focusedQueryNode} />
          ) : null}

          {agentReadiness ? (
            <InsightsProofBandHeader
              eyebrow={t("bandProofEyebrow")}
              description={t("bandProofDesc")}
              infoLabel={t("queryCockpitInfoAriaLabel")}
            />
          ) : null}

          <InsightsSessionProofStrip
            title={t("sessionProofStripTitle")}
            copyLabel={t("sessionProofCopy")}
            copiedLabel={t("agentCopied")}
            copyText={SESSION_PROOF_PACKET}
            items={[
              {
                title: t("sessionProofDirectTitle"),
                body: t("sessionProofDirectBody"),
                tone: "direct",
              },
              {
                title: t("sessionProofFallbackTitle"),
                body: t("sessionProofFallbackBody"),
                tone: "fallback",
              },
              {
                title: t("sessionProofCacheTitle"),
                body: t("sessionProofCacheBody"),
                tone: "ready",
              },
            ]}
          />
            </>
          ) : null}

          {activeInsightsTab === "collaboration" && collaboratorBrief ? (
            <InsightsCollaboratorBriefPanel
              brief={collaboratorBrief}
              impactCliCheckCommand={domainCouplingCliCommand}
              impactMcpCheckPayload={domainCouplingMcpPayload}
            />
          ) : null}

          {activeInsightsTab === "agent" && agentReadiness ? (
            <AgentReadinessPanel
              summary={agentReadiness}
              status={agentReadiness.status}
              score={agentReadiness.score}
              meaningfulNodes={agentReadiness.meaningfulNodes}
              relationCount={agentReadiness.relationCount}
              orphanCount={agentReadiness.orphanCount}
              unknownNodes={agentReadiness.unknownNodes}
              hubCount={agentReadiness.hubCount}
              averageDegree={agentReadiness.averageDegree}
              actionKeys={agentReadiness.actionKeys}
            />
          ) : null}

          {activeInsightsTab === "agent" && agentQueryRecipes.length > 0 ? (
            <AgentQueryRecipesPanel
              recipes={agentQueryRecipes}
              projectEntrypoint={agentProjectEntrypoint}
              entrypoints={agentEntrypoints}
              playbooks={agentPlaybooks}
              graphDbQueryPack={agentGraphDbQueryPack}
              traversalStrategies={agentTraversalStrategies}
              guardrails={agentGuardrails}
            />
          ) : null}

          {activeInsightsTab === "census" ? (
            <>
          <header className="md:col-span-2" data-testid="insights-band-census">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)]">
              {t("bandCensusEyebrow")}
            </p>
            <p className="mt-0.5 break-keep text-[12px] leading-5 text-[color:var(--color-text-quaternary)]">
              {t("bandCensusDesc")}
            </p>
          </header>

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

          {domainCoupling && domainCoupling.domainCount > 0 ? (
            <Panel
              title={t("domainCouplingPanelTitle")}
              subtitle={t("domainCouplingPanelSubtitle", {
                domains: domainCoupling.domainCount,
                cross: domainCoupling.crossDomainEdgeCount,
                assigned: domainCoupling.assignedNodeCount,
                nodes: domainCoupling.nodeCount,
              })}
            >
              <div data-testid="insights-domain-coupling">
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(73,190,146,0.045)] px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("domainCouplingReproduce")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <CopyAgentTextButton
                      label={t("domainCouplingCopyCli")}
                      copiedLabel={t("agentCopied")}
                      text={domainCouplingCliCommand}
                      compact
                    />
                    <CopyAgentTextButton
                      label={t("domainCouplingCopyMcp")}
                      copiedLabel={t("agentCopied")}
                      text={domainCouplingMcpPayload}
                      compact
                    />
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {[
                    {
                      key: "cross",
                      label: t("domainCouplingMetricCross"),
                      value: domainCoupling.crossDomainEdgeCount,
                    },
                    {
                      key: "self",
                      label: t("domainCouplingMetricSelf"),
                      value: domainCoupling.selfDomainEdgeCount,
                    },
                    {
                      key: "unassigned",
                      label: t("domainCouplingMetricUnassigned"),
                      value: domainCoupling.unassignedNodeCount,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.key}
                      className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.045)] px-2 py-1.5"
                    >
                      <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                        {metric.label}
                      </p>
                      <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>
                {domainCoupling.connections.length > 0 ? (
                  <ol className="space-y-2" data-testid="insights-domain-coupling-rows">
                    {domainCoupling.connections.map((connection) => {
                      const strongest = connection.relationCounts[0];
                      const example = connection.examples[0];
                      const topologyPathHref =
                        strongest && example
                          ? `/topology/?mode=path&pathFrom=${encodeURIComponent(example.from)}&pathTo=${encodeURIComponent(example.to)}`
                          : null;
                      const pathCheckPacket =
                        strongest && example && topologyPathHref
                          ? formatDomainCouplingPathCheck({
                              from: example.from,
                              relationType: edgeTypeLabel(strongest.type),
                              to: example.to,
                              topologyPathHref,
                              labels: {
                                title: t("domainCouplingPathCheckTitle"),
                                source: t("domainCouplingPathCheckSource"),
                                target: t("domainCouplingPathCheckTarget"),
                                relation: t("domainCouplingPathCheckRelation"),
                                topology: t("domainCouplingPathCheckTopology"),
                                cli: t("domainCouplingPathCheckCli"),
                                mcpPlan: t("domainCouplingPathCheckMcpPlan"),
                                mcp: t("domainCouplingPathCheckMcp"),
                                evidenceContract: t(
                                  "domainCouplingPathCheckEvidenceContract",
                                ),
                              },
                            })
                          : null;
                      return (
                        <li
                          key={`${connection.from.id}->${connection.to.id}`}
                          className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2"
                          data-testid="insights-domain-coupling-row"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              href={buildOntologyNodeHref(connection.from.id)}
                              className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                            >
                              {connection.from.title}
                            </Link>
                            <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                              →
                            </span>
                            <Link
                              href={buildOntologyNodeHref(connection.to.id)}
                              className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                            >
                              {connection.to.title}
                            </Link>
                            <span className="shrink-0 rounded border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[color:var(--color-text-secondary)]">
                              {connection.count}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {connection.relationCounts.map((row) => (
                              <span
                                key={row.type}
                                className="rounded border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)]"
                              >
                                {edgeTypeLabel(row.type)} {row.count}
                              </span>
                            ))}
                          </div>
                          {strongest && example ? (
                            <div className="mt-2 flex min-w-0 items-center gap-2">
                              <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                                {t("domainCouplingExample", {
                                  from: example.from,
                                  type: edgeTypeLabel(strongest.type),
                                  to: example.to,
                                })}
                              </p>
                              {topologyPathHref ? (
                                <Link
                                  href={topologyPathHref}
                                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                                >
                                  {t("domainCouplingOpenPath")}
                                </Link>
                              ) : null}
                              {pathCheckPacket ? (
                                <CopyAgentTextButton
                                  label={t("domainCouplingCopyPathCheck")}
                                  copiedLabel={t("agentCopied")}
                                  text={pathCheckPacket}
                                  compact
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("domainCouplingEmpty")}
                  </p>
                )}
                {domainCoupling.totalConnectionCount > domainCoupling.connections.length ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("domainCouplingTruncated", {
                      shown: domainCoupling.connections.length,
                      total: domainCoupling.totalConnectionCount,
                    })}
                  </p>
                ) : null}
              </div>
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
                      className={ROW_BASE_CLASS}
                      style={(() => {
                        const accent = rowAccentColor(node);
                        return accent ? { borderLeft: `3px solid ${accent}` } : undefined;
                      })()}
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
            {hubRanking.length > topHubs.length ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("hubsTruncated", {
                  shown: topHubs.length,
                  total: hubRanking.length,
                })}
              </p>
            ) : null}
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
                {orphans.slice(0, 10).map((node) => {
                  const actions = buildInsightsOrphanNodeActions(node);
                  const repairPacket = formatInsightsOrphanRepairPacket({
                    actions,
                    labels: {
                      title: t("orphansRepairPacketTitle"),
                      node: t("orphansRepairPacketNode"),
                      kind: t("orphansRepairPacketKind"),
                      ontology: t("orphansRepairPacketOntology"),
                      topology: t("orphansRepairPacketTopology"),
                      builder: t("orphansRepairPacketBuilder"),
                      agentChecks: t("orphansRepairPacketAgentChecks"),
                      nextSteps: t("orphansRepairPacketNextSteps"),
                      inspectNode: t("orphansRepairPacketInspectNode"),
                      chooseOwner: t("orphansRepairPacketChooseOwner"),
                      preflightRelation: t("orphansRepairPacketPreflightRelation"),
                      verifyHealth: t("orphansRepairPacketVerifyHealth"),
                      syncGate: t("orphansRepairPacketSyncGate"),
                    },
                    node,
                  });
                  const repairMcpPacket = formatInsightsOrphanRepairMcpPacket({
                    labels: {
                      title: t("orphansRepairMcpPacketTitle"),
                      inspectNode: t("orphansRepairMcpPacketInspectNode"),
                      preflightRelation: t(
                        "orphansRepairMcpPacketPreflightRelation",
                      ),
                      verifyHealth: t("orphansRepairMcpPacketVerifyHealth"),
                      syncGate: t("orphansRepairMcpPacketSyncGate"),
                    },
                    node,
                  });
                  return (
                    <li
                      key={node.id}
                      className="rounded-md border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[12px] transition-[border-color,background-color] duration-200 hover:border-[color:rgba(255,179,71,0.40)] hover:bg-[color:rgba(255,179,71,0.08)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex shrink-0 items-center rounded-full border border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.08)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                          {kindLabel(node.kind)}
                        </span>
                        <Link
                          href={actions.ontologyHref}
                          className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                        >
                          {node.title}
                        </Link>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-0 sm:pl-[68px]">
                        <Link
                          href={actions.topologyHref}
                          className="rounded border border-[color:rgba(255,179,71,0.18)] bg-[color:rgba(255,179,71,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(255,179,71,0.34)] hover:text-[color:var(--color-text-primary)]"
                        >
                          {t("orphansOpenTopology")}
                        </Link>
                        <Link
                          href={actions.builderHref}
                          className="rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                        >
                          {t("orphansFocusBuilder")}
                        </Link>
                        <CopyAgentTextButton
                          label={t("orphansCopyRepairPacket")}
                          copiedLabel={t("agentCopied")}
                          text={repairPacket}
                          compact
                        />
                        <CopyAgentTextButton
                          label={t("orphansCopyMcpRepairPacket")}
                          copiedLabel={t("agentCopied")}
                          text={repairMcpPacket}
                          compact
                        />
                      </div>
                    </li>
                  );
                })}
                {orphans.length > 10 ? (
                  <li className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {t("orphansMore", { count: orphans.length - 10 })}
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
            </>
          ) : null}
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
