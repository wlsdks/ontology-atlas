"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Check, ChevronRight, Clipboard, GitBranch, Link2, Network, PencilLine, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyNodeHref,
  useEdgeTypeLabel,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { getProjectDetailHref, getTopologyProjectHref } from "@/entities/project";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import {
  buildAgentBriefingPacket,
  buildOntologyEgoSubgraph,
  acknowledgeChangeNode,
  buildOntologyReachability,
  buildOntologyTree,
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
import { AgentStatusPopover } from "./parts/AgentStatusPopover";
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
import { Tooltip, useToast } from "@/shared/ui";
import { MOTION, SPRING } from "@/shared/motion";
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
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
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
    const containmentRelations = insight.edges.filter((edge) =>
      isContainmentRelation(edge.type),
    ).length;
    return {
      semanticRelations: Math.max(insight.edges.length - containmentRelations, 0),
      containmentRelations,
    };
  }, [insight]);


  return (
    <>
      {/* OperationsNav 는 풀폭으로 (본문 max-w 안에 갇히면 좌우 여백 과대로
          가운데 몰려 보이는 회귀 회피). 'ontology surface' 인 / 와 /ontology*
          에선 OperationsNav 가 SubNav 행을 inline 으로 함께 렌더. */}
      <OperationsNav />
      <main id="main" className="mx-auto w-full max-w-5xl overflow-hidden px-5 py-6 md:px-8 md:py-8">
      <section className="mb-5">
        <h1 className="sr-only">{t('title')}</h1>
        <div
          className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.018)] px-3 py-2"
          data-testid="ontology-command-bar"
        >
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-[color:var(--color-text-tertiary)]">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] px-2 font-mono uppercase tracking-[0.10em] text-[color:var(--color-indigo-accent)]">
              <GitBranch size={12} aria-hidden />
              {t('eyebrow')}
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              {t('stat.graphRefsValue', {
                nodes: totalNodes,
                relations: insight?.edges.length ?? 0,
              })}
            </span>
          </div>
          {/* 모바일에서도 Browse / Write / Query 액션 라벨을 숨기지 않는다.
              이 row 는 시작 허브라 가로 스크롤보다 줄바꿈이 더 읽기 쉽다. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* Add Node 는 '빌더' CTA 와 destination 동일 → 중복 제거.
                인사이트 / 관계 pill 도 OntologySubNav 가 항상 노출하므로 제거. */}
            <Tooltip content={t('actions.workbenchOverviewTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setWorkbenchOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={workbenchOpen}
                aria-controls="ontology-workbench-overview"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] px-3 text-xs text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.16)]"
              >
                <GitBranch size={13} aria-hidden />
                <span className="max-w-[7.5rem] truncate">{t('actions.workbenchOverview')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('actions.searchTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t('actions.searchAria')}
	                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
	              >
	                <Search size={13} aria-hidden />
	                <span>{t('actions.search')}</span>
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
	                <span>{t('actions.globalSearch')}</span>
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
	                <span>{t('actions.query')}</span>
	              </Link>
	            </Tooltip>
	            {agentBriefing ? (
	              <AgentStatusPopover
	                packet={agentBriefing}
	                onCopyBriefing={handleCopyAgentBriefing}
	              />
	            ) : null}
            {/* S5 — 빌더 비파괴 강등: 1차 편집은 토폴로지(노드 선택 → 편집)로
                이동. 빌더(/ontology/edit)는 ERD 고급 캔버스로 남기되, filled-
                primary → secondary outline 으로 시각 강등. 라우트·링크는 유지. */}
            <Tooltip content={t('actions.builderTooltip')} withProvider={false}>
              <Link
                href={builderHref}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                aria-label={`${t('actions.builder')} — ${t('actions.builderAria')}`}
              >
                <PencilLine size={13} aria-hidden />
                <span className="max-w-[8.5rem] truncate">{t('actions.builder')}</span>
              </Link>
            </Tooltip>
          </div>
        </div>
      </section>

      {insight ? (
        <div className="mb-6">
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
        </div>
      </div>

      {/* Compact tree contract strip. Keep the hierarchy boundary visible without
          turning the first viewport into another row of explanatory cards. */}
      <section
        aria-label={t('stat.ariaLabel')}
        className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-[11px] text-[color:var(--color-text-tertiary)]"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <GitBranch size={12} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
          <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-secondary)]">
            {t('stat.roleValue')}
          </span>
        </span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span className="min-w-0 truncate">
          {t('stat.graphRefsValue', {
            nodes: totalNodes,
            relations: insight?.edges.length ?? 0,
          })}
        </span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span>
          {docCount > 0 ? t('stat.evidenceValue', { count: docCount }) : t('stat.evidenceHiddenValue')}
        </span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span className="min-w-0 truncate text-[color:var(--color-indigo-accent)]">
          {t('stat.selectionHint')}
        </span>
        {treeResult && treeResult.warnings.length > 0 ? (
          <>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <button
              type="button"
              aria-label={t('stat.warningsAria', { count: treeResult.warnings.length })}
              onClick={() => {
                const trigger = document.getElementById('tree-data-warnings-open');
                if (trigger instanceof HTMLButtonElement) {
                  trigger.click();
                  return;
                }
                document
                  .getElementById('tree-data-warnings')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="inline-flex h-8 items-center rounded-full border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.06)] px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:border-[color:rgba(255,179,71,0.38)]"
            >
              {t('stat.warnings')} · {t('stat.warningsValue', { count: treeResult.warnings.length })}
            </button>
          </>
        ) : null}
      </section>

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
            onSelect={(node) => selectNode(node)}
            emptyHint={changesOnlyActive ? t('changes.scopedEmpty') : t('emptyHint')}
            selectedId={selectedNode?.id ?? null}
            changedNodeIds={changeBaseline !== null ? ontologyChangeset.touchedNodeIds : undefined}
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
  const selectedProofCopy = useCopyFeedback(1400);
  const [copiedProofStep, setCopiedProofStep] = useState<
    "profile" | "impact" | "guard" | "sync" | null
  >(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const copiedProofStepTimer = useRef<number | null>(null);
  // 관계 타입(related_to/depends_on/contains…)을 로컬라이즈된 라벨로 — insights
  // 페이지(useEdgeTypeLabel)와 일관, ko 사용자에게 가독성. 미지 타입은 raw 통과.
  const edgeTypeLabel = useEdgeTypeLabel();
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
  useEffect(() => {
    return () => {
      if (copiedProofStepTimer.current !== null) {
        window.clearTimeout(copiedProofStepTimer.current);
      }
    };
  }, []);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
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
      }, 1400);
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

  return (
    <motion.aside
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.985 }}
      transition={{
        y: SPRING.sheet,
        scale: SPRING.sheet,
        opacity: MOTION.fast,
      }}
      role="dialog"
      ref={panelRef}
      aria-label={t('ariaLabel', { title: node.title })}
      aria-modal="false"
      data-testid="ontology-node-detail"
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-full max-w-md max-h-[min(68dvh,600px)] flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-4 shadow-[0_-12px_28px_rgba(0,0,0,0.45)] md:bottom-auto md:right-6 md:top-24 md:left-auto md:mx-0 md:w-[360px] md:max-h-[calc(100vh-7rem)] md:rounded-2xl md:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
    >
      <div className="sticky top-0 z-10 mb-3 flex items-start justify-between gap-3 bg-[color:var(--color-panel)]">
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
        <div className="mb-3">
          <p
            className={`break-keep text-sm leading-6 text-[color:var(--color-text-secondary)] ${
              shouldClampSummary && !showFullSummary ? "line-clamp-3" : ""
            }`}
          >
            {node.summary}
          </p>
          {shouldClampSummary ? (
            <button
              type="button"
              onClick={() => setShowFullSummary((current) => !current)}
              className="mt-1.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {showFullSummary ? t('summaryLess') : t('summaryMore')}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* R10 이후 vault 가 유일 모드 — node.projectIds 는 항상 [],
          node.evidenceCount 는 항상 undefined. cycle 10 에서 vault dead
          row 두 개를 가리는 가드만 추가했지만 실제 노출 케이스가 영구
          0 이라 cycle 16 에서 IIFE 자체 + DetailRow 컴포넌트 + linkedProjects
          / evidenceCount i18n 키까지 한꺼번에 제거. 같은 정보가 필요해
          지면 '관련 문서' 섹션 + 점프 chip 이 더 풍부하게 보여 줌. */}
      <div
        aria-label={`${node.id} · ${t(`reviewLens.${reviewBrief.lens}`)} · ${t('reviewRelations', {
          outgoing: reviewBrief.relationSummary.outgoing,
          incoming: reviewBrief.relationSummary.incoming,
        })}`}
        className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden rounded-full border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.06)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em]"
        data-testid="ontology-signal-rail"
        title={node.id}
      >
        <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-secondary)]">
          {t('signalLens')} · {t(`reviewLens.${reviewBrief.lens}`)}
        </span>
        <span className="shrink-0 text-[color:rgba(159,170,235,0.95)]">
          {t('reviewRelations', {
            outgoing: reviewBrief.relationSummary.outgoing,
            incoming: reviewBrief.relationSummary.incoming,
          })}
        </span>
        <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
          {t('signalAgentValue')}
        </span>
      </div>
      <nav
        aria-label={t('handoffAriaLabel')}
        className="mt-3 grid grid-cols-3 gap-1.5"
      >
        <Link
          href={topologyHref}
          aria-label={`${t('handoffBrowseLabel')} · ${t('handoffBrowseProof')}`}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform] duration-180 hover:-translate-y-0.5 hover:border-[color:rgba(94,106,210,0.36)] hover:bg-[color:rgba(94,106,210,0.07)] hover:text-[color:var(--color-text-primary)] motion-reduce:transform-none"
        >
          <span className="flex min-w-0 items-center justify-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <Network size={12} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.08em]">
              {t('handoffBrowseLabel')}
            </span>
          </span>
        </Link>
        <Link
          href={builderHref}
          aria-label={`${t('handoffWriteLabel')} · ${t('handoffWriteProof')}`}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform] duration-180 hover:-translate-y-0.5 hover:border-[color:rgba(94,106,210,0.36)] hover:bg-[color:rgba(94,106,210,0.07)] hover:text-[color:var(--color-text-primary)] motion-reduce:transform-none"
        >
          <span className="flex min-w-0 items-center justify-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <PencilLine size={12} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.08em]">
              {t('handoffWriteLabel')}
            </span>
          </span>
        </Link>
        <Link
          href={reviewBrief.handoffLinks.query}
          aria-label={`${t('handoffQueryLabel')} · ${t('handoffQueryProof')}`}
          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[10px] text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform] duration-180 hover:-translate-y-0.5 hover:border-[color:rgba(94,106,210,0.36)] hover:bg-[color:rgba(94,106,210,0.07)] hover:text-[color:var(--color-text-primary)] motion-reduce:transform-none"
        >
          <span className="flex min-w-0 items-center justify-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)]">
              <BarChart3 size={12} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
            </span>
            <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.08em]">
              {t('handoffQueryLabel')}
            </span>
          </span>
        </Link>
      </nav>
      {reachabilityQuerySlug ? (
        <div className="mt-2 rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.075)] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
              {t('proofPathTitle')}
            </span>
            <span className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.22)] px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
              {t('proofPathBadge')}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(['profile', 'impact', 'guard', 'sync'] as const).map((step, index) => {
              const copied = copiedProofStep === step;
              const stepLabel = t(`proofStep.${step}`);
              const stepCommand = t(`proofStepCommand.${step}`);
              return (
                <button
                  type="button"
                  key={step}
                  onClick={() => void copyProofStep(step)}
                  aria-label={t('proofStepCopyAria', { step: `${stepLabel} · ${stepCommand}` })}
                  title={stepCommand}
                  className={`min-w-0 rounded-md border px-1.5 py-1 text-left transition-[background-color,border-color,transform] duration-180 hover:-translate-y-0.5 hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.09)] active:translate-y-0 active:border-[color:rgba(94,106,210,0.50)] active:bg-[color:rgba(94,106,210,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset motion-reduce:transform-none ${
                    copied
                      ? "border-[color:rgba(73,190,146,0.42)] bg-[color:rgba(73,190,146,0.10)]"
                      : "border-[color:rgba(94,106,210,0.16)] bg-[color:var(--color-overlay-1)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {copied ? (
                      <Check size={9} className="text-[color:rgba(73,190,146,0.95)]" aria-hidden />
                    ) : (
                      <Clipboard size={9} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
                    )}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[9.5px] ${
                      copied
                        ? "text-[color:rgba(190,245,222,0.96)]"
                        : "text-[color:var(--color-text-secondary)]"
                    }`}
                  >
                    {copied ? t('proofStepCopied') : stepLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void copySelectedNodeProof()}
            className={`mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-[var(--font-weight-signature)] transition-[background-color,border-color,color,transform] duration-180 hover:-translate-y-0.5 active:translate-y-0 active:border-[color:rgba(94,106,210,0.62)] active:bg-[color:rgba(94,106,210,0.20)] motion-reduce:transform-none ${
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
      <div
        className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
        data-testid="ontology-relation-preview"
      >
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t('reviewRelationPreviewTitle')}
            </p>
            <span className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {t('reviewRelations', {
                outgoing: reviewBrief.relationSummary.outgoing,
                incoming: reviewBrief.relationSummary.incoming,
              })}
            </span>
          </div>
          <p className="truncate text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
            {t('reviewRelationPreviewDeck')}
          </p>
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
              const openRelationLabel = t('reviewRelationOpenNode', {
                title: row.title,
                direction: directionLabel,
                type: typeLabel,
              });
              const content = (
                <>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {directionLabel}
                  </span>
                  <span className="shrink-0 rounded-sm border border-[color:rgba(94,106,210,0.20)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]">
                    {typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
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
                      className="group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px] leading-5 text-[color:var(--color-text-secondary)] transition-[background-color,color] duration-180 hover:bg-[color:rgba(94,106,210,0.08)] hover:text-[color:var(--color-text-primary)] active:bg-[color:rgba(94,106,210,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
                    >
                      {content}
                      <ChevronRight
                        size={11}
                        className="shrink-0 text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-indigo-accent)]"
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5 px-1 py-0.5 text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
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
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
          {reviewBrief.sourceSlug && sourceEvidenceSlug ? (
            <Link
              href={buildDocsVaultHref({ slug: sourceEvidenceSlug })}
              className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5 transition-[border-color,color] hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset"
            >
              {t('reviewSource', { source: reviewBrief.sourceSlug })}
            </Link>
          ) : (
            <span className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5">
              {t('reviewSource', { source: t('reviewNoSource') })}
            </span>
          )}
          <span className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-2 py-0.5">
            {t('reviewRelationTypes', {
              types: reviewBrief.relationTypes.length > 0
                ? reviewBrief.relationTypes
                    .map((row) => `${edgeTypeLabel(row.type)} ${row.count}`)
                    .join(', ')
                : t('reviewNoRelationTypes'),
            })}
          </span>
        </div>
      </div>
      {/* review brief(렌즈·검토 질문·에이전트 점검 copy)도 기본 접힘 —
          power-user 핸드오프라 항상 펼쳐둘 필요 없음. 관계 미리보기까지가
          기본 compact 뷰. */}
      <details className="group mt-4" data-testid="ontology-review-detail">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
          <span>{t('reviewDetailDisclosure')}</span>
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
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
      </details>

      {/* 우측 패널 정보 과다 완화 — 가장 키 큰 섹션(도달성·ego 그래프·관련
          문서)을 기본 접힌 disclosure 로. 헤더·요약·핸드오프·관계 미리보기는
          항상 보이고, 깊은 그래프 분석은 한 번 펼쳐서 본다(progressive
          disclosure, 디자인 시스템의 compact-first 원칙). */}
      <details className="group mt-4" data-testid="ontology-graph-detail">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
          <span>{t('graphDetailDisclosure')}</span>
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
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
              const relationLabel = edgeTypeLabel(neighbor.edge.label ?? neighbor.edge.type);
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
      </details>

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
    </motion.aside>
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

function TreeProjectionWarnings({ warnings }: { warnings: string[] }) {
  const t = useTranslations("ontologyView.treeWarnings");
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "raw">("summary");
  const summary = useMemo(
    () => summarizeTreeProjectionWarnings(warnings),
    [warnings],
  );
  const preview = warnings.slice(0, 3);
  const hiddenCount = Math.max(0, warnings.length - preview.length);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <section
      id="tree-data-warnings"
      className="mt-4 scroll-mt-24 rounded-lg border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.045)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(238,198,128,0.95)]">
            {t("eyebrow")}
          </span>
          <span className="mt-1 block break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("title", { count: warnings.length })}
          </span>
        </div>
        <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
          <span className="inline-flex h-9 items-center justify-center rounded-md border border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.07)] px-2 py-1 font-mono text-[10px] text-[color:rgba(238,198,128,0.95)]">
            {t("badge")}
          </span>
          <button
            id="tree-data-warnings-open"
            type="button"
            onClick={() => {
              setActiveTab("summary");
              setOpen(true);
            }}
            aria-label={t("openAria", { count: warnings.length })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(255,179,71,0.26)] bg-[color:rgba(255,179,71,0.08)] px-3 text-[11px] text-[color:rgba(238,198,128,0.95)] transition-colors hover:border-[color:rgba(255,179,71,0.42)] hover:bg-[color:rgba(255,179,71,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,179,71,0.34)] focus-visible:ring-inset"
          >
            <Search size={12} aria-hidden />
            {t("openDetails")}
          </button>
        </div>
      </div>
      <p className="mt-3 max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
        {t("body")}
      </p>
      {summary.groups.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.groups.map((group) => (
            <TreeProjectionWarningGroupChip key={group.kind} group={group} />
          ))}
        </div>
      ) : null}
      {hiddenCount > 0 ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          {t("hidden", { count: hiddenCount })}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
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
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(0,0,0,0.58)] px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
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
                onClick={() => setOpen(false)}
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
                    onClick={() => setActiveTab(tab)}
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
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {summary.groups.map((group) => (
                    <TreeProjectionWarningGroupChip key={group.kind} group={group} />
                  ))}
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
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-[color:rgba(255,179,71,0.16)] bg-[color:rgba(0,0,0,0.10)] px-2.5 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t(`${group.kind}.label`)}
        </span>
        <span className="shrink-0 rounded border border-[color:rgba(255,179,71,0.22)] bg-[color:rgba(255,179,71,0.06)] px-1.5 font-mono text-[10px] text-[color:rgba(238,198,128,0.95)]">
          {group.count}
        </span>
      </div>
      <p className="mt-1 min-w-0 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        {t(`${group.kind}.hint`)}
      </p>
      {group.examples.length > 0 ? (
        <p className="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap break-all font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
          {group.examples.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
