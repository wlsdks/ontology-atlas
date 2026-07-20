"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import {
  filterTreeByNodeIds,
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { FirstRunStarterModule } from "@/features/first-run-starter";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import {
  TopologyIndexAgentHandoff,
  type TopologyIndexAgentHandoffLabels,
} from "./TopologyIndexAgentHandoff";

export interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
  agentSync: string;
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  emptyHint: string;
  /** P4a — 렌즈 세그먼트 "전체". */
  segmentAll: string;
  /** P4a — 렌즈 세그먼트 "최근 변경 N"(호출자가 count 를 이미 포맷). */
  segmentRecent: string;
  segmentRecentAria: string;
  /** P4a — "최근 변경" 렌즈가 활성인데 결과가 0일 때. */
  recentEmptyHint: string;
  /** P4b — heartbeat 귀속 배지. */
  agentBadge: string;
  /** P4c — "지도에 없는 문서 N개"(호출자가 count 를 이미 포맷). */
  uncatalogedDocsLabel: string;
  uncatalogedDocsAction: string;
}

export interface TopologyIndexPanelProps {
  treeResult: OntologyTreeBuildResult;
  totalConcepts: number;
  totalRelations: number;
  domainCount: number;
  changedSlugs: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onCollapse: () => void;
  /** P2a — 푸터의 에이전트 상태를 눌러 "AI 에이전트 연결" 시트를 연다. */
  onOpenAgentConnect?: (() => void) | null;
  labels: TopologyIndexPanelLabels;
  className?: string;
  /** 푸터 "에이전트 동기화" 뒤에 붙는 성장 신호 조각(예: " · 이번 주 +1") —
   *  이미 해석된 문자열을 그대로 받는다(HomePage 의 growthLabel 과 같은
   *  출처, feat/chrome-system §9 헤더→푸터 이관). */
  footerGrowthText?: string;
  /** 푸터 "인계" 메뉴 — brief/재분석 지시/동기화 게이트 3종 복사 (W3 분석
   *  보기 은퇴, `TopologyAnalysisBar` overview 모드에서 이관). 텍스트는
   *  HomePage 가 `views/home/lib/topology-analysis.ts` 포맷터로 미리
   *  조립해 전달 — 이 위젯은 복사 UI만 소유한다. 생략하면 메뉴 자체를
   *  렌더하지 않는다. */
  agentHandoff?: {
    briefText: string;
    reanalyzeText: string;
    syncText: string;
    labels: TopologyIndexAgentHandoffLabels;
  };
  /**
   * P4a — "최근 변경" 렌즈(mtime 7일 창, `useRecentChanges`). 생략하면 세그먼트
   * 컨트롤 자체를 렌더하지 않는다(기존 검색-only 동작 그대로). 활성화하면
   * `filterTreeByNodeIds` 로 트리를 이 id 집합 + 조상 경로만으로 좁힌다 —
   * `filterTreeByQuery` 와 같은 "부모 chain 보존" 필터 메커니즘 재사용.
   */
  recentChanges?: {
    ids: ReadonlySet<string>;
    /** P4b — fresh heartbeat 의 focus 와 일치하는 노드(있다면) 하나. */
    agentAttributedNodeId: string | null;
  } | null;
  /** P4c — vault 에 있지만 아직 kind 없는(=지도에 없는) 문서 수. */
  uncatalogedDocCount?: number;
  /** P4c — 위 행 클릭 → "내 문서로 지도 만들기" 다이얼로그(`bootstrapOpen`). */
  onPromoteUncatalogedDocs?: (() => void) | null;
  /**
   * Guardian I-1 — 도메인 크기 단일 진실원(그래프 BFS, `computeDomainCensusRows`)
   * 조회 맵. 있으면 도메인 행 카운트/미터가 이 값을 쓴다 — /projects·인사이트와
   * 같은 숫자. 생략하면 종전 트리 워크 유지.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
}

/**
 * INDEX — the left machined instrument that replaces the tree/ego `/ontology`
 * page (B3 허브가 곧 지도). Floats over the topology map, `--topology-index-*`
 * width/inset tokens (`app/globals.css`). See
 * `docs/prototypes/index-panel-v2-full.html` (v2.1) for the approved visual
 * spec and `TopologyIndexTab` for the collapsed counterpart.
 *
 * v2.1 (feat/chrome-system §9) — header 는 "INDEX · N"(N=노드 총수) + 접기
 * 정사각 버튼만 남기고, 구 헤더의 "● 에이전트 동기화" 문구는 푸터로
 * 옮겼다(footerGrowthText 와 함께). 트리 행 자체의 grid/캐럿/미터 스타일은
 * `TopologyIndexTreeRow` 가 소유.
 *
 * Search reuses `filterTreeByQuery` (`@/shared/lib/ontology-tree`) — the
 * SAME pure filter the old `/ontology` tree used — instead of a bespoke
 * matcher, so "search narrows the tree, keeping ancestor chains" behavior
 * can't drift between surfaces.
 */
export function TopologyIndexPanel({
  treeResult,
  totalConcepts,
  totalRelations,
  domainCount,
  changedSlugs,
  selectedId,
  onSelect,
  onCollapse,
  labels,
  className,
  footerGrowthText,
  agentHandoff,
  recentChanges = null,
  uncatalogedDocCount,
  onPromoteUncatalogedDocs = null,
  onOpenAgentConnect = null,
  domainCensus = null,}: TopologyIndexPanelProps) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(treeResult.roots.map((root) => root.node.id)),
  );
  // P4a — "최근 변경" 렌즈. 검색이 활성이면 검색이 우선한다(둘을 동시에 좁히면
  // "왜 안 보이지"가 두 원인으로 갈라져 헷갈린다) — 렌즈는 검색이 비어 있을
  // 때만 트리를 좁힌다.
  const [lens, setLens] = useState<"all" | "recent">("all");
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;
  const lensActive = !isFiltering && lens === "recent" && recentChanges !== null;

  const visibleRoots = useMemo(() => {
    if (isFiltering) return filterTreeByQuery(treeResult.roots, trimmedQuery);
    if (lensActive && recentChanges) return filterTreeByNodeIds(treeResult.roots, recentChanges.ids);
    return treeResult.roots;
  }, [treeResult.roots, isFiltering, trimmedQuery, lensActive, recentChanges]);
  const maxDomainDescendantCount = useMemo(() => {
    // 미터 분모도 같은 진실원에서 — census 가 있으면 BFS total 의 최댓값.
    if (domainCensus && domainCensus.size > 0) {
      let max = 0;
      for (const row of domainCensus.values()) {
        if (row.total > max) max = row.total;
      }
      return max;
    }
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots, domainCensus]);

  const toggleOpen = (nodeId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  // 검색과 마찬가지로 렌즈 활성 시에도 자동 펼침 — 좁혀진 조상 경로를 사용자가
  // 일일이 캐럿으로 열지 않게 한다(filterTreeByQuery 의 "auto-reveal matches"
  // 와 같은 UX 계약, filterTreeByNodeIds 결과에도 그대로 적용).
  const isOpen = (nodeId: string) => isFiltering || lensActive || openIds.has(nodeId);

  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* "시작하기" 모듈 (root-first-open v3, `first-run-v3-flagship.html`) —
          vault 미선택 + 정적 모드 + 세션 내 미dismiss 일 때만 자체 렌더,
          그 외엔 null. INDEX 패널 자체의 prop 표면은 안 늘어난다 — 이미
          받는 census(totalConcepts/totalRelations/domainCount)를 그대로
          넘길 뿐, 표시 여부/액션은 모듈이 스스로 결정한다. */}
      <FirstRunStarterModule
        concepts={totalConcepts}
        relations={totalRelations}
        domains={domainCount}
      />
      {/* v2.1 헤더 — 라벨 + 실측 총수 + 접기만. 에이전트 동기화 상태는
          푸터로 이관(아래) — 헤더는 "이 패널이 무엇인지", 푸터는 "언제
          마지막으로 살아있었는지"를 말한다.

          헤더 행 전체가 접기 토글이다 (소유자 피드백 — 셰브론만 히트 영역이라
          불편했다). INDEX 트리 행과 같은 hover 문법
          (`--topology-v2-panel-row-hover` 배경, `transition-colors`) 을 그대로
          재사용해 "이것도 클릭 가능한 행이다" 를 같은 언어로 말한다. 셰브론은
          더 이상 별도 버튼이 아니라 상태 표시자(`aria-hidden`)로만 남는다 —
          중첩 인터랙티브 엘리먼트를 피하기 위해 바깥 `<button>` 하나로 접는다. */}
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded={true}
        aria-label={labels.foldAria}
        title={labels.fold}
        data-testid="topology-index-fold"
        className="group mb-3 flex w-full cursor-pointer items-center gap-1.5 rounded-[var(--chrome-radius-inner)] px-0.5 text-left transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.label}
        </span>
        {/* 수렴 판정 ①: 시각 카운트 "· N" 삭제 — 지형도 HUD 가 이미 라벨과
            함께 총수를 상시 노출해 3중 중복이었다 (sr-only census 는 존치).
            판정 ②/③: 셰브론은 보더 박스가 아니라 quiet glyph — 히트영역은
            행 전체(소유자 피드백 보존), 방향은 접힘 결과와 일치하는 ‹. */}
        <span
          aria-hidden="true"
          className="ml-auto inline-flex size-[26px] shrink-0 items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors group-hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </span>
      </button>
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-3 shrink-0">
        <Search
          size={11}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--topology-v2-panel-text-quaternary)]"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-index-search"
          className="w-full rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-canvas)] py-1.5 pl-7 pr-2.5 text-[12px] text-[color:var(--topology-v2-panel-text-primary)] outline-none transition-colors placeholder:text-[color:var(--topology-v2-panel-text-quaternary)] focus:border-[color:var(--topology-v2-indigo)]"
        />
      </div>

      {/* P4a — "전체 | 최근 변경 N" 렌즈 세그먼트. `recentChanges` 를 안 받으면
          (mode 가 아직 못 계산했거나 호출자가 생략) 렌더 자체를 skip —
          기존 검색-only 동작 그대로 유지된다. */}
      {recentChanges ? (
        <div
          role="tablist"
          aria-label={labels.segmentRecentAria}
          className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!lensActive}
            data-testid="topology-index-segment-all"
            onClick={() => setLens("all")}
            className={`min-w-0 rounded-[var(--chrome-radius-inner)] px-2 py-1 text-[11px] transition-colors ${
              !lensActive
                ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
                : "text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
            }`}
          >
            {labels.segmentAll}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lensActive}
            data-testid="topology-index-segment-recent"
            onClick={() => setLens("recent")}
            className={`min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-[11px] transition-colors ${
              lensActive
                ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
                : "text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
            }`}
          >
            {labels.segmentRecent}
          </button>
        </div>
      ) : null}

      <nav
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        className="min-h-0 flex-1 space-y-px overflow-y-auto"
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
            {lensActive ? labels.recentEmptyHint : labels.emptyHint}
          </p>
        ) : (
          visibleRoots.map((root) => (
            <TopologyIndexTreeRow
              key={root.node.id}
              entry={root}
              depth={0}
              isOpen={isOpen}
              onToggleOpen={toggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              changedSlugs={changedSlugs}
              agentAttributedNodeId={recentChanges?.agentAttributedNodeId ?? null}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              labels={labels}
            />
          ))
        )}
      </nav>

      {/* P4c — "지도에 없는 문서 N개" 조용한 행. `bootstrapPlan.elements.length`
          (HomePage, `deriveBootstrapPlan` — 이미 kind 있는 문서는 제외된
          카운트) 를 그대로 받는다 — 새 파생 없음. 0 이거나 승격 핸들러가
          없으면 행 자체를 숨긴다. */}
      {uncatalogedDocCount && uncatalogedDocCount > 0 && onPromoteUncatalogedDocs ? (
        <button
          type="button"
          onClick={onPromoteUncatalogedDocs}
          data-testid="topology-index-uncataloged-docs"
          className="mt-2 flex shrink-0 items-center gap-2 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.uncatalogedDocsLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.uncatalogedDocsAction}
          </span>
        </button>
      ) : null}

      {/* v2.1 푸터 — 구 헤더의 "● 에이전트 동기화" 문구 + 성장 신호가
          여기로 이관. 단축키 캡은 장식(⇧⌘K 는 전역 팔레트가 이미 쓰는
          hotkey — 여기선 재확인용 표기, 별도 바인딩 아님). */}
      <div
        data-testid="topology-index-footer"
        className="mt-2.5 flex shrink-0 items-center gap-1.5 border-t border-[color:var(--topology-v2-panel-divider)] px-1 pt-2.5 text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]"
      >
        <button
          type="button"
          onClick={onOpenAgentConnect ?? undefined}
          disabled={!onOpenAgentConnect}
          data-testid="topology-index-agent-connect"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--chrome-radius-inner)] px-0.5 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-[color:var(--topology-v2-panel-row-hover)] enabled:hover:text-[color:var(--topology-v2-panel-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
        >
          <span
            aria-hidden="true"
            className="h-[5px] w-[5px] shrink-0 rounded-full bg-[color:var(--topology-v2-panel-power-on)]"
          />
          <span className="text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.agentSync}
          </span>
        </button>
        {footerGrowthText ? <span>{footerGrowthText}</span> : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {agentHandoff ? (
            <TopologyIndexAgentHandoff
              briefText={agentHandoff.briefText}
              reanalyzeText={agentHandoff.reanalyzeText}
              syncText={agentHandoff.syncText}
              labels={agentHandoff.labels}
            />
          ) : null}
          <span
            aria-hidden="true"
            className="shrink-0 rounded border border-[color:var(--topology-v2-panel-border)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            ⇧⌘K
          </span>
        </div>
      </div>
    </aside>
  );
}
