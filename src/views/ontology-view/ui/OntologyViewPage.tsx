"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Clipboard, GitBranch, Info, Link2, Network, PencilLine, Search, X } from "lucide-react";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyNodeHref,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { getProjectDetailHref, getTopologyProjectHref } from "@/entities/project";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import {
  buildAgentBriefingPacket,
  buildAgentGraphDbQueryPack,
  buildOntologyEgoSubgraph,
  buildOntologyReachability,
  buildOntologyTree,
  formatAgentPostChangeSyncPacket,
  countTreeNodes,
  selectAgentQueryEntrypoints,
  type OntologyEgoSubgraph,
  type OntologyReachability,
  type OntologyReachabilityDirection,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { copyText } from "@/shared/lib/copy-text";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { GlobalSearch, MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { OntologyEgoGraph } from "@/widgets/ontology-ego-graph";
import { OntologyTreeView } from "@/widgets/ontology-tree-view";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  VaultOntologyStubsPanel,
  useOntologyInsight,
} from "@/features/vault-ontology";
import { OperationsNav } from "@/widgets/operations-nav";
import { StaggeredFadeIn, Tooltip, useToast } from "@/shared/ui";
import {
  buildAgentContextBundle,
  buildNodeProfileCliCommand,
  buildNodeProfileMcpCall,
  buildReachabilityCliCommand,
  buildReachabilityMcpCall,
  resolveReachabilityQuerySlug,
} from "../lib/reachability-copy";
import { resolveOntologyDeeplinkNode } from "../lib/resolve-deeplink-node";
import {
  buildOntologyReviewBrief,
  buildOntologyReviewTopologyHref,
  formatImpactRelation,
  formatOntologyReviewBrief,
  formatOntologyVocabularyReview,
  ontologyReviewQuestionsForPrompt,
  type OntologyReviewRelationPreview,
} from "../lib/review-brief";
import {
  buildGraphProofRailModel,
  type GraphProofRailModel,
} from "../lib/graph-proof-rail";
import {
  summarizeTreeProjectionWarnings,
  type TreeProjectionWarningGroup,
} from "../lib/tree-projection-warnings";

/**
 * `/ontology` — ontology view.
 *
 * vault frontmatter (또는 빌드타임 dogfood) 를 트리 구조로 표시. document
 * 노드는 트리에서 제외 (근거 노드). 선택 행 클릭 시 기본 동작은 noop —
 * 인스펙터 패널이 옆에서 디테일을 보여준다.
 */
export function OntologyViewPage() {
  const t = useTranslations('ontologyView');
  const searchParams = useSearchParams();
  const router = useRouter();
  const dataSourceMode = useDataSourceMode();
  const isDesktopRuntime = isTauriVaultRuntime();
  const { show } = useToast();

  const { insight, error } = useOntologyInsight();
  // 트리 row 클릭 시 우측 (mobile bottom) 패널에 노드 상세 노출.
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  // 글로벌 검색 — ⌘K / Ctrl+K 로 토글, 결과 선택 시 selectedNode 로 점프 / 문서 라우트로 점프.
  const [searchOpen, setSearchOpen] = useState(false);
  // 1-hop 기본, 사용자가 토글로 2-hop 까지 확장 가능. 노드 변경 시 자동
  // 1-hop 으로 복귀해 2-hop 의 큰 ego 를 누적해 보지 않게.
  const [egoHops, setEgoHops] = useState<1 | 2>(1);
  const [reachabilityDirection, setReachabilityDirection] =
    useState<OntologyReachabilityDirection>("outgoing");
  const [reachabilityDepth, setReachabilityDepth] = useState<1 | 2 | 3>(3);
  // setSelectedNode + setEgoHops(1) + URL ?node=<id> 동기화를 한 함수로.
  // 트리 / 검색 / neighbor 클릭 / 패널 닫기 모든 진입에서 같은 흐름.
  // history 안 쌓이게 router.replace 사용 (매 노드 클릭마다 뒤로가기 한 단계 X).
  const selectNode = useCallback((next: KnowledgeGraphNode | null) => {
    setSelectedNode(next);
    setEgoHops(1);
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("node", next.id);
    } else {
      params.delete("node");
    }
    const qs = params.toString();
    router.replace(qs ? `/ontology/?${qs}` : "/ontology/", { scroll: false });
  }, [router, searchParams]);

  // ESC 로 패널 닫기.
  useEffect(() => {
    if (!selectedNode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectNode(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNode, selectNode]);

  // ⌘K / Ctrl+K — 페이지-스코프 concept search 토글.
  useGlobalSearchHotkey(searchOpen, setSearchOpen);
  // ⇧⌘K — global search (ontology + projects + docs). 다른 ontology / topology
  // surface 와 동일한 단축키로 ontology hub 일관성 유지.
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  useGlobalSearchHotkey(globalSearchOpen, setGlobalSearchOpen, { shift: true });

  // deeplink — `?node=<id>` 를 selectedNode 와 양방향 동기화. URL 이 source
  // of truth: 외부 surface (검색 / 문서 / 직접 입력) 에서 URL 만 바뀌어도
  // 패널이 자동 열림. selectNode() 자체가 URL 도 갱신하므로 cycle 회피는
  // ID 비교로 (이미 같은 노드면 setState 호출 안 함).
  const deeplinkNodeId = searchParams.get("node");
  useEffect(() => {
    if (!insight) return;
    let cancelled = false;
    if (!deeplinkNodeId) {
      if (selectedNode) {
        window.queueMicrotask(() => {
          if (!cancelled) setSelectedNode(null);
        });
      }
      return () => {
        cancelled = true;
      };
    }
    if (selectedNode?.id === deeplinkNodeId) return;
    const found = resolveOntologyDeeplinkNode(deeplinkNodeId, insight.nodes);
    if (found) {
      window.queueMicrotask(() => {
        if (!cancelled) setSelectedNode(found);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [deeplinkNodeId, insight, selectedNode]);


  const treeResult: OntologyTreeBuildResult | null = useMemo(() => {
    if (!insight) return null;
    return buildOntologyTree(insight.nodes, insight.edges);
  }, [insight]);

  // 단일 "에이전트 브리핑" — 흩어진 패킷들을 하나로 묶어 1-paste 로 AI 에이전트에
  // 코드베이스 온톨로지 메모리를 로드. /ontology 허브(개발자+에이전트 시작점)에
  // 가장 prominent 한 액션으로 노출.
  const agentBriefing = useMemo(
    () =>
      insight && treeResult
        ? buildAgentBriefingPacket(insight.nodes, insight.edges, treeResult)
        : null,
    [insight, treeResult],
  );
  const handleCopyAgentBriefing = useCallback(async () => {
    if (!agentBriefing) return;
    if (await copyText(agentBriefing.briefing)) {
      show(
        t('actions.primeAgentCopied', {
          status: agentBriefing.readiness.status,
          score: agentBriefing.readiness.score,
        }),
        "success",
      );
    } else {
      show(t('actions.primeAgentCopyError'), "error");
    }
  }, [agentBriefing, show, t]);

  // treeResult / insight 가 동일할 때 매 selection re-render 마다 재계산
  // 회피. countTreeNodes 는 트리 walk + filter 는 O(N) — 작아도 매 클릭마다
  // 도는 건 낭비.
  const totalNodes = useMemo(
    () => (treeResult ? countTreeNodes(treeResult.roots) : 0),
    [treeResult],
  );
  const docCount = useMemo(
    () => (insight ? insight.nodes.filter((n) => n.kind === "document").length : 0),
    [insight],
  );

  // evidenceId → 사람-읽기 좋은 title 매핑.
  // - vault 모드 (현재 default): 모든 노드의 evidenceIds[0] 이 sourceSlug
  //   이고 canonical 노드의 title = 그 doc 의 title. 가장 먼저 set 된
  //   canonical 매핑이 if (!map.has) 가드로 우선되어 정확한 doc title
  //   복원.
  // - legacy 'document' kind 노드 (현재 vault 에는 등장 X) 도 동일 ID
  //   공간을 공유하므로 같은 루프로 흡수.
  const documentTitleByEvidenceId = useMemo(() => {
    const map = new Map<string, string>();
    if (!insight) return map;
    for (const n of insight.nodes) {
      for (const eid of n.evidenceIds) {
        if (!map.has(eid)) map.set(eid, n.title);
      }
    }
    return map;
  }, [insight]);

  // 선택 노드의 ego subgraph — egoHops 에 따라 1-hop 또는 2-hop.
  const egoSubgraph: OntologyEgoSubgraph | null = useMemo(() => {
    if (!insight || !selectedNode) return null;
    return buildOntologyEgoSubgraph(selectedNode.id, insight.nodes, insight.edges, {
      hops: egoHops,
    });
  }, [insight, selectedNode, egoHops]);

  const reachability: OntologyReachability | null = useMemo(() => {
    if (!insight || !selectedNode) return null;
    return buildOntologyReachability(selectedNode.id, insight.nodes, insight.edges, {
      depth: reachabilityDepth,
      direction: reachabilityDirection,
      limit: 12,
    });
  }, [insight, reachabilityDepth, reachabilityDirection, selectedNode]);
  const builderHref = selectedNode
    ? buildOntologyBuilderNodeHref(selectedNode)
    : "/ontology/edit/";
  const queryHref = selectedNode
    ? buildOntologyInsightsNodeHref(selectedNode)
    : "/ontology/insights/";
  const workbenchStats = useMemo(() => {
    if (!insight) {
      return {
        semanticRelations: 0,
        containmentRelations: 0,
      };
    }
    const containmentRelations = insight.edges.filter(
      (edge) => edge.type === "contains" || edge.type === "belongs_to",
    ).length;
    return {
      semanticRelations: Math.max(insight.edges.length - containmentRelations, 0),
      containmentRelations,
    };
  }, [insight]);

  const graphProofRailModel = useMemo(() => {
    if (!insight) {
      return buildGraphProofRailModel([]);
    }
    const entrypoints = selectAgentQueryEntrypoints(insight.nodes, insight.edges, 4);
    return buildGraphProofRailModel(buildAgentGraphDbQueryPack(entrypoints));
  }, [insight]);


  return (
    <>
      {/* OperationsNav 는 풀폭으로 (본문 max-w 안에 갇히면 좌우 여백 과대로
          가운데 몰려 보이는 회귀 회피). 'ontology surface' 인 / 와 /ontology*
          에선 OperationsNav 가 SubNav 행을 inline 으로 함께 렌더. */}
      <OperationsNav />
      <main id="main" className="mx-auto w-full max-w-5xl overflow-hidden px-5 py-8 md:px-8 md:py-12">
      <section className="mb-8 space-y-3">
        {/* eyebrow 는 SubNav 의 'ONTOLOGY' caption 과 중복 → 제거. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="flex items-center gap-2 break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t('title')}
            <Tooltip
              content={
                <div className="max-w-[320px] space-y-2 text-left">
                  <p className="font-medium text-[color:var(--color-text-primary)]">
                    {t('titleTooltip.heading')}
                  </p>
                  <p className="text-[color:var(--color-text-tertiary)]">
                    {t.rich('titleTooltip.body', {
                      hierarchy: (chunks) => (
                        <span className="font-mono text-xs">{chunks}</span>
                      ),
                    })}
                  </p>
                  <p className="text-[color:var(--color-text-tertiary)]">
                    {t.rich('titleTooltip.footer', {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                </div>
              }
              withProvider={false}
            >
              <button
                type="button"
                aria-label={t('titleTooltipAria')}
                className="inline-flex items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                <Info size={15} aria-hidden />
              </button>
            </Tooltip>
          </h1>
          {/* 모바일에서 pill row 가 375 폭에 안 들어가 잘릴 때를 위해
              flex-wrap + horizontal scroll 보조. md+ 는 한 줄 유지. -mr/-ml
              음수 마진 + px padding 으로 우측 잘림 방지. */}
          <div className="-mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 pb-1 md:w-auto md:flex-wrap md:overflow-visible md:pb-0">
            {/* Add Node 는 '빌더' CTA 와 destination 동일 → 중복 제거.
                인사이트 / 관계 pill 도 OntologySubNav 가 항상 노출하므로 제거. */}
            <Tooltip content={t('actions.searchTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t('actions.searchAria')}
	                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
	              >
	                <Search size={13} aria-hidden />
	                <span className="hidden sm:inline">{t('actions.search')}</span>
	                <kbd className="hidden font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline" aria-hidden>⌘K</kbd>
	              </button>
	            </Tooltip>
            {/* 노드 + 프로젝트 통합 검색 — ⇧⌘K 단축키 (이전엔 단축키만
                있어 PM 발견성 0). 라벨 "All" 은 통합 의미 — codex 검증:
                현재 GlobalSearch 가 ontology 노드 + 프로젝트 만 cover,
                docs 미포함 → "전체"/"All" 은 OK 지만 docs 약속 안 함. */}
            <Tooltip content={t('actions.globalSearchTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setGlobalSearchOpen(true)}
                aria-label={`${t('actions.globalSearch')} — ${t('actions.globalSearchAria')}`}
	                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
	              >
	                <Network size={13} aria-hidden />
	                <span className="hidden sm:inline">{t('actions.globalSearch')}</span>
	                <kbd className="hidden font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline" aria-hidden>⇧⌘K</kbd>
	              </button>
	            </Tooltip>
	            <Tooltip content={t('actions.queryTooltip')} withProvider={false}>
	              <Link
	                href="/ontology/insights/"
	                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
	                aria-label={t('actions.queryAria')}
	              >
	                <BarChart3 size={13} aria-hidden />
	                <span className="hidden sm:inline">{t('actions.query')}</span>
	              </Link>
	            </Tooltip>
	            {agentBriefing ? (
              <Tooltip content={t('actions.primeAgentTooltip')} withProvider={false}>
                <button
                  type="button"
                  onClick={handleCopyAgentBriefing}
                  aria-label={t('actions.primeAgentAria')}
                  data-testid="prime-agent-cta"
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-4 text-xs font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
                >
                  <Clipboard size={13} aria-hidden />
                  {t('actions.primeAgent')}
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content={t('actions.builderTooltip')} withProvider={false}>
              <Link
                href={builderHref}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-brand)] px-4 text-xs font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90"
                aria-label={`${t('actions.builder')} — ${t('actions.builderAria')}`}
              >
                <PencilLine size={13} aria-hidden />
                {t('actions.builder')}
              </Link>
            </Tooltip>
          </div>
        </div>
      </section>

      <GraphWorkbenchSummary
        treeNodes={totalNodes}
        semanticRelations={workbenchStats.semanticRelations}
        containmentRelations={workbenchStats.containmentRelations}
        builderHref={builderHref}
        queryHref={queryHref}
        activeSlug={
          selectedNode
            ? resolveReachabilityQuerySlug(selectedNode) ?? selectedNode.id
            : null
        }
      />

      {/* tree contract strip. /ontology 트리는 전체 graph DB 편집기가 아니라
          hierarchy browse index 라는 역할을 명확히 노출한다. 관계 작성은
          Builder, graph scan 은 Insights 로 이어지게 분리. */}
      <StaggeredFadeIn
        as="section"
        ariaLabel={t('stat.ariaLabel')}
        className={
          (() => {
            const cols = 3 + ((treeResult?.warnings.length ?? 0) > 0 ? 1 : 0);
            if (cols >= 4) return "mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4";
            if (cols === 3) return "mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3";
            return "mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2";
          })()
        }
      >
        <Stat
          label={t('stat.role')}
          value={t('stat.roleValue')}
          hint={t('stat.roleHint')}
          accent="indigo"
        />
        <Stat
          label={t('stat.graphRefs')}
          value={t('stat.graphRefsValue', {
            nodes: totalNodes,
            relations: insight?.edges.length ?? 0,
          })}
          hint={t('stat.graphRefsHint')}
        />
        <Stat
          label={t('stat.evidence')}
          value={docCount > 0 ? t('stat.evidenceValue', { count: docCount }) : t('stat.evidenceHiddenValue')}
          hint={t('stat.evidenceHint')}
        />
        {treeResult && treeResult.warnings.length > 0 ? (
          <Stat
            label={t('stat.warnings')}
            value={t('stat.warningsValue', { count: treeResult.warnings.length })}
            accent="amber"
            hint={t('stat.warningsHint')}
            ariaLabel={t('stat.warningsAria', { count: treeResult.warnings.length })}
            onClick={() => {
              const el = document.getElementById('tree-data-warnings');
              if (!el) return;
              if (el instanceof HTMLDetailsElement) el.open = true;
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        ) : null}
      </StaggeredFadeIn>

      <GraphProofRail model={graphProofRailModel} />

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
        >
          {t('error', { message: error.message })}
        </div>
      ) : null}

      {!treeResult ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]"
        >
          {t('loading')}
        </div>
      ) : (
        <>
          {!selectedNode && treeResult.roots.length > 0 ? (
            <TreeSelectionHint />
          ) : null}
          <OntologyTreeView
            result={treeResult}
            onSelect={(node) => selectNode(node)}
            emptyHint={t('emptyHint')}
            selectedId={selectedNode?.id ?? null}
            showWarnings={false}
          />
          {dataSourceMode === 'local' ? (
            <div className="mt-4">
              <VaultOntologyStubsPanel />
            </div>
          ) : null}
          {treeResult.warnings.length > 0 ? (
            <TreeProjectionWarnings warnings={treeResult.warnings} />
          ) : null}
          {/* 빈 상태 onboarding — tree / orphans 모두 비었을 때만 노출.
              "온톨로지란 무엇이고, 어떻게 자라는지" 가이드. 데이터 있을 때
              화면 뺏지 않게 빈 상태 한정. mode 별로 다른 다음-단계 안내:
              - local (vault 활성): frontmatter 추가 → 빌더 정리 (vault 열기 단계 skip)
              - 그 외: vault 열기 → frontmatter → 빌더 (3 step) */}
          {treeResult.roots.length === 0 && treeResult.orphans.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t('getStarted.eyebrow')}
              </p>
              <h2 className="mt-1.5 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {dataSourceMode === 'local'
                  ? t('getStarted.headingLocal')
                  : t('getStarted.headingDefault')}
              </h2>
              <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
                {dataSourceMode === 'local'
                  ? t('getStarted.bodyLocal')
                  : t('getStarted.bodyDefault')}
              </p>
              <ol className="mt-4 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                {(dataSourceMode === 'local'
                  ? [
                      ["1", t('getStarted.stepLocalFrontmatterTitle'), t('getStarted.stepLocalFrontmatterDesc')],
                      ["2", t('getStarted.stepLocalBuilderTitle'), t('getStarted.stepLocalBuilderDesc')],
                    ]
                  : [
                      [
                        "1",
                        t(
                          isDesktopRuntime
                            ? 'getStarted.stepStaticVaultTitlePicker'
                            : 'getStarted.stepStaticVaultTitleDownload',
                        ),
                        t(
                          isDesktopRuntime
                            ? 'getStarted.stepStaticVaultDescPicker'
                            : 'getStarted.stepStaticVaultDescDownload',
                        ),
                      ],
                      ["2", t('getStarted.stepStaticFrontmatterTitle'), t('getStarted.stepStaticFrontmatterDesc')],
                      ["3", t('getStarted.stepStaticBuilderTitle'), t('getStarted.stepStaticBuilderDesc')],
                    ]
                ).map(([step, title, desc]) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] font-mono text-[10px] text-[color:rgba(159,170,235,0.95)]">
                      {step}
                    </span>
                    <span className="break-keep">
                      <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{title}</span>
                      <span className="text-[color:var(--color-text-tertiary)]"> — {desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                {dataSourceMode === 'local' ? (
                  <>
                    <Link
                      href={"/ontology/edit/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-4 py-2 text-sm text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
                    >
                      {t('getStarted.ctaBuilder')}
                    </Link>
                    <Link
                      href={"/docs/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 py-2 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {t('getStarted.ctaVault')}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={isDesktopRuntime ? "/docs/?intent=local" : "/download/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-4 py-2 text-sm text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
                    >
                      {t(
                        isDesktopRuntime
                          ? 'getStarted.ctaVaultOpenPicker'
                          : 'getStarted.ctaVaultOpenDownload',
                      )}
                    </Link>
                    <Link
                      href={"/ontology/edit/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 py-2 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {t('getStarted.ctaBuilderShort')}
                    </Link>
                  </>
                )}
              </div>
              {/* local 모드 빈 vault 사용자에게 *복사·붙여넣기* 가능한
                  frontmatter snippet inline 노출 — 빌더 진입 없이도 직접
                  `.md` 작성 가능. AI agent (MCP) 도 동일 포맷으로
                  add_concept 호출. */}
              {dataSourceMode === 'local' ? (
                <details className="mt-4 rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-4 py-3">
                  <summary className="cursor-pointer list-none text-[12px] text-[color:var(--color-text-secondary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">{t('getStarted.snippetEyebrow')}</span>
                    <span className="ml-2">{t('getStarted.snippetSummary')}</span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 font-mono text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">{`---
slug: capabilities/auth
kind: capability
title: Authentication
domain: auth
relates:
  - elements/jwt
  - elements/refresh-token
---

# Authentication

Token issuance, permission checks, session tracking — the user
authentication flow. Replace this body with a 1-2 line summary of
what this capability does.
`}</pre>
                  <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t.rich('getStarted.snippetHelp', {
                      code: (chunks) => <code className="font-mono">{chunks}</code>,
                    })}
                  </p>
                </details>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {selectedNode ? (
        <NodeDetailPanel
          node={selectedNode}
          documentTitleByEvidenceId={documentTitleByEvidenceId}
          ego={egoSubgraph}
          reachability={reachability}
          reachabilityDepth={reachabilityDepth}
          reachabilityDirection={reachabilityDirection}
          egoHops={egoHops}
          onChangeEgoHops={setEgoHops}
          onChangeReachabilityDepth={setReachabilityDepth}
          onChangeReachabilityDirection={setReachabilityDirection}
          onSelectNeighbor={(neighbor) => selectNode(neighbor)}
          onClose={() => selectNode(null)}
        />
      ) : null}

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        nodes={insight?.nodes ?? []}
        onSelectNode={(node) => selectNode(node)}
      />

      {/* ⇧⌘K — global search (ontology + projects). 다른 surface 와 일관성. */}
      <MountedGlobalSearch
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
        onSelectNode={(node) => selectNode(node)}
      />

      <OntologyMetaFooter
        nodeCount={insight?.nodes.length ?? 0}
        edgeCount={insight?.edges.length ?? 0}
        mode={dataSourceMode}
      />
      </main>
    </>
  );
}

/**
 * /ontology 페이지 하단 영구 footer — 노드/엣지 count + 현재 운영 모드를
 * 한 줄로 노출해 사용자에게 \"지금 보고 있는 ontology 가 어느 source 인지\"
 * (vault vs dogfood) 알려준다.
 */
function OntologyMetaFooter({
  nodeCount,
  edgeCount,
  mode,
}: {
  nodeCount: number;
  edgeCount: number;
  mode: 'static' | 'local';
}) {
  const t = useTranslations('ontologyView.footer');
  const modeLabel = mode === 'local' ? t('modeLocal') : t('modeStatic');
  return (
    <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-[11px] text-[color:var(--color-text-quaternary)]">
      <span
        className="font-mono uppercase tracking-[0.14em] underline decoration-dotted decoration-[color:var(--color-text-quaternary)] underline-offset-4 cursor-help"
        title={t('countsHint')}
      >
        {t('counts', { nodes: nodeCount, edges: edgeCount })}
      </span>
      <span aria-hidden>·</span>
      <span className="font-mono uppercase tracking-[0.14em]">
        {t('modePrefix')}: {modeLabel}
      </span>
    </footer>
  );
}

function TreeSelectionHint() {
  const t = useTranslations("ontologyView.selectionHint");
  const items = [
    {
      step: "01",
      icon: Network,
      label: t("browseLabel"),
      value: t("browseValue"),
    },
    {
      step: "02",
      icon: PencilLine,
      label: t("writeLabel"),
      value: t("writeValue"),
    },
    {
      step: "03",
      icon: BarChart3,
      label: t("queryLabel"),
      value: t("queryValue"),
    },
  ] as const;

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mb-3 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-3 py-2.5"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
            {t("eyebrow")}
          </p>
          <span
            className="mt-1 inline-flex rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(0,0,0,0.12)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
            title={t("slugChipTitle")}
          >
            {t("slugChip")}
          </span>
          <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {t("body")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="inline-flex min-w-0 items-center gap-2 rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1.5"
              >
                <span className="flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.14)]">
                  <span className="font-mono text-[8px] leading-none tabular-nums text-[color:var(--color-text-quaternary)]">
                    {item.step}
                  </span>
                  <Icon size={10} className="mt-0.5 text-[color:var(--color-indigo-accent)]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {item.label}
                  </span>
                  <span className="block max-w-[118px] truncate text-[10px] text-[color:var(--color-text-secondary)]">
                    {item.value}
                  </span>
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * "노드 링크 복사" 버튼 — `/ontology/?node=<id>` 절대 URL 을 clipboard 에
 * 쓰기. 사용자가 특정 노드를 다른 사람에게 공유할 때 (Slack DM / spec
 * 문서 인라인 링크) NodeDetailPanel 을 열어 두지 않고도 같은 진입을 만들
 * 수 있게 한다.
 */
function CopyNodeLinkButton({
  node,
}: {
  node: KnowledgeGraphNode;
}) {
  const t = useTranslations('ontologyView.copyLink');
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${buildOntologyNodeHref(node.id)}`;
    if (await copyText(url)) {
      setCopied(true);
      show(t('toastSuccess'), "success");
      window.setTimeout(() => setCopied(false), 1500);
      return;
    }
    show(t('toastError'), "error");
  };

  return (
    <Tooltip content={t('tooltip')} withProvider={false}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? t('ariaCopied') : t('ariaCopy')}
        className={
          copied
            ? "flex h-8 items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-2.5 text-[11px] text-[color:var(--color-indigo-accent)]"
            : "flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        }
      >
        <Link2 size={14} aria-hidden />
        {copied ? <span className="font-mono text-[10px] uppercase tracking-[0.10em]">{t('badge')}</span> : null}
      </button>
    </Tooltip>
  );
}

function ReachabilityCopyActions({
  slug,
  direction,
  depth,
}: {
  slug: string;
  direction: OntologyReachabilityDirection;
  depth: 1 | 2 | 3;
}) {
  const t = useTranslations('ontologyView.detail');
  const { show } = useToast();
  const limit = 12;

  const handleCopy = async (text: string) => {
    if (await copyText(text)) {
      show(t('reachabilityCopyToastSuccess'), "success");
      return;
    }
    show(t('reachabilityCopyToastError'), "error");
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => void handleCopy(buildReachabilityMcpCall({ slug, direction, depth, limit }))}
        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
      >
        <Clipboard size={12} aria-hidden />
        <span className="truncate">{t('reachabilityCopyMcp')}</span>
      </button>
      <button
        type="button"
        onClick={() => void handleCopy(buildReachabilityCliCommand({ slug, direction, depth, limit }))}
        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
      >
        <Clipboard size={12} aria-hidden />
        <span className="truncate">{t('reachabilityCopyCli')}</span>
      </button>
    </div>
  );
}

function AgentContextCopyActions({
  slug,
  reachabilityDirection,
  reachabilityDepth,
}: {
  slug: string;
  reachabilityDirection: OntologyReachabilityDirection;
  reachabilityDepth: 1 | 2 | 3;
}) {
  const t = useTranslations('ontologyView.detail');
  const { show } = useToast();
  const profileLimit = 8;
  const reachabilityLimit = 12;

  const handleCopy = async (
    text: string,
    successKey: "agentContextCopyToastSuccess" | "agentContextBundleToastSuccess",
    errorKey: "agentContextCopyToastError" | "agentContextBundleToastError",
  ) => {
    if (await copyText(text)) {
      show(t(successKey), "success");
      return;
    }
    show(t(errorKey), "error");
  };

  return (
    <div className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
        {t('agentContextTitle')}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void handleCopy(
            buildNodeProfileMcpCall({ slug, limit: profileLimit }),
            "agentContextCopyToastSuccess",
            "agentContextCopyToastError",
          )}
          className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
        >
          <Clipboard size={12} aria-hidden />
          <span className="truncate">{t('agentContextCopyMcp')}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleCopy(
            buildNodeProfileCliCommand({ slug, limit: profileLimit }),
            "agentContextCopyToastSuccess",
            "agentContextCopyToastError",
          )}
          className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
        >
          <Clipboard size={12} aria-hidden />
          <span className="truncate">{t('agentContextCopyCli')}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleCopy(
            buildAgentContextBundle({
              slug,
              direction: reachabilityDirection,
              depth: reachabilityDepth,
              reachabilityLimit,
              profileLimit,
            }),
            "agentContextBundleToastSuccess",
            "agentContextBundleToastError",
          )}
          className="col-span-2 inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] px-2.5 py-1.5 text-[10px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.14)]"
        >
          <Clipboard size={12} aria-hidden />
          <span className="truncate">{t('agentContextCopyBundle')}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 트리 row 클릭 시 노출되는 노드 상세 패널.
 *
 * 데스크톱 (md+) — 화면 우측 고정 카드 (right rail).
 * 모바일 — 화면 하단 고정 시트 (BottomTabBar 위).
 *
 * project kind 면 공개 detail 페이지 진입 CTA. unknown (stub) 이면 vault
 * 에 매칭 slug 가 없다는 안내 — 빌더에서 채우거나 frontmatter 에서 빼면 해결.
 */
function NodeDetailPanel({
  node,
  documentTitleByEvidenceId,
  ego,
  reachability,
  reachabilityDepth,
  reachabilityDirection,
  egoHops,
  onChangeEgoHops,
  onChangeReachabilityDepth,
  onChangeReachabilityDirection,
  onSelectNeighbor,
  onClose,
}: {
  node: KnowledgeGraphNode;
  documentTitleByEvidenceId: Map<string, string>;
  ego: OntologyEgoSubgraph | null;
  reachability: OntologyReachability | null;
  reachabilityDepth: 1 | 2 | 3;
  reachabilityDirection: OntologyReachabilityDirection;
  egoHops: 1 | 2;
  onChangeEgoHops: (hops: 1 | 2) => void;
  onChangeReachabilityDepth: (depth: 1 | 2 | 3) => void;
  onChangeReachabilityDirection: (direction: OntologyReachabilityDirection) => void;
  onSelectNeighbor: (node: KnowledgeGraphNode) => void;
  onClose: () => void;
}) {
  const t = useTranslations('ontologyView.detail');
  const { show } = useToast();
  const getKindLabel = useOntologyKindLabel();
  const kindLabel = getKindLabel(node.kind);
  const isProject = node.kind === "project";
  const isStub = node.kind === "unknown";
  const isDocument = node.kind === "document";
  const projectSlug = isProject ? node.projectIds[0] ?? null : null;
  // document 노드는 evidenceIds[0] 가 자기 자신의 underlying ID. 그 외
  // 노드는 evidenceIds 가 근거 문서 목록 — "관련 문서" 리스트.
  const evidenceList = isDocument ? [] : node.evidenceIds;
  // \"+N개 더\" 토글 — 사용자가 모든 이웃 / 근거를 펼칠 수 있게. node
  // 변경 시 state 초기화 (다른 노드의 펼친 상태가 새 패널에 안 새도록).
  const [panelExpansion, setPanelExpansion] = useState(() => ({
    nodeId: node.id,
    showAllNeighbors: false,
    showAllEvidence: false,
  }));
  const showAllNeighbors =
    panelExpansion.nodeId === node.id ? panelExpansion.showAllNeighbors : false;
  const showAllEvidence =
    panelExpansion.nodeId === node.id ? panelExpansion.showAllEvidence : false;
  const setShowAllNeighbors = (next: (current: boolean) => boolean) => {
    setPanelExpansion((current) => ({
      nodeId: node.id,
      showAllNeighbors: next(
        current.nodeId === node.id ? current.showAllNeighbors : false,
      ),
      showAllEvidence:
        current.nodeId === node.id ? current.showAllEvidence : false,
    }));
  };
  const setShowAllEvidence = (next: (current: boolean) => boolean) => {
    setPanelExpansion((current) => ({
      nodeId: node.id,
      showAllNeighbors:
        current.nodeId === node.id ? current.showAllNeighbors : false,
      showAllEvidence: next(
        current.nodeId === node.id ? current.showAllEvidence : false,
      ),
    }));
  };
  const NEIGHBOR_PREVIEW = 6;
  const EVIDENCE_PREVIEW = 6;
  const visibleEvidence = showAllEvidence
    ? evidenceList
    : evidenceList.slice(0, EVIDENCE_PREVIEW);
  const hiddenEvidenceCount = Math.max(0, evidenceList.length - visibleEvidence.length);
  const reachabilityQuerySlug = resolveReachabilityQuerySlug(node);
  const topologyHref = buildOntologyReviewTopologyHref(node.id);
  const builderHref = buildOntologyBuilderNodeHref(node);
  const queryHref = buildOntologyInsightsNodeHref(node);
  const directNeighbors = ego?.neighbors.filter((neighbor) => neighbor.hop === 1) ?? [];
  const relationTypes = buildRelationTypeCounts(directNeighbors);
  const relationPreview = buildRelationPreviewRows(directNeighbors, getKindLabel);
  const reviewBrief = buildOntologyReviewBrief({
    node,
    incomingCount: directNeighbors.filter((neighbor) => neighbor.direction === "incoming").length,
    outgoingCount: directNeighbors.filter((neighbor) => neighbor.direction === "outgoing").length,
    relationTypes,
    relationPreview,
    topologyHref,
    builderHref,
    queryHref,
    agentCheckSlug: reachabilityQuerySlug,
  });
  const reviewAgentChecks = reviewBrief.agentChecks;
  const reviewQuestions = ontologyReviewQuestionsForPrompt(reviewBrief.prompt, {
    define_owner: [
      t('reviewQuestions.defineOwnerOwner'),
      t('reviewQuestions.defineOwnerContainer'),
      t('reviewQuestions.defineOwnerMeaning'),
    ],
    explain_usage: [
      t('reviewQuestions.explainUsageDepends'),
      t('reviewQuestions.explainUsageWhy'),
      t('reviewQuestions.explainUsageAudience'),
    ],
    confirm_dependents: [
      t('reviewQuestions.confirmDependentsWho'),
      t('reviewQuestions.confirmDependentsChange'),
      t('reviewQuestions.confirmDependentsReviewer'),
    ],
    trace_impact: [
      t('reviewQuestions.traceImpactIncoming'),
      t('reviewQuestions.traceImpactOutgoing'),
      t('reviewQuestions.traceImpactBoundary'),
    ],
  });
  const copyReviewAgentCheck = async (text: string) => {
    if (await copyText(text)) {
      show(t('agentContextCopyToastSuccess'), 'success');
      return;
    }
    show(t('agentContextCopyToastError'), 'error');
  };
  const copyReviewSyncGate = async () => {
    if (await copyText(formatAgentPostChangeSyncPacket())) {
      show(t('reviewCopySyncGateSuccess'), 'success');
      return;
    }
    show(t('reviewCopySyncGateError'), 'error');
  };
  const copySelectedNodeProof = async () => {
    if (!reachabilityQuerySlug) return;
    const text = buildAgentContextBundle({
      slug: reachabilityQuerySlug,
      direction: reachabilityDirection,
      depth: reachabilityDepth,
      reachabilityLimit: 12,
      profileLimit: 8,
    });
    if (await copyText(text)) {
      show(t('agentContextBundleToastSuccess'), 'success');
      return;
    }
    show(t('agentContextBundleToastError'), 'error');
  };
  const copyReviewBrief = async () => {
    const text = formatOntologyReviewBrief({
      node,
      brief: reviewBrief,
      lensLabel: t(`reviewLens.${reviewBrief.lens}`),
      promptLabel: t(`reviewPrompt.${reviewBrief.prompt}`),
      reviewQuestionsLabel: t('reviewQuestionsTitle'),
      reviewQuestions,
      impactSummaryLabel: t('reviewImpactTitle'),
      impactSummaryText: t(`reviewImpact.${reviewBrief.impactSummary.level}`),
      impactIncomingLabel: t('reviewImpactIncoming'),
      impactOutgoingLabel: t('reviewImpactOutgoing'),
      impactNoneLabel: t('reviewImpactNone'),
      relationPreviewLabel: t('reviewRelationPreviewTitle'),
      relationPreview,
      noRelationPreviewLabel: t('reviewRelationPreviewEmpty'),
    });
    if (await copyText(text)) {
      show(t('reviewCopySuccess'), 'success');
      return;
    }
    show(t('reviewCopyError'), 'error');
  };
  const copyVocabularyReview = async () => {
    const text = formatOntologyVocabularyReview({
      node,
      brief: reviewBrief,
      reviewQuestions,
      labels: {
        title: t('reviewVocabularyTitle'),
        meaningToKeep: t('reviewVocabularyMeaning'),
        reuseContext: t('reviewVocabularyReuse'),
        reviewQuestions: t('reviewQuestionsTitle'),
        relationAnchors: t('reviewVocabularyAnchors'),
        handoff: t('reviewVocabularyHandoff'),
        topology: t('reviewOpenTopology'),
        builder: t('reviewOpenBuilder'),
        query: t('reviewOpenQuery'),
        sourceFallback: t('reviewNoSource'),
        noRelationPreview: t('reviewRelationPreviewEmpty'),
        incoming: t('reviewRelationPreviewIn'),
        outgoing: t('reviewRelationPreviewOut'),
      },
    });
    if (await copyText(text)) {
      show(t('reviewCopySuccess'), 'success');
      return;
    }
    show(t('reviewCopyError'), 'error');
  };
  // evidenceId 는 vault `.md` slug. /docs/?slug=... viewer 가 대응 라우트라
  // 각 chip 을 그 viewer 로 가는 Link 로 노출 — ontology 그래프 → 원문 docs
  // 한 클릭 점프.

  return (
    <aside
      role="dialog"
      aria-label={t('ariaLabel', { title: node.title })}
      aria-modal="false"
      data-testid="ontology-node-detail"
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-full max-w-md max-h-[min(60vh,520px)] flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-4 shadow-[0_-12px_28px_rgba(0,0,0,0.45)] md:bottom-auto md:right-6 md:top-24 md:left-auto md:mx-0 md:w-[360px] md:max-h-[calc(100vh-7rem)] md:rounded-2xl md:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {kindLabel}
            </p>
          </div>
          <h2 className="mt-1 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {node.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyNodeLinkButton node={node} />
          <Tooltip content={t('reviewOpenTopology')} withProvider={false}>
            <Link
              href={topologyHref}
              aria-label={t('reviewOpenTopology')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <Network size={15} aria-hidden />
            </Link>
          </Tooltip>
          <Tooltip content={t('builderFocus')} withProvider={false}>
            <Link
              href={builderHref}
              aria-label={t('builderFocus')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <PencilLine size={15} aria-hidden />
            </Link>
          </Tooltip>
          <Tooltip content={t('reviewOpenQuery')} withProvider={false}>
            <Link
              href={reviewBrief.handoffLinks.query}
              aria-label={t('reviewOpenQuery')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <BarChart3 size={15} aria-hidden />
            </Link>
          </Tooltip>
          {/* 새 edge 는 vault frontmatter array (capabilities / elements /
              dependencies / relates / contains / describes) 직접 추가 또는
              builder canvas (/ontology/edit). */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {node.summary ? (
        <p className="mb-3 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
          {node.summary}
        </p>
      ) : null}

      {/* R10 이후 vault 가 유일 모드 — node.projectIds 는 항상 [],
          node.evidenceCount 는 항상 undefined. cycle 10 에서 vault dead
          row 두 개를 가리는 가드만 추가했지만 실제 노출 케이스가 영구
          0 이라 cycle 16 에서 IIFE 자체 + DetailRow 컴포넌트 + linkedProjects
          / evidenceCount i18n 키까지 한꺼번에 제거. 같은 정보가 필요해
          지면 '관련 문서' 섹션 + 점프 chip 이 더 풍부하게 보여 줌. */}
      <p className="mt-2 break-all font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
        {node.id}
      </p>
      <nav
        aria-label={t('handoffAriaLabel')}
        className="mt-3 grid grid-cols-1 gap-1.5 2xl:grid-cols-3"
      >
        <Link
          href={topologyHref}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:text-[color:var(--color-text-primary)]"
        >
          <span className="flex min-w-0 items-start gap-1">
            <span className="flex h-6 w-6 shrink-0 flex-col items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <span className="font-mono text-[8px] leading-none tabular-nums text-[color:var(--color-text-quaternary)]">01</span>
              <Network size={9} className="mt-0.5 text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[8px] uppercase tracking-[0.08em]">
                {t('handoffBrowseLabel')}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
                {t('handoffBrowseProof')}
              </span>
            </span>
          </span>
        </Link>
        <Link
          href={builderHref}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:text-[color:var(--color-text-primary)]"
        >
          <span className="flex min-w-0 items-start gap-1">
            <span className="flex h-6 w-6 shrink-0 flex-col items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <span className="font-mono text-[8px] leading-none tabular-nums text-[color:var(--color-text-quaternary)]">02</span>
              <PencilLine size={9} className="mt-0.5 text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[8px] uppercase tracking-[0.08em]">
                {t('handoffWriteLabel')}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
                {t('handoffWriteProof')}
              </span>
            </span>
          </span>
        </Link>
        <Link
          href={reviewBrief.handoffLinks.query}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:text-[color:var(--color-text-primary)]"
        >
          <span className="flex min-w-0 items-start gap-1">
            <span className="flex h-6 w-6 shrink-0 flex-col items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <span className="font-mono text-[8px] leading-none tabular-nums text-[color:var(--color-text-quaternary)]">03</span>
              <BarChart3 size={9} className="mt-0.5 text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[8px] uppercase tracking-[0.08em]">
                {t('handoffQueryLabel')}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
                {t('handoffQueryProof')}
              </span>
            </span>
          </span>
        </Link>
      </nav>
      {reachabilityQuerySlug ? (
        <button
          type="button"
          onClick={() => void copySelectedNodeProof()}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-2 text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)]"
        >
          <Clipboard size={12} aria-hidden />
          {t('handoffCopyProof')}
        </button>
      ) : null}
      <div
        className="mt-4 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
        data-testid="ontology-relation-preview"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('reviewRelationPreviewTitle')}
            </p>
            <p className="mt-1 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t('reviewRelationPreviewDeck')}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t('reviewRelations', {
              outgoing: reviewBrief.relationSummary.outgoing,
              incoming: reviewBrief.relationSummary.incoming,
            })}
          </span>
        </div>
        {relationPreview.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {relationPreview.map((row) => (
              <li
                key={`${row.direction}-${row.type}-${row.nodeId}`}
                className="flex min-w-0 items-center gap-1.5 text-[11px] leading-5 text-[color:var(--color-text-secondary)]"
              >
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {row.direction === "outgoing" ? t('reviewRelationPreviewOut') : t('reviewRelationPreviewIn')}
                </span>
                <span className="shrink-0 rounded-sm border border-[color:rgba(94,106,210,0.20)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]">
                  {row.type}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                  {row.kind}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('reviewRelationPreviewEmpty')}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
          <span className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5">
            {t('reviewSource', {
              source: reviewBrief.sourceSlug ?? t('reviewNoSource'),
            })}
          </span>
          <span className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5">
            {t('reviewRelationTypes', {
              types: reviewBrief.relationTypes.length > 0
                ? reviewBrief.relationTypes
                    .map((row) => `${row.type} ${row.count}`)
                    .join(', ')
                : t('reviewNoRelationTypes'),
            })}
          </span>
        </div>
      </div>
      <div
        className="mt-4 rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] px-3 py-3"
        data-testid="ontology-review-brief"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('reviewTitle')}
            </p>
            <p className="mt-1 break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t(`reviewLens.${reviewBrief.lens}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={copyReviewBrief}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)]"
          >
            <Clipboard size={12} aria-hidden />
            {t('reviewCopy')}
          </button>
        </div>
        <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
          {t(`reviewPrompt.${reviewBrief.prompt}`)}
        </p>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.22)] px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('reviewQuestionsTitle')}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            {reviewQuestions.map((question) => (
              <li key={question} className="break-keep">
                {question}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.18)] px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('reviewImpactTitle')}
          </p>
          <p className="mt-1.5 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            {t(`reviewImpact.${reviewBrief.impactSummary.level}`)}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t('reviewImpactIncoming')}
              </dt>
              <dd className="min-w-0 flex-1 truncate">
                {formatImpactRelation(
                  reviewBrief.impactSummary.firstIncoming,
                  t('reviewImpactNone'),
                )}
              </dd>
            </div>
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t('reviewImpactOutgoing')}
              </dt>
              <dd className="min-w-0 flex-1 truncate">
                {formatImpactRelation(
                  reviewBrief.impactSummary.firstOutgoing,
                  t('reviewImpactNone'),
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={topologyHref}
            className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('reviewOpenTopology')}
          </Link>
          <Link
            href={builderHref}
            className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('reviewOpenBuilder')}
          </Link>
          <Link
            href={reviewBrief.handoffLinks.query}
            className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('reviewOpenQuery')}
          </Link>
          <button
            type="button"
            onClick={() => void copyVocabularyReview()}
            className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('reviewCopyVocabulary')}
          </button>
          {reviewAgentChecks ? (
            <>
              <button
                type="button"
                onClick={() => void copyReviewAgentCheck(reviewAgentChecks.mcp)}
                className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {t('reviewCopyMcpCheck')}
              </button>
              <button
                type="button"
                onClick={() => void copyReviewAgentCheck(reviewAgentChecks.cli)}
                className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {t('reviewCopyCliCheck')}
              </button>
              <button
                type="button"
                onClick={() => void copyReviewAgentCheck(reviewAgentChecks.impactMcp)}
                className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {t('reviewCopyMcpImpactCheck')}
              </button>
              <button
                type="button"
                onClick={() => void copyReviewAgentCheck(reviewAgentChecks.impactCli)}
                className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {t('reviewCopyCliImpactCheck')}
              </button>
              <button
                type="button"
                onClick={() => void copyReviewSyncGate()}
                title={t('reviewCopySyncGateTitle')}
                className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {t('reviewCopySyncGate')}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {reachabilityQuerySlug ? (
        <AgentContextCopyActions
          slug={reachabilityQuerySlug}
          reachabilityDirection={reachabilityDirection}
          reachabilityDepth={reachabilityDepth}
        />
      ) : null}

      {reachability ? (
        <div
          className="mt-4 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
          data-testid="ontology-reachability-summary"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                {t('reachabilityTitle')}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t('reachabilityMeta', {
                  depth: reachability.depth,
                  direction: t(`reachabilityDirection.${reachability.direction}`),
                })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {reachability.summary.reachableNodes}
              </p>
              <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                {t('reachabilityNodes')}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div
              className="grid grid-cols-3 gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-1"
              aria-label={t('reachabilityDirectionLabel')}
            >
              {(["outgoing", "incoming", "both"] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-pressed={reachabilityDirection === direction}
                  onClick={() => onChangeReachabilityDirection(direction)}
                  className={`rounded px-2 py-1.5 text-[10px] transition-colors ${
                    reachabilityDirection === direction
                      ? "bg-[color:rgba(94,106,210,0.20)] text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  {t(`reachabilityDirection.${direction}`)}
                </button>
              ))}
            </div>
            <div
              className="grid grid-cols-3 gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] p-1"
              aria-label={t('reachabilityDepthLabel')}
            >
              {([1, 2, 3] as const).map((depth) => (
                <button
                  key={depth}
                  type="button"
                  aria-pressed={reachabilityDepth === depth}
                  onClick={() => onChangeReachabilityDepth(depth)}
                  className={`rounded px-2 py-1.5 font-mono text-[10px] transition-colors ${
                    reachabilityDepth === depth
                      ? "bg-[color:rgba(94,106,210,0.20)] text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  {t('reachabilityDepthOption', { depth })}
                </button>
              ))}
            </div>
          </div>
          {reachability.summary.reachableNodes > 0 ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-2">
                  <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                    {t('reachabilityLayers')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {reachability.layers.map((layer) => (
                      <span
                        key={layer.distance}
                        className="inline-flex items-center rounded-full bg-[color:rgba(94,106,210,0.12)] px-2 py-0.5 font-mono text-[10px] text-[color:rgba(159,170,235,0.95)]"
                      >
                        d{layer.distance}:{layer.total}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-2">
                  <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                    {t('reachabilityTerminal')}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                    {reachability.summary.terminalNodes}
                  </p>
                </div>
              </div>
              {Object.keys(reachability.byRelation).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(reachability.byRelation).slice(0, 4).map(([relation, count]) => (
                    <span
                      key={relation}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color:var(--color-border-soft)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--color-text-tertiary)]"
                    >
                      <span className="truncate">{relation}</span>
                      <span className="text-[color:var(--color-text-quaternary)]">{count}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-2">
                <p className="font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                  {t('reachabilityPreview')}
                </p>
                <div className="mt-2 space-y-2">
                  {reachability.layers.map((layer) => {
                    const visibleNodes = layer.nodes.slice(0, 3);
                    const hiddenCount = Math.max(0, layer.total - visibleNodes.length);
                    return (
                      <div key={layer.distance} className="space-y-1">
                        <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                          {t('reachabilityPreviewLayer', {
                            distance: layer.distance,
                            count: layer.total,
                          })}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleNodes.map((reachableNode) => (
                            <button
                              key={reachableNode.id}
                              type="button"
                              onClick={() => onSelectNeighbor(reachableNode)}
                              className="inline-flex max-w-full items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-left text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                              title={reachableNode.title}
                            >
                              <span className="truncate">{reachableNode.title}</span>
                            </button>
                          ))}
                          {hiddenCount > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-1 font-mono text-[9px] uppercase text-[color:var(--color-text-quaternary)]">
                              {t('reachabilityPreviewMore', { count: hiddenCount })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {reachability.limited ? (
                <p className="mt-2 text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
                  {t('reachabilityLimited')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 rounded-md border border-[color:var(--color-border-soft)] px-2.5 py-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t('reachabilityEmpty')}
            </p>
          )}
          {reachabilityQuerySlug ? (
            <ReachabilityCopyActions
              slug={reachabilityQuerySlug}
              direction={reachabilityDirection}
              depth={reachabilityDepth}
            />
          ) : null}
        </div>
      ) : null}

      {ego && ego.neighbors.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('relations', { count: ego.neighbors.length })}
              {egoHops === 2 && ego.neighbors.some((n) => n.hop === 2) ? (
                <span className="ml-1 text-[color:var(--color-text-tertiary)]">
                  {t('relationsHopBreakdown', {
                    one: ego.neighbors.filter((n) => n.hop === 1).length,
                    two: ego.neighbors.filter((n) => n.hop === 2).length,
                  })}
                </span>
              ) : null}
            </p>
            <div
              role="radiogroup"
              aria-label={t('egoDepthAria')}
              className="flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={egoHops === 1}
                onClick={() => onChangeEgoHops(1)}
                className={`rounded-full px-2 py-[1px] text-[10px] tracking-[0.02em] transition-colors ${
                  egoHops === 1
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                1-hop
              </button>
              <Tooltip content={t('egoTwoHopTooltip')} withProvider={false}>
              <button
                type="button"
                role="radio"
                aria-checked={egoHops === 2}
                onClick={() => onChangeEgoHops(2)}
                className={`rounded-full px-2 py-[1px] text-[10px] tracking-[0.02em] transition-colors ${
                  egoHops === 2
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                2-hop
              </button>
              </Tooltip>
            </div>
          </div>
          {/* ego SVG — 데스크톱·모바일 모두 노출. 큰 ego (>12) 도 작동
              하지만 라벨 겹침 가능 — 그 경우는 트리·검색 surface 가 보조.
              2-hop 토글 시 동심원 (1-hop inner / 2-hop outer) 으로 분리. */}
          <div className="mt-2 overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
            <OntologyEgoGraph
              ego={ego}
              centerNode={node}
              onSelectNeighbor={onSelectNeighbor}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {(showAllNeighbors ? ego.neighbors : ego.neighbors.slice(0, NEIGHBOR_PREVIEW)).map((neighbor) => {
              const isOutgoing = neighbor.direction === "outgoing";
              const arrow = isOutgoing ? "→" : "←";
              const relationLabel = neighbor.edge.label ?? neighbor.edge.type;
              const neighborTitle = neighbor.node?.title ?? neighbor.neighborId;
              const neighborKindLabel = neighbor.node ? getKindLabel(neighbor.node.kind) : t('neighborMissingKind');
              const ariaLabel = isOutgoing
                ? `${node.title} → ${relationLabel} → ${neighborTitle}`
                : `${neighborTitle} → ${relationLabel} → ${node.title}`;
              const clickable = neighbor.node !== null;
              const content = (
                <>
                  <span
                    className="inline-flex shrink-0 items-center font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                    aria-hidden
                  >
                    {arrow} {relationLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-secondary)]">
                    {neighborTitle}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {neighborKindLabel}
                  </span>
                </>
              );
              return (
                <li key={`${neighbor.edge.id}-${neighbor.direction}`}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => neighbor.node && onSelectNeighbor(neighbor.node)}
                      aria-label={ariaLabel}
                      className="flex w-full items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:bg-[color:rgba(94,106,210,0.06)]"
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      aria-label={ariaLabel}
                      className="flex w-full items-center gap-2 rounded-md border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[11px]"
                      title={t('neighborMissingTitle')}
                    >
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {ego.neighbors.length > NEIGHBOR_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAllNeighbors((v) => !v)}
              aria-expanded={showAllNeighbors}
              className="mt-1.5 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
            >
              {showAllNeighbors
                ? t('collapse')
                : t('showMore', { count: ego.neighbors.length - NEIGHBOR_PREVIEW })}
            </button>
          ) : null}
        </div>
      ) : null}

      {visibleEvidence.length > 0 ? (
        <div className="mt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('relatedDocs', { count: evidenceList.length })}
          </p>
          <ul className="mt-2 space-y-1">
            {visibleEvidence.map((evidenceId) => {
              const title = documentTitleByEvidenceId.get(evidenceId) ?? evidenceId;
              return (
                <li key={evidenceId}>
                  <Link
                    href={buildDocsVaultHref({ slug: evidenceId })}
                    className="block truncate rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                    title={title}
                  >
                    {title}
                  </Link>
                </li>
              );
            })}
          </ul>
          {evidenceList.length > EVIDENCE_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAllEvidence((v) => !v)}
              aria-expanded={showAllEvidence}
              className="mt-1.5 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
            >
              {showAllEvidence
                ? t('collapse')
                : t('showMore', { count: hiddenEvidenceCount })}
            </button>
          ) : null}
        </div>
      ) : null}

      {isProject && projectSlug ? (
        // 두 surface 로의 점프 — 한 줄 안에서 시각 weight 구분.
        // primary (indigo) = 공개 상세 페이지 (정적 SEO 노출 surface),
        // secondary (무채색) = 토폴로지 (project drawer 가 열린 상태로
        // Sigma 그래프). 1원칙: ontology / topology / project-detail 셋
        // 다 같은 vault doc 의 다른 투영 → 한 selection 안에서 모두 도달
        // 가능해야 한다.
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={getProjectDetailHref(projectSlug)}
            className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-3.5 py-1.5 text-xs text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
          >
            {t('projectDetailCta')}
          </Link>
          <Link
            href={getTopologyProjectHref(projectSlug)}
            className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-1.5 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('topologyCta')}
          </Link>
        </div>
      ) : null}
      {isStub ? (
        <p className="mt-4 break-keep rounded-md border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.06)] px-3 py-2 text-xs text-[color:rgba(238,198,128,0.95)]">
          {t('stubWarning')}
        </p>
      ) : null}
    </aside>
  );
}

function buildRelationTypeCounts(
  neighbors: NonNullable<OntologyEgoSubgraph>["neighbors"],
): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const neighbor of neighbors) {
    const type = neighbor.edge.label ?? neighbor.edge.type;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function buildRelationPreviewRows(
  neighbors: NonNullable<OntologyEgoSubgraph>["neighbors"],
  getKindLabel: (kind: string) => string,
): OntologyReviewRelationPreview[] {
  return neighbors.slice(0, 4).map((neighbor) => ({
    direction: neighbor.direction,
    type: neighbor.edge.label ?? neighbor.edge.type,
    title: neighbor.node?.title ?? neighbor.neighborId,
    kind: neighbor.node ? getKindLabel(neighbor.node.kind) : "missing",
    nodeId: neighbor.neighborId,
  }));
}

function GraphWorkbenchSummary({
  treeNodes,
  semanticRelations,
  containmentRelations,
  builderHref,
  queryHref,
  activeSlug,
}: {
  treeNodes: number;
  semanticRelations: number;
  containmentRelations: number;
  builderHref: string;
  queryHref: string;
  activeSlug?: string | null;
}) {
  const t = useTranslations("ontologyView.workbench");
  const items = [
    {
      step: "01",
      icon: GitBranch,
      label: t("treeLabel"),
      value: t("treeValue", { count: treeNodes }),
      body: t("treeBody"),
      loopAction: t("treeLoopAction"),
      proof: t("treeProof"),
      href: "/ontology/",
      cta: t("treeCta"),
      ariaLabel: t("treeAriaLabel"),
      current: true,
    },
    {
      step: "02",
      icon: Network,
      label: t("builderLabel"),
      value: t("builderValue"),
      body: t("builderBody", { count: containmentRelations }),
      loopAction: t("builderLoopAction"),
      proof: t("builderProof"),
      href: builderHref,
      cta: t("builderCta"),
      ariaLabel: t("builderAriaLabel"),
      current: false,
    },
    {
      step: "03",
      icon: BarChart3,
      label: t("graphDbLabel"),
      value: t("graphDbValue", { count: semanticRelations }),
      body: t("graphDbBody"),
      loopAction: t("graphDbLoopAction"),
      proof: t("graphDbProof"),
      href: queryHref,
      cta: t("graphDbCta"),
      ariaLabel: t("graphDbAriaLabel"),
      current: false,
    },
  ] as const;

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mb-6"
    >
      {activeSlug ? (
        <div
          aria-live="polite"
          className="mb-2 flex min-w-0 flex-col gap-1.5 rounded-lg border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.045)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-indigo-accent)]">
            {t("activeSlugLabel", { slug: activeSlug })}
          </span>
          <span className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("activeSlugBody")}
          </span>
        </div>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              aria-label={item.ariaLabel}
              className={
                item.current
                  ? "group flex min-w-0 flex-col rounded-lg border border-[color:rgba(94,106,210,0.42)] bg-[color:rgba(94,106,210,0.08)] px-3 py-3 transition-colors hover:border-[color:rgba(94,106,210,0.52)]"
                  : "group flex min-w-0 flex-col rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-3 transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.07)]"
              }
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:rgba(94,106,210,0.38)] group-hover:text-[color:var(--color-indigo-accent)]">
                  <span className="font-mono text-[10px] leading-none text-[color:var(--color-text-quaternary)]">
                    {item.step}
                  </span>
                  <Icon size={13} className="mt-1" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {item.value}
                  </p>
                </div>
              </div>
              <p className="mt-2 min-h-10 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                {item.body}
              </p>
              <p className="mt-2 rounded-md border border-[color:rgba(255,255,255,0.07)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1.5 text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
                {item.loopAction}
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  <span className="uppercase tracking-[0.10em]">{t("proofLabel")}</span>
                  <span className="h-3 w-px bg-[color:var(--color-border-soft)]" />
                  <span className="truncate text-[color:var(--color-text-tertiary)]">
                    {item.proof}
                  </span>
                </span>
                <span className="text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)]">
                  {item.cta}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function GraphProofRail({ model }: { model: GraphProofRailModel }) {
  const t = useTranslations("ontologyView.graphProof");
  const { show } = useToast();
  const preview = model.previewIntents.slice(0, 3);
  const operationPreview = model.operations.slice(0, 5);
  const primaryIntent = preview[0];
  const copyPack = async (text: string, successMessage: string) => {
    if (await copyText(text)) {
      show(successMessage, "success");
      return;
    }
    show(t("copyFailed"), "error");
  };

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mb-4 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-indigo-accent)]">
            <BarChart3 size={14} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <h2 className="mt-0.5 break-keep text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("title")}
            </h2>
            <p className="mt-1 max-w-2xl break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("body")}
            </p>
            <p className="mt-1.5 max-w-2xl break-keep font-mono text-[9.5px] leading-4 text-[color:var(--color-text-quaternary)]">
              {t("runtimeReplay")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void copyPack(model.queryPackText, t("copyMcpCopied"))}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t("copyMcpAria")}
          >
            <Clipboard size={12} aria-hidden />
            {t("copyMcp")}
          </button>
          <button
            type="button"
            onClick={() => void copyPack(model.cliPackText, t("copyCliCopied"))}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t("copyCliAria")}
          >
            <Clipboard size={12} aria-hidden />
            {t("copyCli")}
          </button>
          <button
            type="button"
            onClick={() => void copyPack(model.runtimeGateText, t("copyRuntimeGateCopied"))}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.06)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t("copyRuntimeGateAria")}
          >
            <Clipboard size={12} aria-hidden />
            {t("copyRuntimeGate")}
          </button>
          <button
            type="button"
            onClick={() => void copyPack(model.syncGateText, t("copySyncGateCopied"))}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.06)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t("copySyncGateAria")}
          >
            <Clipboard size={12} aria-hidden />
            {t("copySyncGate")}
          </button>
          <Link
            href="/ontology/insights/"
            className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t("ctaAria")}
          >
            {t("cta")}
          </Link>
        </div>
      </div>

      <div className="mt-2 grid gap-1.5 lg:grid-cols-[minmax(0,0.58fr)_minmax(0,1fr)_minmax(200px,0.34fr)]">
        <div className="grid min-w-0 grid-cols-4 gap-1.5">
          <GraphProofMetric label={t("intents")} value={model.intentCount} />
          <GraphProofMetric label={t("mcpCalls")} value={model.mcpCallCount} />
          <GraphProofMetric label={t("cliFallbacks")} value={model.cliFallbackCount} />
          <GraphProofMetric
            label={t("health")}
            value={t("runtimeChecksValue", { count: model.runtimeCheckCount })}
          />
        </div>
        {primaryIntent ? (
          <div className="min-w-0 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(0,0,0,0.10)] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("sampleIntent")}
            </p>
            <p
              className="mt-1 truncate font-mono text-[9px] leading-4 text-[color:var(--color-text-secondary)]"
              title={primaryIntent}
            >
              {primaryIntent}
            </p>
          </div>
        ) : null}
        {operationPreview.length > 0 ? (
          <div className="min-w-0 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("operations")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {operationPreview.map((operation) => (
                <span
                  key={operation}
                  className="rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.03)] px-1.5 py-0.5 font-mono text-[8.5px] text-[color:var(--color-text-tertiary)]"
                >
                  {operation}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GraphProofMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5">
      <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function TreeProjectionWarnings({ warnings }: { warnings: string[] }) {
  const t = useTranslations("ontologyView.treeWarnings");
  const preview = warnings.slice(0, 8);
  const hiddenCount = Math.max(0, warnings.length - preview.length);
  const summary = useMemo(
    () => summarizeTreeProjectionWarnings(warnings),
    [warnings],
  );

  return (
    <details
      id="tree-data-warnings"
      className="mt-4 rounded-lg border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.045)] px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(238,198,128,0.95)]">
            {t("eyebrow")}
          </span>
          <span className="mt-1 block break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("title", { count: warnings.length })}
          </span>
        </span>
        <span className="rounded-md border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.07)] px-2 py-1 font-mono text-[10px] text-[color:rgba(238,198,128,0.95)]">
          {t("badge")}
        </span>
      </summary>
      <p className="mt-3 max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
        {t("body")}
      </p>
      {summary.groups.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {summary.groups.map((group) => (
            <TreeProjectionWarningGroupChip key={group.kind} group={group} />
          ))}
        </div>
      ) : null}
      <ul className="mt-3 grid gap-1.5">
        {preview.map((warning) => (
          <li
            key={warning}
            className="break-all rounded-md border border-[color:rgba(255,179,71,0.16)] bg-[color:rgba(0,0,0,0.08)] px-2.5 py-1.5 font-mono text-[10px] text-[color:var(--color-text-secondary)]"
          >
            {warning}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          {t("hidden", { count: hiddenCount })}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/ontology/insights/"
          className="inline-flex h-8 items-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
        >
          {t("queryCta")}
        </Link>
        <Link
          href="/ontology/edit/"
          className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
        >
          {t("builderCta")}
        </Link>
      </div>
    </details>
  );
}

function TreeProjectionWarningGroupChip({
  group,
}: {
  group: TreeProjectionWarningGroup;
}) {
  const t = useTranslations("ontologyView.treeWarnings.groups");
  return (
    <div className="rounded-md border border-[color:rgba(255,179,71,0.16)] bg-[color:rgba(0,0,0,0.10)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t(`${group.kind}.label`)}
        </span>
        <span className="shrink-0 rounded border border-[color:rgba(255,179,71,0.22)] bg-[color:rgba(255,179,71,0.06)] px-1.5 font-mono text-[10px] text-[color:rgba(238,198,128,0.95)]">
          {group.count}
        </span>
      </div>
      <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        {t(`${group.kind}.hint`)}
      </p>
      {group.examples.length > 0 ? (
        <p className="mt-1 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
          {group.examples.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  href,
  onClick,
  hint,
  hintFull,
  className,
  ariaLabel,
  style,
}: {
  label: string;
  value: string;
  /** 강조 톤 — 0 이상의 신호가 있을 때만 사용. 기본 무채색. */
  accent?: "amber" | "indigo";
  /** truthy 면 카드 자체가 Link 로 렌더 — 사용자 행동 유도. */
  href?: string;
  /** href 없이 in-page 점프 / 토글 등 액션이 필요할 때. */
  onClick?: () => void;
  /** 라벨이 입문자에게 외계어인 경우 카드 내부에 1 줄 풀설명 (짧게 유지). */
  hint?: string;
  /** hint 가 길면 별도 풀설명을 호버 title 로 — 좁은 카드 wrap 회피. */
  hintFull?: string;
  /** grid 안에서 col-span 등 layout 변형. */
  className?: string;
  ariaLabel?: string;
  /** StaggeredFadeIn 등 composition 컨테이너가 주입하는 inline style 전달. */
  style?: React.CSSProperties;
}) {
  const accentClass =
    accent === "amber"
      ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
      : accent === "indigo"
        ? "border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)]"
        : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]";
  const labelClass =
    accent === "amber"
      ? "text-[color:rgba(238,198,128,0.95)]"
      : "text-[color:var(--color-text-quaternary)]";
  const body = (
    <>
      <p className={`font-mono text-[9px] uppercase tracking-[0.14em] ${labelClass}`}>
        {label}
      </p>
      <p className="mt-1.5 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {value}
      </p>
      {hint ? (
        <p
          className="mt-1.5 break-keep text-[10px] leading-snug text-[color:var(--color-text-tertiary)]"
          title={hintFull ?? hint}
        >
          {hint}
        </p>
      ) : null}
    </>
  );
  const wrapperClass = `rounded-xl border px-4 py-3 ${accentClass}${className ? ` ${className}` : ""}`;
  if (href) {
    return (
      <Link
        href={href}
        style={style}
        className={`${wrapperClass} block transition-colors hover:border-[color:rgba(94,106,210,0.32)]`}
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={style}
        className={`${wrapperClass} block w-full text-left transition-colors hover:border-[color:rgba(94,106,210,0.32)]`}
      >
        {body}
      </button>
    );
  }
  return <div className={wrapperClass} style={style}>{body}</div>;
}
