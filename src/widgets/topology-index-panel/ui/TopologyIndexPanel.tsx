"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Search } from "lucide-react";
import {
  filterTreeByQuery,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";

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
  labels: TopologyIndexPanelLabels;
  className?: string;
  /** 푸터 "에이전트 동기화" 뒤에 붙는 성장 신호 조각(예: " · 이번 주 +1") —
   *  이미 해석된 문자열을 그대로 받는다(HomePage 의 growthLabel 과 같은
   *  출처, feat/chrome-system §9 헤더→푸터 이관). */
  footerGrowthText?: string;
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
}: TopologyIndexPanelProps) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(treeResult.roots.map((root) => root.node.id)),
  );
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;

  const visibleRoots = useMemo(
    () => (isFiltering ? filterTreeByQuery(treeResult.roots, trimmedQuery) : treeResult.roots),
    [treeResult.roots, isFiltering, trimmedQuery],
  );
  const maxDomainDescendantCount = useMemo(() => {
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots]);

  const toggleOpen = (nodeId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const isOpen = (nodeId: string) => isFiltering || openIds.has(nodeId);

  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* v2.1 헤더 — 라벨 + 실측 총수 + 접기만. 에이전트 동기화 상태는
          푸터로 이관(아래) — 헤더는 "이 패널이 무엇인지", 푸터는 "언제
          마지막으로 살아있었는지"를 말한다. */}
      <div className="mb-2.5 flex items-center gap-1.5 border-b border-[color:var(--topology-v2-panel-divider)] px-0.5 pb-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.label}
        </span>
        <span className="font-mono text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">
          · {totalConcepts}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={labels.foldAria}
          title={labels.fold}
          data-testid="topology-index-fold"
          className="ml-auto inline-flex size-[26px] shrink-0 items-center justify-center rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronUp size={13} aria-hidden="true" />
        </button>
      </div>
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-2 shrink-0">
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

      <nav
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto"
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
            {labels.emptyHint}
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
              maxDomainDescendantCount={maxDomainDescendantCount}
              labels={labels}
            />
          ))
        )}
      </nav>

      {/* v2.1 푸터 — 구 헤더의 "● 에이전트 동기화" 문구 + 성장 신호가
          여기로 이관. 단축키 캡은 장식(⇧⌘K 는 전역 팔레트가 이미 쓰는
          hotkey — 여기선 재확인용 표기, 별도 바인딩 아님). */}
      <div
        data-testid="topology-index-footer"
        className="mt-2 flex shrink-0 items-center gap-1.5 border-t border-[color:var(--topology-v2-panel-divider)] px-1 pt-2.5 text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]"
      >
        <span
          aria-hidden="true"
          className="h-[5px] w-[5px] shrink-0 rounded-full bg-[color:var(--topology-v2-panel-power-on)]"
        />
        <span className="text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.agentSync}
        </span>
        {footerGrowthText ? <span>{footerGrowthText}</span> : null}
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 rounded border border-[color:var(--topology-v2-panel-border)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          ⇧⌘K
        </span>
      </div>
    </aside>
  );
}
