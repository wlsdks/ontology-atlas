"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Check, ChevronRight, Clipboard, Flag, GitBranch, Link2, MoreHorizontal, Network, PencilLine, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyNodeHref,
  useEdgeTypeLabel,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { getOntologyKindTone, useOntologyKindLabel } from "@/entities/ontology-class";
import { getProjectDetailHref, getTopologyProjectHref } from "@/entities/project";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import {
  buildOntologyEgoSubgraph,
  acknowledgeChangeNode,
  buildOntologyReachability,
  buildOntologyTree,
  buildMeaningfulOntologyStats,
  clearChangeBaseline,
  computeOntologyChangeset,
  computeOntologyDependents,
  filterTreeByNodeIds,
  formatAgentPostChangeSyncPacket,
  countTreeNodes,
  isContainmentRelation,
  markChangeBaseline,
  useChangeBaseline,
  type OntologyEgoSubgraph,
  type OntologyReachability,
  type OntologyReachabilityDirection,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { copyText } from "@/shared/lib/copy-text";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { OntologyChangePanel } from "./parts/OntologyChangePanel";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { GlobalSearch, MountedGlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { OntologyEgoGraph } from "@/widgets/ontology-ego-graph";
import { OntologyTreeView } from "@/widgets/ontology-tree-view";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useOntologyInsight } from "@/features/vault-ontology";
import { OperationsNav } from "@/widgets/operations-nav";
import { Tooltip, useToast } from "@/shared/ui";
import { MOTION } from "@/shared/motion";
import {
  BUSINESS_ONTOLOGY_READ_ORDER_PROOF,
  DEFAULT_BUSINESS_ONTOLOGY_LENS,
  type BusinessOntologyLens,
  type BusinessOntologyLensStep,
} from "@/shared/lib/business-ontology-lens";
import {
  buildAgentContextBundle,
  buildBlastRadiusMcpCall,
  buildNodeProfileCliCommand,
  buildNodeProfileMcpCall,
  buildReachabilityCliCommand,
  buildReachabilityMcpCall,
  resolveReachabilityQuerySlug,
} from "../lib/reachability-copy";
import { formatQueryOntologyCall as mcpCall } from "@/shared/lib/ontology-query-call";
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
  summarizeTreeProjectionWarnings,
  type TreeProjectionWarningGroup,
} from "../lib/tree-projection-warnings";

const PROOF_COPY_FEEDBACK_MS = 2400;
type NodeDetailSection = "overview" | "relations" | "agent" | "review";

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

      <AnimatePresence>
        {selectedNode ? (
          <NodeDetailPanel
            key={selectedNode.id}
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
      </AnimatePresence>

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

export function OntologyCommandBarHeader() {
  const t = useTranslations('ontologyView');

  return (
    <div
      className="flex min-w-[13rem] flex-1 items-center gap-2 text-[11px] text-[color:var(--color-text-tertiary)]"
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
  const { state, copy } = useCopyFeedback(1500);
  const copied = state === "copied";

  const handleCopy = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${buildOntologyNodeHref(node.id)}`;
    const ok = await copy(url);
    show(ok ? t('toastSuccess') : t('toastError'), ok ? "success" : "error");
  };

  return (
    <Tooltip content={t('tooltip')} withProvider={false}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? t('ariaCopied') : t('ariaCopy')}
        className="flex h-8 items-center gap-1 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none data-[copied=true]:border-[color:rgba(94,106,210,0.46)] data-[copied=true]:bg-[color:rgba(94,106,210,0.16)] data-[copied=true]:text-[color:var(--color-indigo-accent)]"
        data-copied={copied}
      >
        <Link2 size={14} aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.10em]">
          {copied ? t('badge') : t('ariaCopy')}
        </span>
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

function formatRelationPreviewTitle(row: OntologyReviewRelationPreview): string {
  const title = row.title.trim();
  const isElementPath =
    row.kind.toLowerCase() === "element" && title.includes("/") && !title.includes(" ");
  if (!isElementPath) return title;
  return title.slice(title.lastIndexOf("/") + 1) || title;
}

function formatCompactSourceSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed.includes("/")) return trimmed;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

const SUMMARY_PREVIEW_MAX_CHARS = 140;

function buildCollapsedSummaryPreview(summary: string): string {
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUMMARY_PREVIEW_MAX_CHARS) return normalized;

  const firstSentence = normalized.match(/^(.{24,160}?[.!?。！？])(?:\s|$)/u)?.[1];
  if (firstSentence) return firstSentence;

  const clipped = normalized.slice(0, SUMMARY_PREVIEW_MAX_CHARS);
  return `${clipped.replace(/\s+\S*$/, "").trimEnd()}…`;
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

/**
 * 트리 row 클릭 시 노출되는 노드 상세 패널.
 *
 * 데스크톱 / 모바일 — 화면 중앙 modal workbench.
 *
 * project kind 면 공개 detail 페이지 진입 CTA. unknown (stub) 이면 vault
 * 에 매칭 slug 가 없다는 안내 — 빌더에서 채우거나 frontmatter 에서 빼면 해결.
 */
export function NodeDetailPanel({
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
  const selectedProofCopy = useCopyFeedback(PROOF_COPY_FEEDBACK_MS);
  const [copiedProofStep, setCopiedProofStep] = useState<
    "profile" | "impact" | "guard" | "sync" | null
  >(null);
  const [activeDetailSection, setActiveDetailSection] =
    useState<NodeDetailSection>("overview");
  const [kindDecisionOpen, setKindDecisionOpen] = useState(false);
  const [advancedDetailOpen, setAdvancedDetailOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const copiedProofStepTimer = useRef<number | null>(null);
  // 관계 타입(related_to/depends_on/contains…)을 로컬라이즈된 라벨로 — insights
  // 페이지(useEdgeTypeLabel)와 일관, ko 사용자에게 가독성. 미지 타입은 raw 통과.
  const edgeTypeLabel = useEdgeTypeLabel();
  const kindLabel = getKindLabel(node.kind);
  const kindTone = getOntologyKindTone(node.kind);
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
    showFullSummary: false,
    showAllNeighbors: false,
    showAllEvidence: false,
  }));
  const showFullSummary =
    panelExpansion.nodeId === node.id ? panelExpansion.showFullSummary : false;
  const showAllNeighbors =
    panelExpansion.nodeId === node.id ? panelExpansion.showAllNeighbors : false;
  const showAllEvidence =
    panelExpansion.nodeId === node.id ? panelExpansion.showAllEvidence : false;
  const setShowFullSummary = (next: (current: boolean) => boolean) => {
    setPanelExpansion((current) => ({
      nodeId: node.id,
      showFullSummary: next(
        current.nodeId === node.id ? current.showFullSummary : false,
      ),
      showAllNeighbors:
        current.nodeId === node.id ? current.showAllNeighbors : false,
      showAllEvidence:
        current.nodeId === node.id ? current.showAllEvidence : false,
    }));
  };
  const setShowAllNeighbors = (next: (current: boolean) => boolean) => {
    setPanelExpansion((current) => ({
      nodeId: node.id,
      showFullSummary:
        current.nodeId === node.id ? current.showFullSummary : false,
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
      showFullSummary:
        current.nodeId === node.id ? current.showFullSummary : false,
      showAllNeighbors:
        current.nodeId === node.id ? current.showAllNeighbors : false,
      showAllEvidence: next(
        current.nodeId === node.id ? current.showAllEvidence : false,
      ),
    }));
  };
  const NEIGHBOR_PREVIEW = 6;
  const EVIDENCE_PREVIEW = 6;
  const shouldClampSummary = (node.summary?.length ?? 0) > 180;
  const summaryText = node.summary && shouldClampSummary && !showFullSummary
    ? buildCollapsedSummaryPreview(node.summary)
    : node.summary;
  const visibleEvidence = showAllEvidence
    ? evidenceList
    : evidenceList.slice(0, EVIDENCE_PREVIEW);
  const hiddenEvidenceCount = Math.max(0, evidenceList.length - visibleEvidence.length);
  const reachabilityQuerySlug = resolveReachabilityQuerySlug(node);
  const sourceEvidenceSlug = node.evidenceIds[0] ?? null;
  const topologyHref = buildOntologyReviewTopologyHref(node.id);
  const builderHref = buildOntologyBuilderNodeHref(node);
  const queryHref = buildOntologyInsightsNodeHref(node);
  const directNeighbors = ego?.neighbors.filter((neighbor) => neighbor.hop === 1) ?? [];
  const relationTypes = buildRelationTypeCounts(directNeighbors);
  const relationPreview = buildRelationPreviewRows(directNeighbors, getKindLabel);
  const relationPreviewNodeById = new Map(
    directNeighbors
      .filter((neighbor) => neighbor.node)
      .map((neighbor) => [neighbor.neighborId, neighbor.node as KnowledgeGraphNode]),
  );
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
  const relationTypesFullText =
    reviewBrief.relationTypes.length > 0
      ? reviewBrief.relationTypes
          .map((row) => `${edgeTypeLabel(row.type)} ${row.count}`)
          .join(', ')
      : t('reviewNoRelationTypes');
  const relationTypesPreviewText =
    reviewBrief.relationTypes.length > 0
      ? [
          `${edgeTypeLabel(reviewBrief.relationTypes[0].type)} ${reviewBrief.relationTypes[0].count}`,
          reviewBrief.relationTypes.length > 1
            ? `+${reviewBrief.relationTypes.length - 1}`
            : null,
        ].filter(Boolean).join(' ')
      : t('reviewNoRelationTypes');
  const reviewAgentChecks = reviewBrief.agentChecks;
  const kindDecisionKey = (["project", "domain", "capability", "element"].includes(node.kind)
    ? node.kind
    : "node") as "project" | "domain" | "capability" | "element" | "node";
  const proofPacketCommand = "node_profile + blast_radius + all_paths + health";
  const proofFeedbackNextAction = copiedProofStep
    ? t(`proofFeedbackNextActionByStep.${copiedProofStep}`)
    : t('proofFeedbackNextActionPacket');
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
  useEffect(() => {
    return () => {
      if (copiedProofStepTimer.current !== null) {
        window.clearTimeout(copiedProofStepTimer.current);
      }
    };
  }, []);
  useEffect(() => {
    if (typeof panelRef.current?.scrollTo === "function") {
      panelRef.current.scrollTo({ top: 0 });
    }
  }, [node.id]);
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
    if (await selectedProofCopy.copy(text)) {
      if (copiedProofStepTimer.current !== null) {
        window.clearTimeout(copiedProofStepTimer.current);
      }
      setCopiedProofStep(null);
      show(t('agentContextBundleToastSuccess'), 'success');
      return;
    }
    show(t('agentContextBundleToastError'), 'error');
  };
  const copyProofStep = async (step: "profile" | "impact" | "guard" | "sync") => {
    if (!reachabilityQuerySlug) return;
    const targetSlug = "<target-slug>";
    const relationType = "<relation-type>";
    const textByStep = {
      profile: buildNodeProfileMcpCall({ slug: reachabilityQuerySlug, limit: 8 }),
      impact: buildBlastRadiusMcpCall({
        slug: reachabilityQuerySlug,
        depth: 2,
        direction: "incoming",
      }),
      guard: [
        mcpCall({
          operation: "query_plan",
          targetOperation: "all_paths",
          from: reachabilityQuerySlug,
          to: targetSlug,
          maxHops: 4,
          searchBudget: 1000,
          limit: 10,
        }),
        mcpCall({
          operation: "relation_check",
          from: reachabilityQuerySlug,
          to: targetSlug,
          type: relationType,
        }),
      ].join("\n"),
      sync: formatAgentPostChangeSyncPacket(),
    } satisfies Record<typeof step, string>;

    if (await copyText(textByStep[step])) {
      if (copiedProofStepTimer.current !== null) {
        window.clearTimeout(copiedProofStepTimer.current);
      }
      setCopiedProofStep(step);
      copiedProofStepTimer.current = window.setTimeout(() => {
        setCopiedProofStep(null);
      }, PROOF_COPY_FEEDBACK_MS);
      show(t('proofStepCopyToastSuccess'), 'success');
      return;
    }
    show(t('proofStepCopyToastError'), 'error');
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

  const detailDialog = (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[color:rgba(0,0,0,0.66)] px-2 py-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4 md:px-5"
      data-testid="ontology-node-detail-backdrop"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label={t('ariaLabel', { title: node.title })}
        aria-modal="true"
        data-testid="ontology-node-detail"
        className="flex h-[min(56rem,calc(100dvh-1rem))] w-[min(96rem,calc(100vw-1rem))] flex-col overflow-hidden overscroll-contain rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[15px] shadow-[0_28px_92px_rgba(0,0,0,0.62)] sm:h-[min(58rem,calc(100dvh-2rem))] sm:w-[min(96rem,calc(100vw-2rem))]"
        onClick={(event) => event.stopPropagation()}
      >
      <div className="shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 sm:px-5 md:px-6 md:py-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-5" data-testid="ontology-node-detail-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {kindLabel}
            </p>
          </div>
          <h2 className="mt-1 [overflow-wrap:anywhere] text-2xl leading-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:text-3xl">
            {node.title}
          </h2>
          <p className="mt-2 max-w-5xl break-keep text-sm leading-6 text-[color:var(--color-text-tertiary)] md:text-[15px] md:leading-7">
            {t('dialogPurpose')}
          </p>
          <Link
            href="/ontology/"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
          >
            {t('closeToBrowse')}
          </Link>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:min-w-[20rem] md:items-end">
          <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
            <CopyNodeLinkButton node={node} />
            {/* 새 edge 는 vault frontmatter array (capabilities / elements /
                dependencies / relates / contains / describes) 직접 추가 또는
                builder canvas (/ontology/edit). */}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
            >
              <X size={14} aria-hidden />
              <span>{t('close')}</span>
            </button>
          </div>
          <nav
            aria-label={t('nextActionsAriaLabel')}
            className="w-full rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 md:max-w-[22rem]"
          >
            <p className="px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('nextActionsTitle')}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <Link
                href={topologyHref}
                className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)]"
              >
                <Network size={13} aria-hidden />
                <span className="truncate">{t('nextActionTopology')}</span>
              </Link>
              <Link
                href={builderHref}
                className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)]"
              >
                <PencilLine size={13} aria-hidden />
                <span className="truncate">{t('nextActionBuilder')}</span>
              </Link>
              <Link
                href={reviewBrief.handoffLinks.query}
                className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)]"
              >
                <BarChart3 size={13} aria-hidden />
                <span className="truncate">{t('nextActionQuery')}</span>
              </Link>
            </div>
          </nav>
        </div>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-4 md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]"
        data-testid="ontology-node-detail-scroll"
      >

      <div
        className="contents"
        data-testid="ontology-node-detail-workbench"
      >
        <nav
          role="tablist"
          aria-label={t('sectionNavAriaLabel')}
          className="flex shrink-0 gap-2 overflow-x-auto rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2 md:min-h-0 md:flex-col md:overflow-visible"
          data-layout="lnb"
          data-testid="ontology-node-detail-section-nav"
        >
          <div
            className="hidden rounded-lg border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.07)] px-3 py-3 md:block"
            data-testid="ontology-node-detail-lnb-summary"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
              {t('selectedConcept')}
            </p>
            <p className="mt-1 min-w-0 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]" title={node.title}>
              {node.title}
            </p>
            <dl className="mt-3 grid gap-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <dt>{t('selectedConceptKind')}</dt>
                <dd className="min-w-0 truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                  {kindLabel}
                </dd>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <dt>{t('selectedConceptRelations')}</dt>
                <dd className="font-mono text-[10px] uppercase tracking-[0.04em] text-[color:var(--color-indigo-accent)]">
                  {t('selectedConceptRelationCount', {
                    count: reviewBrief.relationSummary.outgoing + reviewBrief.relationSummary.incoming,
                  })}
                </dd>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <dt>{t('selectedConceptSource')}</dt>
                <dd className="min-w-0 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]" title={reachabilityQuerySlug ?? node.id}>
                  {formatCompactSourceSlug(reachabilityQuerySlug ?? node.id)}
                </dd>
              </div>
            </dl>
          </div>
          {([
            ["overview", "sectionNavOverview", "sectionNavOverviewDesc"],
            ["relations", "sectionNavRelations", "sectionNavRelationsDesc"],
          ] as const).map(([section, labelKey, descKey]) => (
            <button
              type="button"
              role="tab"
              key={section}
              id={`ontology-node-detail-tab-${section}`}
              aria-selected={activeDetailSection === section}
              aria-controls={`ontology-node-${section}`}
              data-active={activeDetailSection === section ? "true" : "false"}
              onClick={() => {
                setActiveDetailSection(section);
                if (typeof panelRef.current?.scrollTo === "function") {
                  panelRef.current.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className={`group inline-flex min-h-14 min-w-[8rem] flex-col items-start justify-center rounded-lg border px-3 py-2.5 text-left text-[13px] font-[var(--font-weight-signature)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset md:min-w-0 md:min-h-[4.75rem] md:text-sm ${
                activeDetailSection === section
                  ? "border-[color:rgba(94,106,210,0.36)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                  : "border-transparent text-[color:var(--color-text-secondary)] hover:bg-[color:rgba(94,106,210,0.10)] hover:text-[color:var(--color-text-primary)]"
              }`}
            >
              <span>{t(labelKey)}</span>
              <span className="mt-1 hidden text-[11px] font-normal leading-4 text-[color:var(--color-text-quaternary)] md:block">
                {t(descKey)}
              </span>
            </button>
          ))}
          <div className="border-t border-[color:var(--color-divider)] pt-2 md:mt-1">
            <button
              type="button"
              aria-expanded={advancedDetailOpen}
              aria-controls="ontology-node-detail-advanced-tabs"
              onClick={() => {
                const next = !advancedDetailOpen;
                setAdvancedDetailOpen(next);
                if (!next && (activeDetailSection === "agent" || activeDetailSection === "review")) {
                  setActiveDetailSection("overview");
                }
              }}
              className="inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-left text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
            >
              <span>{advancedDetailOpen ? t('advancedToolsHide') : t('advancedToolsShow')}</span>
              <ChevronRight
                size={13}
                aria-hidden
                className={advancedDetailOpen ? "rotate-90 transition-transform" : "transition-transform"}
              />
            </button>
          </div>
          {advancedDetailOpen ? (
            <div
              id="ontology-node-detail-advanced-tabs"
              className="contents"
              data-testid="ontology-node-detail-advanced-tabs"
            >
              {([
                ["agent", "sectionNavAgent", "sectionNavAgentDesc"],
                ["review", "sectionNavReview", "sectionNavReviewDesc"],
              ] as const).map(([section, labelKey, descKey]) => (
                <button
                  type="button"
                  role="tab"
                  key={section}
                  id={`ontology-node-detail-tab-${section}`}
                  aria-selected={activeDetailSection === section}
                  aria-controls={`ontology-node-${section}`}
                  data-active={activeDetailSection === section ? "true" : "false"}
                  onClick={() => {
                    setActiveDetailSection(section);
                    if (typeof panelRef.current?.scrollTo === "function") {
                      panelRef.current.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className={`group inline-flex min-h-14 min-w-[8rem] flex-col items-start justify-center rounded-lg border px-3 py-2.5 text-left text-[13px] font-[var(--font-weight-signature)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset md:min-w-0 md:min-h-[4.75rem] md:text-sm ${
                    activeDetailSection === section
                      ? "border-[color:rgba(94,106,210,0.36)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                      : "border-transparent text-[color:var(--color-text-secondary)] hover:bg-[color:rgba(94,106,210,0.10)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  <span>{t(labelKey)}</span>
                  <span className="mt-1 hidden text-[11px] font-normal leading-4 text-[color:var(--color-text-quaternary)] md:block">
                    {t(descKey)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </nav>
        <div
          ref={panelRef}
          className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.018)] p-5 text-base leading-8 text-[color:var(--color-text-secondary)] sm:p-6 md:p-7 md:text-lg md:leading-9"
          data-testid="ontology-node-detail-reading-pane"
        >
      <section
        id="ontology-node-overview"
        role="tabpanel"
        aria-labelledby="ontology-node-detail-tab-overview"
        hidden={activeDetailSection !== "overview"}
        className={activeDetailSection === "overview" ? "block" : "hidden"}
        data-testid="ontology-node-detail-section-overview"
      >
      {node.summary ? (
        <div className="mb-4">
          <p
            className={`break-keep text-base leading-8 text-[color:var(--color-text-secondary)] md:text-lg md:leading-9 ${
              shouldClampSummary && !showFullSummary ? "line-clamp-4" : ""
            }`}
          >
            {summaryText}
          </p>
          {shouldClampSummary ? (
            <button
              type="button"
              onClick={() => setShowFullSummary((current) => !current)}
              className="mt-2 rounded-sm font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {showFullSummary ? t('summaryLess') : t('summaryMore')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4">
        <button
          type="button"
          aria-expanded={kindDecisionOpen}
          onClick={() => setKindDecisionOpen((current) => !current)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
        >
          <ChevronRight
            size={13}
            aria-hidden
            className={kindDecisionOpen ? "rotate-90 transition-transform" : "transition-transform"}
          />
          {kindDecisionOpen ? t('kindDecisionHide') : t('kindDecisionShow')}
        </button>
      </div>

      {kindDecisionOpen ? (
        <div
          className="mb-4 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4 md:px-6 md:py-5"
          data-kind-tone={kindTone.hueName}
          data-kind-fill={kindTone.fill}
          data-testid="ontology-kind-decision-card"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[color:var(--color-divider)] pb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('kindDecisionTitle')}
            </p>
            <span
              className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
              data-testid="ontology-kind-decision-marker"
            >
              <span
                aria-hidden
                className="grid h-4 w-4 place-items-center rounded-[4px] border bg-transparent"
                style={{
                  backgroundColor: kindTone.chipBg,
                  borderColor: kindTone.chipBorder,
                }}
                data-testid="ontology-kind-decision-swatch"
              >
                <span
                  className="block h-1.5 w-1.5 rounded-[2px]"
                  style={{ backgroundColor: kindTone.chipBorder }}
                />
              </span>
              <Flag size={12} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
              <span>{kindLabel}</span>
            </span>
          </div>
          <div className="min-w-0 pt-3">
            <p className="break-keep text-base font-[var(--font-weight-signature)] leading-7 text-[color:var(--color-text-primary)] md:text-lg md:leading-8">
              {t(`kindDecision.${kindDecisionKey}`)}
            </p>
            <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-tertiary)]">
              {t('kindDecisionEvidence')}
            </p>
          </div>
        </div>
      ) : null}

      {/* R10 이후 vault 가 유일 모드 — node.projectIds 는 항상 [],
          node.evidenceCount 는 항상 undefined. cycle 10 에서 vault dead
          row 두 개를 가리는 가드만 추가했지만 실제 노출 케이스가 영구
          0 이라 cycle 16 에서 IIFE 자체 + DetailRow 컴포넌트 + linkedProjects
          / evidenceCount i18n 키까지 한꺼번에 제거. 같은 정보가 필요해
          지면 '관련 문서' 섹션 + 점프 chip 이 더 풍부하게 보여 줌. */}
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
      </section>
      <section
        id="ontology-node-agent"
        role="tabpanel"
        aria-labelledby="ontology-node-detail-tab-agent"
        hidden={activeDetailSection !== "agent"}
        className={activeDetailSection === "agent" ? "block" : "hidden"}
        data-testid="ontology-node-detail-section-agent"
      >
      {reachabilityQuerySlug ? (
        <div
          className="rounded-xl border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.075)] p-4 md:p-5"
          data-testid="ontology-proof-path"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
              {t('proofPathTitle')}
            </span>
            <span className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.22)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
              {t('proofPathBadge')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['profile', 'impact', 'guard', 'sync'] as const).map((step, index) => {
              const copied = copiedProofStep === step;
              const stepLabel = t(`proofStep.${step}`);
              const stepShortLabel = t(`proofStepShort.${step}`);
              const stepCommand = t(`proofStepCommand.${step}`);
              const stepBody = t(`proofStepBody.${step}`);
              return (
                <button
                  type="button"
                  key={step}
                  onClick={() => void copyProofStep(step)}
                  aria-label={t('proofStepCopyAria', { step: stepLabel })}
                  title={stepCommand}
                  className={`min-w-0 rounded-lg border px-3 py-2 text-left transition-[background-color,border-color,transform] duration-180 hover:-translate-y-0.5 hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.09)] active:translate-y-0 active:border-[color:rgba(94,106,210,0.50)] active:bg-[color:rgba(94,106,210,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset motion-reduce:transform-none ${
                    copied
                      ? "border-[color:rgba(73,190,146,0.42)] bg-[color:rgba(73,190,146,0.10)]"
                      : "border-[color:rgba(94,106,210,0.16)] bg-[color:var(--color-overlay-1)]"
                  }`}
                >
                  <span
                    className="flex items-center justify-between gap-1 font-mono text-[10px] uppercase tracking-[0.02em] text-[color:var(--color-indigo-accent)]"
                    data-testid={`ontology-proof-step-label-${step}`}
                  >
                    <span className="min-w-0 truncate">
                      {String(index + 1).padStart(2, "0")} {stepShortLabel}
                    </span>
                    {copied ? (
                      <Check size={11} className="text-[color:rgba(73,190,146,0.95)]" aria-hidden />
                    ) : (
                      <Clipboard size={11} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
                    )}
                  </span>
                  <span
                    className={`mt-1.5 block truncate text-[12px] ${
                      copied
                        ? "text-[color:rgba(190,245,222,0.96)]"
                        : "text-[color:var(--color-text-secondary)]"
                    }`}
                  >
                    {copied ? t('proofStepCopied') : stepBody}
                  </span>
                </button>
              );
            })}
          </div>
          <AnimatePresence initial={false}>
            {copiedProofStep || selectedProofCopy.state === "copied" ? (
              <motion.div
                key="proof-copy-feedback"
                initial={{ opacity: 0, y: -4, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.985 }}
                transition={{
                  y: MOTION.fast,
                  scale: MOTION.fast,
                  opacity: MOTION.fast,
                }}
                className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.08)] px-3 py-2 text-[12px] text-[color:rgba(190,245,222,0.96)]"
                aria-live="polite"
                data-proof-command={
                  copiedProofStep ? t(`proofStepCommand.${copiedProofStep}`) : proofPacketCommand
                }
                data-proof-step={copiedProofStep ?? "packet"}
                data-proof-target={reachabilityQuerySlug}
                data-proof-next-action={proofFeedbackNextAction}
                data-testid="ontology-proof-copy-feedback"
                role="status"
                title={t('proofFeedbackBody', { action: proofFeedbackNextAction, slug: reachabilityQuerySlug })}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(73,190,146,0.30)] bg-[color:rgba(73,190,146,0.10)]">
                  <Check size={11} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-[var(--font-weight-signature)]">
                    {copiedProofStep
                      ? t('proofFeedbackStepTitle', {
                          command: t(`proofStepCommand.${copiedProofStep}`),
                        })
                      : t('proofFeedbackPacketTitle')}
                  </span>
                  <span
                    className="block truncate text-[11px] leading-5 normal-case tracking-[0.01em] text-[color:rgba(190,245,222,0.68)]"
                    data-testid="ontology-proof-copy-feedback-body"
                  >
                    {t('proofFeedbackBody', { action: proofFeedbackNextAction, slug: reachabilityQuerySlug })}
                  </span>
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => void copySelectedNodeProof()}
            className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-[var(--font-weight-signature)] transition-[background-color,border-color,color,transform] duration-180 hover:-translate-y-0.5 active:translate-y-0 active:border-[color:rgba(94,106,210,0.62)] active:bg-[color:rgba(94,106,210,0.20)] motion-reduce:transform-none ${
              selectedProofCopy.state === "copied"
                ? "border-[color:rgba(73,190,146,0.44)] bg-[color:rgba(73,190,146,0.12)] text-[color:rgba(190,245,222,0.96)]"
                : "border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)] hover:border-[color:rgba(94,106,210,0.54)] hover:bg-[color:rgba(94,106,210,0.16)]"
            }`}
          >
            {selectedProofCopy.state === "copied" ? (
              <Check size={12} aria-hidden />
            ) : (
              <Clipboard size={12} aria-hidden />
            )}
            {selectedProofCopy.state === "copied"
              ? t('handoffCopyProofCopied')
              : t('handoffCopyProof')}
          </button>
        </div>
      ) : null}
      {reachabilityQuerySlug ? (
        <AgentContextCopyActions
          slug={reachabilityQuerySlug}
          reachabilityDirection={reachabilityDirection}
          reachabilityDepth={reachabilityDepth}
        />
      ) : null}
      </section>
      <section
        id="ontology-node-relations"
        role="tabpanel"
        aria-labelledby="ontology-node-detail-tab-relations"
        hidden={activeDetailSection !== "relations"}
        className={activeDetailSection === "relations" ? "block" : "hidden"}
        data-testid="ontology-node-detail-section-relations"
      >
      <div
        className="rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4 md:px-5 md:py-5"
        data-testid="ontology-relation-preview"
      >
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('reviewRelationPreviewTitle')}
            </p>
            <span className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {t('reviewRelations', {
                outgoing: reviewBrief.relationSummary.outgoing,
                incoming: reviewBrief.relationSummary.incoming,
              })}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
            {reviewBrief.sourceSlug && sourceEvidenceSlug ? (
              <Link
                href={buildDocsVaultHref({ slug: sourceEvidenceSlug })}
                aria-label={t('reviewSource', { source: reviewBrief.sourceSlug })}
                className="min-w-0 flex-1 truncate rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5 normal-case tracking-[0.01em] transition-[border-color,color] hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
                data-source-slug={reviewBrief.sourceSlug}
                title={t('reviewSource', { source: reviewBrief.sourceSlug })}
              >
                {t('reviewSource', { source: formatCompactSourceSlug(reviewBrief.sourceSlug) })}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5">
                {t('reviewSource', { source: t('reviewNoSource') })}
              </span>
            )}
            <span
              className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5"
              data-testid="ontology-relation-type-chip"
              title={t('reviewRelationTypes', { types: relationTypesFullText })}
            >
              {t('reviewRelationTypes', {
                types: relationTypesPreviewText,
              })}
            </span>
          </div>
        </div>
        {relationPreview.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {relationPreview.map((row) => {
              const neighborNode = relationPreviewNodeById.get(row.nodeId) ?? null;
              const directionLabel =
                row.direction === "outgoing"
                  ? t('reviewRelationPreviewOut')
                  : t('reviewRelationPreviewIn');
              const typeLabel = edgeTypeLabel(row.type);
              const displayTitle = formatRelationPreviewTitle(row);
              const openRelationLabel = t('reviewRelationOpenNode', {
                title: row.title,
                direction: directionLabel,
                type: typeLabel,
              });
              const directionTone =
                row.direction === "outgoing"
                  ? {
                      row: "border-l border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.035)] hover:bg-[color:rgba(94,106,210,0.09)] active:bg-[color:rgba(94,106,210,0.14)]",
                      label: "text-[color:rgba(159,170,235,0.98)]",
                    }
                  : {
                      row: "border-l border-[color:rgba(73,190,146,0.30)] bg-[color:rgba(73,190,146,0.035)] hover:bg-[color:rgba(73,190,146,0.09)] active:bg-[color:rgba(73,190,146,0.14)]",
                      label: "text-[color:rgba(151,230,198,0.96)]",
                    };
              const content = (
                <>
                  <span
                    className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.10em] ${directionTone.label}`}
                  >
                    {directionLabel}
                  </span>
                  <span className="shrink-0 rounded-sm border border-[color:rgba(94,106,210,0.20)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]">
                    {typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={row.title}>
                    {displayTitle}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {row.kind}
                  </span>
                </>
              );
              return (
                <li key={`${row.direction}-${row.type}-${row.nodeId}`}>
                  {neighborNode ? (
                    <button
                      type="button"
                      onClick={() => onSelectNeighbor(neighborNode)}
                      aria-label={openRelationLabel}
                      title={openRelationLabel}
                      data-direction={row.direction}
                      data-node-id={row.nodeId}
                      data-relation-type={row.type}
                    className={`group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm leading-6 text-[color:var(--color-text-secondary)] transition-[background-color,color] duration-180 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset ${directionTone.row}`}
                    >
                      {content}
                      <ChevronRight
                        size={11}
                        className="shrink-0 text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-indigo-accent)]"
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div
                      className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-6 text-[color:var(--color-text-secondary)] ${directionTone.row}`}
                      data-direction={row.direction}
                      data-node-id={row.nodeId}
                      data-relation-type={row.type}
                    >
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('reviewRelationPreviewEmpty')}
          </p>
        )}
      </div>
      </section>
      <section
        id="ontology-node-review"
        role="tabpanel"
        aria-labelledby="ontology-node-detail-tab-review"
        hidden={activeDetailSection !== "review"}
        className={activeDetailSection === "review" ? "block" : "hidden"}
        data-testid="ontology-node-detail-section-review"
      >
      <div
        className="rounded-xl border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] px-4 py-4 md:px-5 md:py-5"
        data-testid="ontology-review-brief"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('reviewTitle')}
            </p>
            <p className="mt-1 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t(`reviewLens.${reviewBrief.lens}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={copyReviewBrief}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] px-2.5 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)]"
          >
            <Clipboard size={12} aria-hidden />
            {t('reviewCopy')}
          </button>
        </div>
        <p className="mt-3 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
          {t(`reviewPrompt.${reviewBrief.prompt}`)}
        </p>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.22)] px-2.5 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('reviewQuestionsTitle')}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
            {reviewQuestions.map((question) => (
              <li key={question} className="break-keep">
                {question}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.18)] px-2.5 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('reviewImpactTitle')}
          </p>
          <p className="mt-2 break-keep text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
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
      </section>

      <section
        hidden={activeDetailSection !== "relations"}
        className={activeDetailSection === "relations" ? "mt-4 block" : "hidden"}
        data-testid="ontology-node-detail-section-relation-graph"
      >
      {reachability ? (
        <div
          className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
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
                        {t('reachabilityPreviewLayer', {
                          distance: layer.distance,
                          count: layer.total,
                        })}
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
                  {/* 관계 타입 분포는 전부 표시 — 타입 수는 bounded(관계 스키마
                      ~7종) 라 clutter 없고, 어떤 관계로 도달했는지 완전한 분포가
                      reachability 질의 결과의 핵심. slice 로 자르면 도달 경로의
                      일부 관계 타입이 silent 하게 빠진다(no silent caps). */}
                  {Object.entries(reachability.byRelation).map(([relation, count]) => (
                    <span
                      key={relation}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color:var(--color-border-soft)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--color-text-tertiary)]"
                    >
                      <span className="truncate">{edgeTypeLabel(relation)}</span>
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
                {t('relationGraphDepthOption', { depth: 1 })}
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
                {t('relationGraphDepthOption', { depth: 2 })}
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
              const directionLabel = isOutgoing
                ? t('reviewRelationPreviewOut')
                : t('reviewRelationPreviewIn');
              const relationLabel = edgeTypeLabel(neighbor.edge.label ?? neighbor.edge.type);
              const neighborTitle = neighbor.node?.title ?? neighbor.neighborId;
              const neighborKindLabel = neighbor.node ? getKindLabel(neighbor.node.kind) : t('neighborMissingKind');
              const ariaLabel = t('relationGraphNeighborLabel', {
                source: isOutgoing ? node.title : neighborTitle,
                target: isOutgoing ? neighborTitle : node.title,
                type: relationLabel,
              });
              const clickable = neighbor.node !== null;
              const content = (
                <>
                  <span
                    className="inline-flex shrink-0 items-center font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                    aria-hidden
                  >
                    {directionLabel} · {relationLabel}
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
      </section>
        </div>
      </div>
      </div>
      </aside>
    </div>
  );

  if (typeof document === "undefined") {
    return detailDialog;
  }

  return createPortal(detailDialog, document.body);
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
