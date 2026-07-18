"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Check, ChevronRight, Clipboard, Flag, GitBranch, Link2, MoreHorizontal, Network, PencilLine, Search, X } from "lucide-react";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyNodeHref,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { FullDetailA1, buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
import {
  acknowledgeChangeNode,
  buildOntologyTree,
  buildMeaningfulOntologyStats,
  clearChangeBaseline,
  computeOntologyChangeset,
  computeOntologyDependents,
  filterTreeByNodeIds,
  countTreeNodes,
  isContainmentRelation,
  markChangeBaseline,
  useChangeBaseline,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { OntologyChangePanel } from "./parts/OntologyChangePanel";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { GlobalSearch, MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { OntologyTreeView } from "@/widgets/ontology-tree-view";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useOntologyInsight } from "@/features/vault-ontology";
import { OperationsNav } from "@/widgets/operations-nav";
import { Tooltip } from "@/shared/ui";
import {
  BUSINESS_ONTOLOGY_READ_ORDER_PROOF,
  DEFAULT_BUSINESS_ONTOLOGY_LENS,
  type BusinessOntologyLens,
  type BusinessOntologyLensStep,
} from "@/shared/lib/business-ontology-lens";
import { resolveReachabilityQuerySlug } from "../lib/reachability-copy";
import { formatQueryOntologyCall as mcpCall } from "@/shared/lib/ontology-query-call";
import {
  computeDeeplinkNotFoundNotice,
  resolveOntologyDeeplinkNode,
} from "../lib/resolve-deeplink-node";
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

  const { insight, error } = useOntologyInsight();
  // 트리 row 클릭 시 우측 (mobile bottom) 패널에 노드 상세 노출.
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  // 글로벌 검색 — ⌘K / Ctrl+K 로 토글, 결과 선택 시 selectedNode 로 점프 / 문서 라우트로 점프.
  const [searchOpen, setSearchOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [treeWarningsDialogOpen, setTreeWarningsDialogOpen] = useState(false);
  const [treeWarningsActiveTab, setTreeWarningsActiveTab] = useState<"summary" | "raw">("summary");
  // B2 — "변경점만 보기": 트리를 baseline 대비 added|changed 노드 + 조상 경로로 스코프.
  const [changesOnly, setChangesOnly] = useState(false);
  // setSelectedNode + URL ?node=<id> 동기화를 한 함수로.
  // 트리 / 검색 / neighbor 클릭 / 패널 닫기 모든 진입에서 같은 흐름.
  // history 안 쌓이게 router.replace 사용 (매 노드 클릭마다 뒤로가기 한 단계 X).
  const selectNode = useCallback((next: KnowledgeGraphNode | null) => {
    setSelectedNode(next);
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
  useEffect(() => {
    if (!workbenchOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkbenchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workbenchOpen]);

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
  //
  // agent-handoff 딥링크가 안 풀리면 (bare slug 오타 / 삭제된 노드) 예전엔
  // 아무 신호 없이 기본 empty state 만 보여 조용히 끊겼다 (silent no-op).
  // deeplinkNotFoundId 가 그 실패를 눈에 보이는 notice 로 바꾼다.
  const deeplinkNodeId = searchParams.get("node");
  const [deeplinkNotFoundId, setDeeplinkNotFoundId] = useState<string | null>(null);
  useEffect(() => {
    if (!insight) return;
    let cancelled = false;
    if (!deeplinkNodeId) {
      window.queueMicrotask(() => {
        if (cancelled) return;
        setDeeplinkNotFoundId(null);
        if (selectedNode) setSelectedNode(null);
      });
      return () => {
        cancelled = true;
      };
    }
    if (selectedNode?.id === deeplinkNodeId) {
      window.queueMicrotask(() => {
        if (!cancelled) setDeeplinkNotFoundId(null);
      });
      return () => {
        cancelled = true;
      };
    }
    const found = resolveOntologyDeeplinkNode(deeplinkNodeId, insight.nodes);
    const notice = computeDeeplinkNotFoundNotice(deeplinkNodeId, selectedNode?.id ?? null, found);
    window.queueMicrotask(() => {
      if (cancelled) return;
      setDeeplinkNotFoundId(notice);
      if (found) setSelectedNode(found);
    });
    return () => {
      cancelled = true;
    };
  }, [deeplinkNodeId, insight, selectedNode]);


  const treeResult: OntologyTreeBuildResult | null = useMemo(() => {
    if (!insight) return null;
    return buildOntologyTree(insight.nodes, insight.edges);
  }, [insight]);

  // 변경점(changeset) — 세션 baseline 스냅샷 대비 added/changed/removed. baseline
  // 은 공유 스토어(useChangeBaseline) 라 /topology 등 다른 surface 와 같은 기준을
  // 본다. 안 찍으면 빈 changeset. 회의·설계 리뷰에서 "지금까지 뭐 바뀌었나" 시각화.
  const changeBaseline = useChangeBaseline();
  const ontologyChangeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );
  // 변경점 blast-radius (Self-Drawing Diff #2) — added|changed 노드별 "의존자 수"
  // (이걸 바꾸면 N개가 영향). 토폴로지 drawer 와 *같은* computeOntologyDependents 라
  // 같은 수(can't drift). 변경(touched)이 있을 때만 계산 → 깨끗한 vault 0 비용.
  const dependentsByNode = useMemo(() => {
    const map = new Map<string, number>();
    if (!insight || ontologyChangeset.touchedNodeIds.size === 0) return map;
    for (const id of ontologyChangeset.touchedNodeIds) {
      map.set(id, computeOntologyDependents(id, insight.nodes, insight.edges));
    }
    return map;
  }, [insight, ontologyChangeset]);
  const nodeById = useMemo(() => {
    const map = new Map<string, KnowledgeGraphNode>();
    if (insight) for (const n of insight.nodes) map.set(n.id, n);
    return map;
  }, [insight]);
  const handleMarkChangeBaseline = useCallback(() => {
    if (!insight) return;
    markChangeBaseline(insight.nodes, insight.edges, Date.now());
  }, [insight]);
  // 변경 한 건을 "리뷰함" 으로 — 그 노드만 baseline advance(per-node). 같은
  // nodes/edges 로 호출해 다른 surface(토폴로지 pulse)와 일관.
  const handleAcknowledgeNode = useCallback(
    (id: string) => {
      if (!insight) return;
      acknowledgeChangeNode(id, insight.nodes, insight.edges);
    },
    [insight],
  );

  // "변경점만" 토글은 baseline 이 있고 트리에 보이는 변경(added|changed)이 있을 때만
  // 실효 — 그 외에는 토글이 켜져 있어도 전체 트리를 보여준다 (빈 트리 회피).
  const changesOnlyActive =
    changesOnly && changeBaseline !== null && ontologyChangeset.touchedNodeIds.size > 0;
  // 트리 표시본: 스코프 활성 시 변경 노드 + 조상 경로만. count strip / 빈상태
  // onboarding / warning 은 원본 treeResult 기준 유지 (전체 그래프 사실 보존).
  const displayTreeResult: OntologyTreeBuildResult | null = useMemo(() => {
    if (!treeResult) return null;
    if (!changesOnlyActive) return treeResult;
    return {
      roots: filterTreeByNodeIds(treeResult.roots, ontologyChangeset.touchedNodeIds),
      orphans: treeResult.orphans.filter((o) => ontologyChangeset.touchedNodeIds.has(o.id)),
      warnings: [],
    };
  }, [treeResult, changesOnlyActive, ontologyChangeset]);

  // treeResult / insight 가 동일할 때 매 selection re-render 마다 재계산
  // 회피. countTreeNodes 는 트리 walk + filter 는 O(N) — 작아도 매 클릭마다
  // 도는 건 낭비.
  const treeRowCount = useMemo(
    () => (treeResult ? countTreeNodes(treeResult.roots) : 0),
    [treeResult],
  );
  const meaningfulStats = useMemo(
    () => buildMeaningfulOntologyStats(insight?.nodes ?? []),
    [insight],
  );
  const sourceKindCounts = insight?.sourceKindCounts;
  const coreDomainLanes = useMemo(
    () => (insight ? buildOntologyMeaningDomainLanes(insight.nodes, insight.edges) : []),
    [insight],
  );

  // A1 "데이터시트 확장판" 전체 상세 — NodeDetailPanel(배지 수프 + reach
  // 쿼리빌더 + Meaning/Connections/checks 사이드바)을 대체. groups/reach 는
  // topology 의 full-detail-a1 진입점과 같은 순수 함수 소스라 두 entry point
  // (/topology "전체 상세" · /ontology 노드 클릭)의 숫자가 절대 drift 하지 않는다.
  const fullDetailA1Model = useMemo(() => {
    if (!insight || !selectedNode) return null;
    const groups = buildFullDetailGroups(
      selectedNode.id,
      insight.nodes,
      insight.edges,
      ontologyChangeset.touchedNodeIds,
    );
    const reach = buildFullDetailReachModel(selectedNode.id, insight.nodes, insight.edges);
    const projectTitle =
      insight.nodes.find((n) => n.kind === "project")?.title ?? null;
    return {
      node: {
        id: selectedNode.id,
        title: selectedNode.title,
        kind: selectedNode.kind,
        slug: selectedNode.evidenceIds[0] ?? selectedNode.id,
        fresh: ontologyChangeset.touchedNodeIds.has(selectedNode.id),
      },
      groups,
      reach,
      breadcrumb: {
        projectTitle,
        totalConcepts: insight.nodes.length,
        totalRelations: insight.edges.length,
      },
      bodyMarkdown: selectedNode.summary ?? null,
      documentHref: selectedNode.evidenceIds[0]
        ? buildDocsVaultHref({ slug: selectedNode.evidenceIds[0] })
        : null,
    };
  }, [insight, selectedNode, ontologyChangeset]);
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
    const containmentRelations = insight.edges.filter((edge) =>
      isContainmentRelation(edge.type),
    ).length;
    return {
      semanticRelations: Math.max(insight.edges.length - containmentRelations, 0),
      containmentRelations,
    };
  }, [insight]);

  const showChangeReviewPanel = Boolean(insight) && ontologyChangeset.total > 0;
  const compactChangeLabel = !changeBaseline
    ? t("changes.mark")
    : ontologyChangeset.total === 0
      ? t("changes.none")
      : t("changes.summary", {
          added: ontologyChangeset.addedNodes.length,
          changed: ontologyChangeset.changedNodes.length,
          removed: ontologyChangeset.removedNodes.length,
        });


  return (
    <>
      {/* OperationsNav 는 풀폭으로 (본문 max-w 안에 갇히면 좌우 여백 과대로
          가운데 몰려 보이는 회귀 회피). 'ontology surface' 인 / 와 /ontology*
          에선 OperationsNav 가 SubNav 행을 inline 으로 함께 렌더. */}
      <OperationsNav />
      <main id="main" className="mx-auto w-full max-w-5xl overflow-hidden px-5 py-6 md:px-8 md:py-8">
      <section className={showChangeReviewPanel ? "mb-2" : "mb-3"}>
        <h1 className="sr-only">{t('title')}</h1>
        <div
          className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 px-0 py-1"
          data-testid="ontology-command-bar"
        >
          <OntologyCommandBarHeader
          />
          {/* 모바일에서도 Browse / Write / Query 액션 라벨을 숨기지 않는다.
              이 row 는 시작 허브라 가로 스크롤보다 줄바꿈이 더 읽기 쉽다. */}
          <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end">
            {/* Add Node 는 '빌더' CTA 와 destination 동일 → 중복 제거.
                인사이트 / 관계 pill 도 OntologySubNav 가 항상 노출하므로 제거. */}
            <Tooltip content={t('actions.searchTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t('actions.searchAria')}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:bg-[color:rgba(94,106,210,0.12)]"
              >
                <Search size={12} aria-hidden />
                <span>{t('actions.search')}</span>
                <kbd className="hidden font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline" aria-hidden>⌘K</kbd>
              </button>
            </Tooltip>
            <Tooltip content={t('actions.queryTooltip')} withProvider={false}>
              <Link
                href={queryHref}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                aria-label={t('actions.queryAria')}
              >
                <BarChart3 size={12} aria-hidden />
                <span>{t('actions.query')}</span>
              </Link>
            </Tooltip>
            <details
              className="group relative"
              data-testid="ontology-secondary-actions"
            >
              <summary className="inline-flex h-8 shrink-0 cursor-pointer list-none items-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
                <MoreHorizontal size={12} aria-hidden />
                <span>{t('actions.more')}</span>
              </summary>
              <div className="absolute right-0 top-9 z-20 grid min-w-[13rem] gap-1 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
                <Tooltip content={t('actions.globalSearchTooltip')} withProvider={false}>
                  <button
                    type="button"
                    onClick={() => setGlobalSearchOpen(true)}
                    aria-label={`${t('actions.globalSearch')} — ${t('actions.globalSearchAria')}`}
                    className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <Network size={12} aria-hidden />
                    <span className="truncate">{t('actions.globalSearch')}</span>
                    <kbd className="ml-auto hidden shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline" aria-hidden>⇧⌘K</kbd>
                  </button>
                </Tooltip>
                <Tooltip content={t('actions.builderTooltip')} withProvider={false}>
                  <Link
                    href={builderHref}
                    className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    aria-label={`${t('actions.builder')} — ${t('actions.builderAria')}`}
                  >
                    <PencilLine size={12} aria-hidden />
                    <span className="truncate">{t('actions.builder')}</span>
                  </Link>
                </Tooltip>
                <Tooltip content={t('actions.workbenchOverviewTooltip')} withProvider={false}>
                  <button
                    type="button"
                    onClick={() => setWorkbenchOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={workbenchOpen}
                    aria-controls="ontology-workbench-overview"
                    className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <GitBranch size={12} aria-hidden />
                    <span className="truncate">{t('actions.workbenchOverview')}</span>
                  </button>
                </Tooltip>
                <Tooltip content={changeBaseline ? t('changes.remark') : t('changes.emptyCompactHint')} withProvider={false}>
                  <button
                    type="button"
                    onClick={handleMarkChangeBaseline}
                    data-testid="mark-baseline-compact"
                    className={
                      changeBaseline
                        ? "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.10)]"
                        : "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    }
                  >
                    <Flag size={12} aria-hidden />
                    <span className="truncate">{compactChangeLabel}</span>
                  </button>
                </Tooltip>
              </div>
            </details>
          </div>
        </div>
      </section>

      <DeeplinkNotFoundNotice query={deeplinkNotFoundId} />

      {showChangeReviewPanel ? (
        <div className="mb-3">
          <OntologyChangePanel
            changeset={ontologyChangeset}
            hasBaseline={changeBaseline !== null}
            nodeById={nodeById}
            onMarkBaseline={handleMarkChangeBaseline}
            onClearBaseline={() => {
              clearChangeBaseline();
              setChangesOnly(false);
            }}
            onSelectNode={(node) => selectNode(node)}
            onAcknowledgeNode={handleAcknowledgeNode}
            dependentsByNode={dependentsByNode}
            changesOnly={changesOnly}
            onToggleChangesOnly={() => setChangesOnly((v) => !v)}
          />
        </div>
      ) : null}

      <div
        aria-hidden={!workbenchOpen}
        className={
          workbenchOpen
            ? "fixed inset-0 z-40 bg-[color:rgba(0,0,0,0.38)] px-4 py-16"
            : "hidden"
        }
        onClick={() => setWorkbenchOpen(false)}
      >
        <div
          id="ontology-workbench-overview"
          role="dialog"
          aria-modal="true"
          aria-label={t('workbench.ariaLabel')}
          className="mx-auto max-w-5xl rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 shadow-[0_28px_84px_rgba(0,0,0,0.52)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t('workbench.dialogEyebrow')}
              </p>
              <h2 className="mt-0.5 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t('workbench.dialogTitle')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setWorkbenchOpen(false)}
              aria-label={t('workbench.dialogClose')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.36)] hover:text-[color:var(--color-text-primary)]"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <GraphWorkbenchSummary
            treeNodes={treeRowCount}
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
        </div>
      </div>

      <OntologyStatusStrip
        warningCount={treeResult?.warnings.length ?? 0}
        onOpenWarnings={() => {
          setTreeWarningsActiveTab("summary");
          setTreeWarningsDialogOpen(true);
        }}
      />

      {!showChangeReviewPanel ? (
        <OntologyMeaningGateStrip
          domainCount={sourceKindCounts?.domain ?? meaningfulStats.byKind.domain}
          capabilityCount={sourceKindCounts?.capability ?? meaningfulStats.byKind.capability}
          elementCount={sourceKindCounts?.element ?? meaningfulStats.byKind.element}
          relationCount={workbenchStats.semanticRelations}
          coreDomains={coreDomainLanes}
        />
      ) : null}

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
          {changesOnlyActive ? (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.06)] px-3 py-2"
              data-testid="changes-only-banner"
              role="status"
            >
              <p className="font-mono text-[11px] text-[color:var(--color-indigo-accent)]">
                {t('changes.scopedHint', { count: ontologyChangeset.touchedNodeIds.size })}
              </p>
              <button
                type="button"
                onClick={() => setChangesOnly(false)}
                className="inline-flex h-7 shrink-0 items-center rounded-full px-2 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
              >
                {t('changes.scopedShowAll')}
              </button>
            </div>
          ) : null}
          <OntologyTreeView
            result={displayTreeResult ?? treeResult}
            collapseDomainsByDefault
            onSelect={(node) => selectNode(node)}
            emptyHint={changesOnlyActive ? t('changes.scopedEmpty') : t('emptyHint')}
            selectedId={selectedNode?.id ?? null}
            changedNodeIds={changeBaseline !== null ? ontologyChangeset.touchedNodeIds : undefined}
            showWarnings={false}
          />
          {treeResult.warnings.length > 0 ? (
            <TreeProjectionWarnings
              warnings={treeResult.warnings}
              open={treeWarningsDialogOpen}
              activeTab={treeWarningsActiveTab}
              onOpenSummary={() => {
                setTreeWarningsActiveTab("summary");
                setTreeWarningsDialogOpen(true);
              }}
              onClose={() => setTreeWarningsDialogOpen(false)}
              onTabChange={setTreeWarningsActiveTab}
            />
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

      {selectedNode && fullDetailA1Model ? (
        <div
          data-testid="ontology-full-detail-a1-positioner"
          className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--color-canvas)]"
        >
          <FullDetailA1
            key={selectedNode.id}
            node={fullDetailA1Model.node}
            groups={fullDetailA1Model.groups}
            reach={fullDetailA1Model.reach}
            breadcrumb={fullDetailA1Model.breadcrumb}
            bodyMarkdown={fullDetailA1Model.bodyMarkdown}
            documentHref={fullDetailA1Model.documentHref}
            onSelectNode={(id) => {
              const neighbor = insight?.nodes.find((candidate) => candidate.id === id);
              if (neighbor) selectNode(neighbor);
            }}
            onClose={() => selectNode(null)}
          />
        </div>
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
        mode={dataSourceMode}
      />
      </main>
    </>
  );
}

/**
 * `?node=<id>` 딥링크가 해석 안 됐을 때의 visible notice — 예전엔 이 경우
 * 아무 신호 없이 기본 empty state 만 보여 agent-handoff 딥링크가 조용히
 * 끊겼다 (fable sigma-surfaces 리뷰 #3). `query` 가 null 이면 아무것도
 * 그리지 않는다 (정상 상태 — 딥링크 없음 / 이미 풀림).
 */
export function DeeplinkNotFoundNotice({ query }: { query: string | null }) {
  const t = useTranslations('ontologyView');
  if (!query) return null;
  return (
    <div
      role="status"
      data-testid="ontology-deeplink-not-found"
      className="mb-3 rounded-md border border-[color:rgba(255,179,71,0.28)] bg-[color:rgba(255,179,71,0.06)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]"
    >
      {t('deeplinkNotFound', { query })}
    </div>
  );
}

export function OntologyCommandBarHeader() {
  const t = useTranslations('ontologyView');

  return (
    <div
      className="topology-ui-scale flex min-w-[13rem] flex-1 items-center gap-2 text-[11px] text-[color:var(--color-text-tertiary)]"
    >
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] px-2 font-mono uppercase tracking-[0.10em] text-[color:var(--color-indigo-accent)]">
        <GitBranch size={12} aria-hidden />
        {t('eyebrow')}
      </span>
      <p className="min-w-0 truncate text-[12px] font-medium text-[color:var(--color-text-secondary)]">
        {t('topIntent.title')}
      </p>
    </div>
  );
}

/**
 * /ontology 페이지 하단 영구 footer — 노드/엣지 count + 현재 운영 모드를
 * 한 줄로 노출해 사용자에게 \"지금 보고 있는 ontology 가 어느 source 인지\"
 * (vault vs dogfood) 알려준다.
 */
export function OntologyMetaFooter({
  mode,
}: {
  mode: 'static' | 'local';
}) {
  const t = useTranslations('ontologyView.footer');
  const modeLabel = mode === 'local' ? t('modeLocal') : t('modeStatic');

  return (
    <footer
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-[11px] text-[color:var(--color-text-quaternary)]"
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
      >
        {t('modePrefix')}: {modeLabel}
      </span>
    </footer>
  );
}


export interface OntologyMeaningDomainLane {
  id: string;
  title: string;
  capabilityCount: number;
}

export function buildOntologyMeaningDomainLanes(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  limit = 4,
): OntologyMeaningDomainLane[] {
  const domains = nodes.filter((node) => node.kind === "domain");
  const capabilityIds = new Set(
    nodes.filter((node) => node.kind === "capability").map((node) => node.id),
  );
  const capabilityCountByDomain = new Map<string, number>();

  for (const edge of edges) {
    if (edge.type !== "contains") continue;
    if (!capabilityIds.has(edge.to)) continue;
    capabilityCountByDomain.set(edge.from, (capabilityCountByDomain.get(edge.from) ?? 0) + 1);
  }

  return domains
    .map((domain) => ({
      id: domain.id,
      title: domain.title,
      capabilityCount: capabilityCountByDomain.get(domain.id) ?? 0,
    }))
    .filter((lane) => lane.capabilityCount > 0)
    .sort((a, b) => b.capabilityCount - a.capabilityCount || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function appendQueryParam(href: string, key: string, value: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function OntologyStatusStrip({
  warningCount,
  onOpenWarnings,
}: {
  warningCount: number;
  onOpenWarnings: () => void;
}) {
  const t = useTranslations("ontologyView");

  if (warningCount <= 0) return null;

  return (
    <section
      aria-label={t("stat.ariaLabel")}
      className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-y border-[color:var(--color-divider)] py-1.5 text-[11px] text-[color:var(--color-text-tertiary)]"
    >
      <button
        type="button"
        aria-label={t("stat.warningsAria", { count: warningCount })}
        onClick={onOpenWarnings}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
      >
        <Link2 size={11} aria-hidden />
        <span>{t("stat.warnings")}</span>
        <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
          {t("stat.warningsValue", { count: warningCount })}
        </span>
      </button>
    </section>
  );
}

export function OntologyMeaningGateStrip({
  domainCount,
  capabilityCount,
  elementCount,
  relationCount,
  coreDomains = [],
  businessLens = DEFAULT_BUSINESS_ONTOLOGY_LENS,
}: {
  domainCount: number;
  capabilityCount: number;
  elementCount: number;
  relationCount: number;
  coreDomains?: OntologyMeaningDomainLane[];
  businessLens?: BusinessOntologyLens;
}) {
  const t = useTranslations("ontologyView.meaningGate");
  const { state, copy } = useCopyFeedback(1500);
  const copied = state === "copied";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copyDescriptionId = "ontology-meaning-gate-copy-description";
  const laneByStep: Record<BusinessOntologyLensStep, {
    label: string;
    value: string;
    body: string;
  }> = {
    outcome: {
      label: t("outcomeLabel"),
      value: t("outcomeValue"),
      body: t("outcomeBody"),
    },
    domain: {
      label: t("businessLabel"),
      value: t("businessValue", { count: domainCount }),
      body: t("businessBody"),
    },
    capability: {
      label: t("capabilityLabel"),
      value: t("capabilityValue", { count: capabilityCount }),
      body: t("capabilityBody"),
    },
    element: {
      label: t("evidenceLabel"),
      value: t("evidenceValue", { elements: elementCount, relations: relationCount }),
      body: t("evidenceBody"),
    },
  };
  const lanes = businessLens.readOrder.map((step) => laneByStep[step]);
  const readerLanes = [
    {
      label: t("readerLanePlanningLabel"),
      body: t("readerLanePlanningBody"),
      href: appendQueryParam(
        coreDomains[0] ? buildOntologyNodeHref(coreDomains[0].id) : "/ontology/",
        "reader",
        "planning",
      ),
    },
    {
      label: t("readerLaneMarketingLabel"),
      body: t("readerLaneMarketingBody"),
      href: appendQueryParam("/ontology/insights/", "reader", "marketing"),
    },
    {
      label: t("readerLaneLeadershipLabel"),
      body: t("readerLaneLeadershipBody"),
      href: appendQueryParam("/ontology/insights/", "reader", "leadership"),
    },
    {
      label: t("readerLaneDeveloperLabel"),
      body: t("readerLaneDeveloperBody"),
      href: appendQueryParam("/ontology/edit/", "reader", "developer"),
    },
    {
      label: t("readerLaneAgentLabel"),
      body: t("readerLaneAgentBody"),
      href: appendQueryParam("/ontology/insights/", "reader", "agent"),
    },
  ];
  const readerLaneSummary = readerLanes
    .map((lane) => t("readerLaneSummaryItem", lane))
    .join("; ");
  const readerHandoffSummary = readerLanes
    .map((lane) => `${lane.label} → ${lane.href}`)
    .join("; ");
  const decisionQuestions = [
    {
      key: "outcome",
      question: t("decisionQuestionOutcome"),
      mcp: mcpCall({ operation: "facets" }),
      cliFallback: "ontology-atlas facets docs/ontology",
    },
    {
      key: "boundary",
      question: t("decisionQuestionOwner"),
      mcp: mcpCall({ operation: "match_nodes", kind: "domain", limit: 10 }),
      cliFallback: "ontology-atlas match-nodes docs/ontology --kind domain --limit 10",
    },
    {
      key: "claim",
      question: t("decisionQuestionClaim"),
      mcp: mcpCall({ operation: "domain_matrix" }),
      cliFallback: "ontology-atlas domain-matrix docs/ontology",
    },
    {
      key: "evidence",
      question: t("decisionQuestionEvidence"),
      mcp: mcpCall({ operation: "match_edges", limit: 10 }),
      cliFallback: "ontology-atlas match-edges docs/ontology --limit 10",
    },
  ];
  const businessGraphDbPack = [
    {
      key: "facets",
      label: t("businessGraphDbFacetsLabel"),
      slug: "facets",
      value: "facets",
      body: t("businessGraphDbFacetsBody"),
      evidence: t("businessGraphDbFacetsEvidence"),
      mcp: mcpCall({ operation: "facets" }),
      cliFallback: "ontology-atlas facets docs/ontology",
    },
    {
      key: "domain_matrix",
      label: t("businessGraphDbCouplingLabel"),
      slug: "coupling",
      value: "domain_matrix",
      body: t("businessGraphDbCouplingBody"),
      evidence: t("businessGraphDbCouplingEvidence"),
      mcp: mcpCall({ operation: "domain_matrix" }),
      cliFallback: "ontology-atlas domain-matrix docs/ontology",
    },
    {
      key: "query_plan:all_paths",
      label: t("businessGraphDbPathLabel"),
      slug: "path",
      value: "query_plan → all_paths",
      body: t("businessGraphDbPathBody"),
      evidence: t("businessGraphDbPathEvidence"),
      mcp: `${mcpCall({ operation: "query_plan", targetOperation: "all_paths" })} → ${mcpCall({
        operation: "all_paths",
        limit: 5,
      })}`,
      cliFallback: "ontology-atlas all-paths docs/ontology --plan --limit 5",
    },
  ];
  const agentHandoffChecks = [
    mcpCall({ operation: "agent_brief" }),
    mcpCall({ operation: "workspace_brief" }),
    mcpCall({ operation: "health" }),
  ];
  const coreDomainSummary =
    coreDomains.length > 0
      ? coreDomains
          .map((domain) =>
            t("coreDomainSummaryItem", {
              title: domain.title,
              count: domain.capabilityCount,
            }),
          )
          .join(", ")
      : t("coreDomainsEmpty");
  const brief = [
    "# Ontology Atlas business-to-code brief",
    "",
    `- Audience: ${t("briefAudience")}`,
    `- Ontology read order: ${businessLens.readOrder.join(" → ")}`,
    `- Business outcome: ${lanes[0].value}`,
    `- Business language: ${lanes[1].value}`,
    `- Product capability: ${lanes[2].value}`,
    `- Implementation proof: ${lanes[3].value}`,
    `- Lens guardrail: ${businessLens.guidance[1]}`,
    `- Core domain lanes: ${coreDomainSummary}`,
    `- Reader lanes: ${readerLaneSummary}`,
    `- Reader handoffs: ${readerHandoffSummary}`,
    "",
    "## Business evidence gate",
    "1. Report meaningGate.businessOntology.evidence rows before treating source folders as capabilities.",
    "2. Report meaningGate.implementationEvidence.reviewRequiredRows for source folders that still need product meaning.",
    "3. Keep paths, APIs, routes, and commands as implementation evidence until a domain/capability owner is clear.",
    "",
    "## Business decision questions",
    ...decisionQuestions.map(({ question }, index) => `${index + 1}. ${question}`),
    "",
    "## Business graph DB query pack",
    ...businessGraphDbPack.map(
      (query, index) =>
        `${index + 1}. ${query.label} — ${query.mcp} — ${query.cliFallback} — ${query.evidence}`,
    ),
    "",
    "## How to use this graph",
    `1. ${t("briefStepVocabulary")}`,
    `2. ${t("briefStepTrace")}`,
    `3. ${t("briefStepAgent")}`,
    "",
    "## Agent handoff checks",
    ...agentHandoffChecks.map((check, index) => `${index + 1}. ${check}`),
    "",
    "CLI fallback:",
    "- ontology-atlas agent-brief docs/ontology --json",
    "- ontology-atlas health docs/ontology",
  ].join("\n");

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="ontology-meaning-gate"
      className="mb-3 border-b border-[color:var(--color-divider)] pb-2.5"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[14px] font-[var(--font-weight-signature)] leading-5 text-[color:var(--color-text-primary)]">
            {t("title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void copy(brief)}
          aria-describedby={copyDescriptionId}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] data-[copied=true]:border-[color:rgba(94,106,210,0.40)] data-[copied=true]:text-[color:var(--color-indigo-accent)]"
          data-copied={copied}
          aria-label={copied ? t("copyBriefCopied") : t("copyBrief")}
        >
          {copied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
          {copied ? t("copyBriefCopied") : t("copyBrief")}
        </button>
        <span id={copyDescriptionId} className="sr-only">
          {t("copyBriefDescription")}
        </span>
      </div>
      {coreDomains.length > 0 ? (
        <div className="mt-2 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
          <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t("coreDomainsLabel")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {coreDomains.map((domain) => (
              <Link
                key={domain.id}
                href={buildOntologyNodeHref(domain.id)}
                aria-label={`${domain.title} ${t("coreDomainCapabilityCount", { count: domain.capabilityCount })}`}
                className="inline-flex min-w-0 items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] px-2 py-1 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)]"
              >
                <span className="max-w-[12rem] truncate text-[color:var(--color-text-secondary)]">
                  {domain.title}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                  {t("coreDomainCapabilityCount", { count: domain.capabilityCount })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[color:var(--color-divider)] pt-2">
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="ontology-meaning-gate-details"
          onClick={() => setDetailsOpen((current) => !current)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)]"
        >
          <ChevronRight
            size={12}
            aria-hidden
            className={detailsOpen ? "rotate-90 transition-transform" : "transition-transform"}
          />
          {detailsOpen ? t("detailsHide") : t("detailsShow")}
        </button>
      </div>
      {detailsOpen ? (
        <div id="ontology-meaning-gate-details">
        <ol
          id="ontology-meaning-gate-read-order"
          className="mt-2 overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.08)]"
          aria-label={t("stepsLabel")}
          data-business-lens-policy={businessLens.policy}
          data-business-read-order={BUSINESS_ONTOLOGY_READ_ORDER_PROOF}
        >
          {lanes.map((lane, index) => (
            <li
              key={lane.label}
              className="flex min-w-0 gap-2 border-t border-[color:var(--color-divider)] px-2.5 py-2 first:border-t-0"
              title={lane.body}
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] text-[10px] text-[color:var(--color-text-quaternary)]">
                  {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-[color:var(--color-text-secondary)]">
                    {lane.label}
                  </span>
                  <span className="rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-indigo-accent)]">
                    {lane.value}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
                  {lane.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
          <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
            <Link
              href="/ontology/insights/"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)]"
            >
              <BarChart3 size={12} aria-hidden />
              {t("detailsInsightsLink")}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
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
      className="mb-0"
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
      <div className="grid gap-1.5">
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
                  ? "group grid min-w-0 gap-2 rounded-lg border border-[color:rgba(94,106,210,0.42)] bg-[color:rgba(94,106,210,0.08)] px-3 py-2.5 transition-colors hover:border-[color:rgba(94,106,210,0.52)] md:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.4fr)_minmax(180px,0.9fr)] md:items-center"
                  : "group grid min-w-0 gap-2 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-2.5 transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.07)] md:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.4fr)_minmax(180px,0.9fr)] md:items-center"
              }
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:rgba(94,106,210,0.38)] group-hover:text-[color:var(--color-indigo-accent)]">
                  <Icon size={14} aria-hidden />
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
              <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                {item.body}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
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
              <p className="sr-only">{item.loopAction}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function TreeProjectionWarnings({
  warnings,
  open,
  activeTab,
  onOpenSummary,
  onClose,
  onTabChange,
}: {
  warnings: string[];
  open: boolean;
  activeTab: "summary" | "raw";
  onOpenSummary: () => void;
  onClose: () => void;
  onTabChange: (tab: "summary" | "raw") => void;
}) {
  const t = useTranslations("ontologyView.treeWarnings");
  const summary = useMemo(
    () => summarizeTreeProjectionWarnings(warnings),
    [warnings],
  );
  const preview = warnings.slice(0, 3);
  const hiddenCount = Math.max(0, warnings.length - preview.length);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <section
      id="tree-data-warnings"
      className="mt-3 scroll-mt-24"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onOpenSummary}
            aria-label={t("compactCta", { count: warnings.length })}
            title={t("openAria", { count: warnings.length })}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            <Search size={12} aria-hidden />
            {t("compactCta", { count: warnings.length })}
          </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(0,0,0,0.58)] px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tree-data-warnings-title"
            aria-describedby="tree-data-warnings-description"
            className="flex max-h-[min(82vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color:rgba(255,179,71,0.22)] bg-[color:var(--color-panel)] shadow-[0_24px_80px_rgba(0,0,0,0.58)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-divider)] px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(238,198,128,0.95)]">
                  {t("dialogEyebrow")}
                </p>
                <h2
                  id="tree-data-warnings-title"
                  className="mt-1 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                >
                  {t("dialogTitle", { count: warnings.length })}
                </h2>
                <p
                  id="tree-data-warnings-description"
                  className="mt-1 max-w-2xl break-keep text-xs leading-5 text-[color:var(--color-text-tertiary)]"
                >
                  {t("dialogDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,179,71,0.34)] focus-visible:ring-inset"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="border-b border-[color:var(--color-divider)] px-5 py-3">
              <div
                role="tablist"
                aria-label={t("tabs.ariaLabel")}
                className="inline-flex rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-1"
              >
                {(["summary", "raw"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => onTabChange(tab)}
                    className={
                      activeTab === tab
                        ? "h-8 rounded-md bg-[color:rgba(255,179,71,0.12)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:rgba(238,198,128,0.95)]"
                        : "h-8 rounded-md px-3 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                    }
                  >
                    {t(`tabs.${tab}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {activeTab === "summary" ? (
                <div className="grid min-w-0 gap-4">
                  <p className="max-w-2xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("body")}
                  </p>
                  {summary.groups.length > 0 ? (
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      {summary.groups.map((group) => (
                        <TreeProjectionWarningGroupChip key={group.kind} group={group} />
                      ))}
                    </div>
                  ) : null}
                  {hiddenCount > 0 ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {t("hidden", { count: hiddenCount })}
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    <Link
                      href="/ontology/insights/"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <BarChart3 size={12} aria-hidden />
                      {t("queryCta")}
                    </Link>
                    <Link
                      href="/ontology/edit/"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <PencilLine size={12} aria-hidden />
                      {t("builderCta")}
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-3 break-keep text-xs leading-5 text-[color:var(--color-text-tertiary)]">
                    {t("rawHint")}
                  </p>
                  <ol className="grid gap-1.5">
                    {warnings.map((warning, index) => (
                      <li
                        key={`${warning}-${index}`}
                        className="break-all rounded-md border border-[color:rgba(255,179,71,0.14)] bg-[color:rgba(0,0,0,0.10)] px-2.5 py-1.5 font-mono text-[10px] leading-5 text-[color:var(--color-text-secondary)]"
                      >
                        {warning}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            <div className="grid gap-2 border-t border-[color:var(--color-divider)] px-5 py-4 sm:grid-cols-2">
              <Link
                href="/ontology/insights/"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.36)] bg-[color:rgba(94,106,210,0.12)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
              >
                <BarChart3 size={12} aria-hidden />
                {t("queryCta")}
              </Link>
              <Link
                href="/ontology/edit/"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.34)] focus-visible:ring-inset"
              >
                <PencilLine size={12} aria-hidden />
                {t("builderCta")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TreeProjectionWarningGroupChip({
  group,
}: {
  group: TreeProjectionWarningGroup;
}) {
  const t = useTranslations("ontologyView.treeWarnings.groups");
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] px-2.5 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t(`${group.kind}.label`)}
        </span>
        <span className="shrink-0 rounded border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.025)] px-1.5 font-mono text-[10px] text-[color:var(--color-text-secondary)]">
          {group.count}
        </span>
      </div>
      <p className="mt-1 min-w-0 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        {t(`${group.kind}.hint`)}
      </p>
      {group.examples.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t("examplesLabel")}
          </span>
          {group.examples.map((example) => (
            <ProjectionWarningExample key={example} value={example} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProjectionWarningExample({ value }: { value: string }) {
  const parsed = parseProjectionWarningExample(value);
  return (
    <span
      title={value}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.018)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]"
    >
      {parsed.kind ? (
        <span className="shrink-0 uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
          {parsed.kind}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{parsed.label}</span>
    </span>
  );
}

function parseProjectionWarningExample(value: string): {
  kind: string | null;
  label: string;
} {
  const match = value.match(/^(project|domain|capability|element|document|vault-readme):(.+)$/);
  if (!match) return { kind: null, label: value };
  return {
    kind: match[1],
    label: match[2],
  };
}
