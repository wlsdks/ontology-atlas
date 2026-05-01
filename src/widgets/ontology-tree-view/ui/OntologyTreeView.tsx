"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";
import { getOntologyKindIcon, getOntologyKindLabel } from "@/entities/ontology-class";
import { ManualSourceChip } from "@/entities/knowledge-graph";
import {
  filterTreeByQuery,
  flattenTree,
  UNKNOWN_TONE,
  type OntologyTreeBuildResult,
  type OntologyTreeNode,
} from "@/shared/lib/ontology-tree";
import {
  sortRoots,
  ONTOLOGY_ROOT_SORT_LABEL,
  type OntologyRootSortKey,
} from "../lib/sort-roots";

export interface OntologyTreeViewProps {
  result: OntologyTreeBuildResult;
  /** 빈 상태 메시지 — 데이터가 아직 없을 때. */
  emptyHint?: string;
  /** 시작 시 모든 노드 펼침 여부. 기본 true. */
  defaultExpanded?: boolean;
  /** 행 클릭 콜백 — 상세 패널로 라우팅 등에 사용. */
  onSelect?: (node: OntologyTreeNode["node"]) => void;
}

const KIND_TONE: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  project: {
    bg: "rgba(94,106,210,0.14)",
    text: "rgba(159,170,235,0.95)",
    border: "rgba(94,106,210,0.35)",
  },
  domain: {
    bg: "var(--color-border-soft)",
    text: "var(--color-text-secondary)",
    border: "var(--color-border-strong)",
  },
  capability: {
    bg: "var(--color-overlay-2)",
    text: "var(--color-text-tertiary)",
    border: "var(--color-overlay-3)",
  },
  element: {
    bg: "var(--color-overlay-1)",
    text: "var(--color-text-quaternary)",
    border: "var(--color-divider)",
  },
  // 근거 문서 — 트리에서는 제외되지만 orphans 영역·검색 결과 등에서 chip 사용.
  // 무채색 액센트 (warm gray) 한 톤.
  document: {
    bg: "rgba(255,242,224,0.04)",
    text: "var(--color-text-tertiary)",
    border: "rgba(255,242,224,0.12)",
  },
  // stub placeholder — 검수자 주의 환기. UNKNOWN_TONE token 으로 통일
  // (트리 chip · orphan 카드 · ego graph 모두 같은 hue).
  unknown: {
    bg: UNKNOWN_TONE.chipBg,
    text: UNKNOWN_TONE.chipText,
    border: UNKNOWN_TONE.chipBorder,
  },
};

function KindChip({ kind }: { kind: string }) {
  const tone = KIND_TONE[kind] ?? KIND_TONE.element!;
  // T35 — kind 별 lucide icon. Phase 4 (비개발자 친화) — 시각 직관 보강.
  // 색은 chip tone 의 text color 이미 currentColor — 추가 색 도입 0.
  const Icon = getOntologyKindIcon(kind);
  return (
    <span
      className="inline-flex items-center gap-1 break-keep rounded-full border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em]"
      style={{ backgroundColor: tone.bg, color: tone.text, borderColor: tone.border }}
    >
      <Icon size={10} aria-hidden />
      {getOntologyKindLabel(kind)}
    </span>
  );
}

/**
 * 노드의 evidence 수 chip — V1.0 모델의 강점 가시화 (기획자 audit F6).
 * evidence 0 일 때는 미렌더 (chip 노이즈 차단). hover 시 "이 노드의 출처 N개"
 * 라는 native title 툴팁.
 */
function EvidenceCountChip({ count }: { count: number | undefined }) {
  if (!count || count <= 0) return null;
  return (
    <span
      data-testid="ontology-tree-evidence-chip"
      data-evidence-count={count}
      title={`이 노드의 근거 (evidence) ${count}개 — 클릭해서 상세 보기`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-[1px] font-mono text-[9px] tracking-[0.04em] text-[color:var(--color-indigo-accent)]"
    >
      <span aria-hidden>◆</span>
      {count}
    </span>
  );
}

function TreeRow({
  treeNode,
  expanded,
  onToggle,
  onSelect,
}: {
  treeNode: OntologyTreeNode;
  expanded: boolean;
  onToggle: () => void;
  onSelect?: (node: OntologyTreeNode["node"]) => void;
}) {
  const hasChildren = treeNode.children.length > 0;
  // depth 0 = root → 0 padding. 그 후 16px 씩 들여쓰기.
  const indent = treeNode.depth * 16;
  // UX-11 — element kind 노드는 default dim 처리해 project / domain /
  // capability 가 시각적으로 떠오르게. hover/focus 시 opacity 회복.
  // 운영 데이터 분포 기준 element 454 / capability 115 / domain 21 /
  // project 19 / document 13 — element 가 70% 점유라 평탄한 위계 mitigation.
  const isElementKind = treeNode.node.kind === "element";
  const dimClass = isElementKind
    ? "opacity-60 hover:opacity-100 focus-within:opacity-100 transition-opacity"
    : "";
  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={false}
      data-testid="ontology-tree-row"
      data-kind={treeNode.node.kind}
      data-depth={treeNode.depth}
      data-dim={isElementKind ? "true" : "false"}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[color:var(--color-overlay-2)] ${dimClass}`}
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "접기" : "펼치기"}
          className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--color-text-quaternary)] hover:bg-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-secondary)]"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span className="inline-block h-5 w-5" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onSelect?.(treeNode.node)}
        className="flex flex-1 items-center gap-2 break-keep text-left text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
      >
        <KindChip kind={treeNode.node.kind} />
        <span className="truncate">{treeNode.node.title}</span>
        <ManualSourceChip source={treeNode.node.source} size="compact" />
        <EvidenceCountChip count={treeNode.node.evidenceCount} />
        {/* UX-16: 첫 번째 projectIds 를 quaternary mono chip 으로 — 외부
            visitor 가 어느 프로젝트에 속하는지 즉시 인지. 다중 project
            은 truncate, project / document kind 자체는 자기참조라 제외
            (chip 노이즈 차단). 색은 무채색 — 헌장 단일 인디고 정책 보존. */}
        <ProjectIdChip
          kind={treeNode.node.kind}
          projectIds={treeNode.node.projectIds}
        />
      </button>
    </div>
  );
}

/**
 * 행 끝에 노드의 첫 projectIds 를 mono chip 으로 표시. UX-16.
 *
 * 정책:
 * - project / document kind 는 자기참조 (project 가 자기 slug 를 갖는
 *   경우) 또는 메타라 chip 노이즈 차단 — 미렌더.
 * - projectIds 비어 있으면 미렌더.
 * - 다중 project 면 첫 1 개 표시 + `+N` suffix.
 * - 색은 무채색 quaternary — 헌장 단일 인디고 보존.
 */
function ProjectIdChip({
  kind,
  projectIds,
}: {
  kind: string;
  projectIds: ReadonlyArray<string> | undefined;
}) {
  if (kind === "project" || kind === "document") return null;
  if (!projectIds || projectIds.length === 0) return null;
  const first = projectIds[0]!;
  const extra = projectIds.length - 1;
  return (
    <span
      data-testid="ontology-tree-project-chip"
      data-project-id={first}
      className="ml-auto shrink-0 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-[9px] tracking-[0.04em] text-[color:var(--color-text-quaternary)]"
      title={extra > 0 ? `${first} (+${extra} 다른 프로젝트)` : first}
    >
      <span className="truncate">{first}</span>
      {extra > 0 ? (
        <span className="ml-0.5 text-[color:var(--color-text-quaternary)]">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

export function OntologyTreeView({
  result,
  emptyHint = "아직 승인된 ontology 노드가 없어요.",
  defaultExpanded = true,
  onSelect,
}: OntologyTreeViewProps) {
  // expand 상태 — 노드 ID 단위. defaultExpanded 면 처음 모두 펼침.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // defaultExpanded=false 시 처음 모든 children-있는 노드를 collapsed 로 시작.
  // 단순 v0 구현: defaultExpanded 변경 무시.

  // inline 검색 — ⌘K 글로벌 검색과 별개로 트리 안 빠른 좁히기.
  // 매치 노드 + 부모 chain 보존, 형제 제외.
  const [searchQuery, setSearchQuery] = useState("");
  // Fire 2 — 사용자가 트리 정렬을 직접 고름. 기본은 UX-12 의 kind 우선.
  // 'evidence-desc' 는 "내 ontology 어디에 자료 많이 쌓였나" 발견용,
  // 'title' 은 알파벳 직접 lookup. 페이지 reload 마다 default 로 회귀.
  const [sortKey, setSortKey] = useState<OntologyRootSortKey>("kind-title");
  const sortedRoots = useMemo(
    () => sortRoots(result.roots, sortKey),
    [result.roots, sortKey],
  );
  const filteredRoots = useMemo(
    () => filterTreeByQuery(sortedRoots, searchQuery),
    [sortedRoots, searchQuery],
  );
  const filteredOrphans = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed === "") return result.orphans;
    return result.orphans.filter((n) => n.title.toLowerCase().includes(trimmed));
  }, [result.orphans, searchQuery]);
  const isFiltering = searchQuery.trim() !== "";

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isCollapsed = (id: string) => {
    if (defaultExpanded) return collapsed.has(id);
    // collapsed 가 default → 토글된 것만 펼침.
    return !collapsed.has(id);
  };

  // children-있는 노드 ID 만 toggle 의미 — 잎노드는 collapsed 무관.
  const collapsibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const flat of flattenTree(result.roots)) {
      if (flat.children.length > 0) ids.add(flat.node.id);
    }
    return ids;
  }, [result.roots]);

  const expandedCount = collapsibleIds.size - collapsed.size;
  const canExpandMore = expandedCount < collapsibleIds.size;
  const canCollapseMore = expandedCount > 0;

  const expandAll = () => {
    setCollapsed(new Set());
  };
  const collapseAll = () => {
    // defaultExpanded 가 true 면 collapsed Set 에 모든 ID 가 들어가야 모두 접힘.
    // false 면 빈 Set 이 모두 접힘.
    setCollapsed(defaultExpanded ? new Set(collapsibleIds) : new Set());
  };

  if (
    result.roots.length === 0
    && result.orphans.length === 0
    && result.warnings.length === 0
  ) {
    return (
      <div
        className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]"
        data-testid="ontology-tree-empty"
      >
        {emptyHint}
      </div>
    );
  }

  function renderSubtree(treeNode: OntologyTreeNode): React.ReactNode {
    const expanded = !isCollapsed(treeNode.node.id);
    return (
      <div key={treeNode.node.id} role="group">
        <TreeRow
          treeNode={treeNode}
          expanded={expanded}
          onToggle={() => toggle(treeNode.node.id)}
          onSelect={onSelect}
        />
        {expanded && treeNode.children.length > 0 ? (
          <div role="group">
            {treeNode.children.map((child) => renderSubtree(child))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-1.5">
        <Search size={12} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="트리에서 노드 찾기 — 한·영 OK"
          aria-label="트리 노드 검색"
          className="flex-1 bg-transparent text-[12px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
        />
        {isFiltering ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="검색 지우기"
            className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--color-text-quaternary)] hover:bg-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-secondary)]"
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
      {collapsibleIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[color:var(--color-text-tertiary)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {expandedCount} / {collapsibleIds.size} 펼침
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {/* Fire 2 — 정렬 dropdown. native select 로 모바일 접근성 + 의존성
                추가 0. 기본 'kind-title' 은 UX-12 정책 그대로. */}
            <label className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-[3px] text-[10px] text-[color:var(--color-text-tertiary)] focus-within:border-[color:rgba(94,106,210,0.32)]">
              <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                정렬
              </span>
              <select
                value={sortKey}
                onChange={(event) =>
                  setSortKey(event.target.value as OntologyRootSortKey)
                }
                aria-label="트리 정렬 방식"
                className="bg-transparent text-[10px] text-[color:var(--color-text-secondary)] focus:outline-none"
              >
                {(["kind-title", "evidence-desc", "title"] as const).map(
                  (key) => (
                    <option key={key} value={key}>
                      {ONTOLOGY_ROOT_SORT_LABEL[key]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={expandAll}
              disabled={!canExpandMore}
              aria-label="전체 펼치기"
              title="전체 펼치기"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--color-divider)] disabled:hover:text-[color:var(--color-text-tertiary)]"
            >
              <ChevronsUpDown size={11} />
              전체 펼치기
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={!canCollapseMore}
              aria-label="전체 접기"
              title="전체 접기"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--color-divider)] disabled:hover:text-[color:var(--color-text-tertiary)]"
            >
              <ChevronsDownUp size={11} />
              전체 접기
            </button>
          </div>
        </div>
      ) : null}
      <div role="tree" data-testid="ontology-tree" className="space-y-0.5">
        {filteredRoots.map((root) => renderSubtree(root))}
      </div>
      {isFiltering && filteredRoots.length === 0 && filteredOrphans.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-center text-xs text-[color:var(--color-text-tertiary)]">
          &quot;{searchQuery}&quot; 와 일치하는 노드가 없어요.
        </div>
      ) : null}
      {filteredOrphans.length > 0 ? (
        <div
          className="rounded-xl border px-4 py-3 text-xs text-[color:var(--color-text-secondary)]"
          style={{ borderColor: UNKNOWN_TONE.chipBorder, backgroundColor: UNKNOWN_TONE.chipBg }}
        >
          <p
            className="font-[var(--font-weight-signature)]"
            style={{ color: UNKNOWN_TONE.chipText }}
          >
            연결되지 않은 노드 {filteredOrphans.length}
            {isFiltering && filteredOrphans.length !== result.orphans.length
              ? ` / ${result.orphans.length}`
              : ""}
          </p>
          <ul className="mt-2 space-y-0.5">
            {filteredOrphans.slice(0, 8).map((node) => (
              <li key={node.id} className="flex items-center gap-2">
                <KindChip kind={node.kind} />
                <span className="truncate">{node.title}</span>
                <ManualSourceChip source={node.source} size="compact" />
              </li>
            ))}
            {filteredOrphans.length > 8 ? (
              <li className="text-[color:var(--color-text-quaternary)]">
                …외 {filteredOrphans.length - 8} 건
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {result.warnings.length > 0 ? (
        <details className="rounded-xl border border-[color:rgba(229,72,77,0.24)] bg-[color:rgba(229,72,77,0.06)] px-4 py-3 text-xs text-[color:var(--color-status-danger)]">
          <summary className="cursor-pointer font-[var(--font-weight-signature)]">
            데이터 경고 {result.warnings.length} 건
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-0.5">
            {result.warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
