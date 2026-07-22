"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CornerUpRight, Search } from "lucide-react";
import {
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeNode,
} from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";

/** 결계 관계 한 줄 — 이미 i18n 라벨까지 조립된 표시용 행(HomePage 가 만든다). */
export interface RealmBoundaryRow {
  edgeId: string;
  fromTitle: string;
  toTitle: string;
  /** 관계 타입의 평문 라벨(예: "의존") — HomePage 의 relationVocabulary 로 조립. */
  relationLabel: string;
  outsideId: string;
  jumpRealmId: string;
}

export interface TopologyRealmLedgerLabels {
  /** 상단 eyebrow — "영역". */
  label: string;
  /** 영역 census 조각 라벨. */
  elementsShort: string;
  capabilitiesShort: string;
  depthShort: string;
  /** 영역 트리 검색 placeholder. */
  searchPlaceholder: string;
  /** "영역 해제" 텍스트 버튼. */
  exit: string;
  exitAria: string;
  /** 트리가 비었을 때(검색 결과 0 등) 한 줄 문구. */
  emptyHint: string;
  /** "바깥과 닿은 관계 N"(HomePage 가 count 포맷) — 기본 접힘 요약 한 줄. */
  boundaryHeading: string;
  boundaryToggleAria: string;
  /** "이 영역으로 이동" 행 호버 액션. */
  boundaryJump: string;
  boundaryJumpAria: string;
  /** 영역이 완전히 고립됐을 때 한 줄 문구. */
  boundaryEmpty: string;
  // TopologyIndexTreeRow 로 넘길 트리 행 라벨.
  freshTitle: string;
  domainCountTitle: string;
}

export interface TopologyRealmLedgerProps {
  /** 영역 루트 노드 — 헤더 글리프/제목. */
  rootKind: string;
  rootTitle: string;
  /** 영역 census 조각(요소/역량/깊이). HomePage 가 파생. */
  census: { elementCount: number; capabilityCount: number; depth: number };
  /** 영역 서브트리 — 루트의 자식들이 트리 최상위 행이 된다. */
  subtree: OntologyTreeNode;
  /** 경계 엣지 표시 행(상위 몇 개). */
  boundaryRows: RealmBoundaryRow[];
  /** 경계 엣지 총수(행 슬라이스와 무관한 전체). */
  boundaryTotal: number;
  selectedId: string | null;
  changedSlugs: ReadonlySet<string>;
  onSelect: (nodeId: string) => void;
  onExit: () => void;
  onJumpRealm: (realmId: string) => void;
  maxDomainDescendantCount: number;
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  labels: TopologyRealmLedgerLabels;
  className?: string;
}

/**
 * 영역 대장(Realm Ledger) — 영역 전개(`?realm=slug`) 중 좌측 패널이 전역 INDEX
 * 대신 **이 노드의 세계만** 보여주는 변신 표면(S7, fable 설계 + 소유자 절제
 * 지시). 전역 첫 실행 카드·전역 census·전역 트리·전역 푸터는 전부 숨고, 정확히
 * 세 덩어리만 남는다:
 *
 *   1. 헤더 — 루트 글리프 + 제목 + census 한 줄 + 조용한 "영역 해제" 텍스트.
 *   2. 영역 트리 — 루트 서브트리만(검색 포함).
 *   3. 결계 관계 — 기본 접힘 요약 한 줄("바깥과 닿은 관계 N"), 펼쳐야 리스트.
 *
 * 절제 계약(소유자 반려 기준): 박스 안 박스 없음(섹션 구분은 caps eyebrow +
 * 여백 + 헤어라인 divider 하나), 뱃지/칩 수프 없음(census 한 줄 텍스트, 점프는
 * 행 호버에만 드러나는 조용한 액션), 빈 상태는 문구 한 줄. 전역
 * `TopologyIndexPanel` 과 같은 `--topology-v2-panel-*` / `--topology-index-*`
 * 토큰·같은 aside 셸·같은 `TopologyIndexTreeRow` 를 재사용한다 — 콘텐츠만 영역
 * 스코프로 좁힌 자매 패널.
 */
export function TopologyRealmLedger({
  rootKind,
  rootTitle,
  census,
  subtree,
  boundaryRows,
  boundaryTotal,
  selectedId,
  changedSlugs,
  onSelect,
  onExit,
  onJumpRealm,
  maxDomainDescendantCount,
  domainCensus = null,
  labels,
  className,
}: TopologyRealmLedgerProps) {
  const [query, setQuery] = useState("");
  // 영역 트리 최상위 = 루트의 직속 자식들(루트 자신은 헤더가 이미 이름).
  const childRoots = subtree.children;
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(childRoots.map((child) => child.node.id)),
  );
  // 결계 관계는 기본 접힘 — 기본 화면은 헤더+트리 두 덩어리만 보이는 정갈함.
  const [boundaryOpen, setBoundaryOpen] = useState(false);
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;

  const visibleRoots = useMemo(
    () => (isFiltering ? filterTreeByQuery(childRoots, trimmedQuery) : childRoots),
    [childRoots, isFiltering, trimmedQuery],
  );

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
      data-testid="topology-realm-ledger"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* ── 1. 헤더 ── caps eyebrow + 제목 + census 한 줄 + 조용한 해제. */}
      <header className="mb-3 shrink-0 px-0.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.label}
          </span>
          <button
            type="button"
            onClick={onExit}
            aria-label={labels.exitAria}
            data-testid="topology-realm-exit"
            className="shrink-0 rounded-[var(--chrome-radius-inner)] px-1 py-0.5 text-label text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
          >
            {labels.exit}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            <TopologyV2KindGlyph kind={rootKind} size={15} />
          </span>
          <p
            data-testid="topology-realm-title"
            className="min-w-0 flex-1 truncate text-body-lg font-medium text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {rootTitle}
          </p>
        </div>
        <p
          data-testid="topology-realm-census"
          className="mt-1 truncate font-mono text-caption text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {labels.elementsShort} {census.elementCount} · {labels.capabilitiesShort}{" "}
          {census.capabilityCount} · {labels.depthShort} {census.depth}
        </p>
      </header>

      {/* 영역 스코프 검색 — 트리 섹션에 속한 필터(별도 카드 아님). */}
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
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-realm-search"
          className="w-full rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-canvas)] py-1.5 pl-7 pr-2.5 text-body text-[color:var(--topology-v2-panel-text-primary)] outline-none transition-colors placeholder:text-[color:var(--topology-v2-panel-text-quaternary)] focus:border-[color:var(--topology-v2-indigo)]"
        />
      </div>

      {/* ── 2. 영역 트리 ── 루트 서브트리만, 깊이 들여쓰기. */}
      <nav
        role="tree"
        aria-label={labels.label}
        data-testid="topology-realm-tree"
        className="min-h-0 flex-1 space-y-px overflow-y-auto"
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
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
              domainCensus={domainCensus}
              labels={{
                capabilitiesShort: labels.capabilitiesShort,
                elementsShort: labels.elementsShort,
                freshTitle: labels.freshTitle,
                domainCountTitle: labels.domainCountTitle,
              }}
            />
          ))
        )}
      </nav>

      {/* ── 3. 결계 관계 ── 헤어라인 하나로 구분, 기본 접힘 요약 한 줄. */}
      <div
        data-testid="topology-realm-boundary"
        className="mt-2.5 shrink-0 border-t border-[color:var(--topology-v2-panel-divider)] pt-2"
      >
        {boundaryTotal === 0 ? (
          <p className="px-1 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
            {labels.boundaryEmpty}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setBoundaryOpen((open) => !open)}
              aria-expanded={boundaryOpen}
              aria-label={labels.boundaryToggleAria}
              data-testid="topology-realm-boundary-toggle"
              className="flex w-full items-center gap-1.5 rounded-[var(--chrome-radius-inner)] px-1 py-0.5 text-left transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
            >
              <span className="min-w-0 flex-1 truncate text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                {labels.boundaryHeading}
              </span>
              <ChevronDown
                size={12}
                aria-hidden="true"
                className={`shrink-0 text-[color:var(--topology-v2-panel-text-quaternary)] transition-transform ${boundaryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {boundaryOpen ? (
              <ul className="mt-1 max-h-[132px] space-y-px overflow-y-auto">
                {boundaryRows.map((row) => (
                  <li
                    key={row.edgeId}
                    data-testid="topology-realm-boundary-row"
                    className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                      <span className="text-[color:var(--topology-v2-panel-text-primary)]">
                        {row.fromTitle}
                      </span>
                      <span className="mx-1 text-[color:var(--topology-v2-panel-text-quaternary)]">→</span>
                      <span className="text-[color:var(--topology-v2-panel-text-primary)]">
                        {row.toTitle}
                      </span>
                      <span className="ml-1 text-[color:var(--topology-v2-panel-text-quaternary)]">
                        ({row.relationLabel})
                      </span>
                    </span>
                    {/* 조용한 액션 — 행 호버/포커스 시에만 드러난다(상시 버튼 나열 금지). */}
                    <button
                      type="button"
                      onClick={() => onJumpRealm(row.jumpRealmId)}
                      aria-label={labels.boundaryJumpAria}
                      title={labels.boundaryJump}
                      data-testid="topology-realm-boundary-jump"
                      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--chrome-radius-inner)] px-1.5 py-0.5 text-label text-[color:var(--color-indigo-accent)] opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset group-hover:opacity-100 motion-reduce:transition-none"
                    >
                      <CornerUpRight size={11} aria-hidden="true" />
                      {labels.boundaryJump}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
