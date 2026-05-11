"use client";

import { createElement, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";
import { getOntologyKindIcon, useOntologyKindLabel } from "@/entities/ontology-class";
import {
  filterTreeByQuery,
  flattenTree,
  UNKNOWN_TONE,
  type OntologyTreeBuildResult,
  type OntologyTreeNode,
} from "@/shared/lib/ontology-tree";
import {
  sortRoots,
  type OntologyRootSortKey,
} from "../lib/sort-roots";

const SORT_LABEL_KEY: Record<OntologyRootSortKey, string> = {
  "kind-title": "tree.sortKindTitle",
  title: "tree.sortTitle",
};

/**
 * implicit file path element 식별 — capability frontmatter 의 `elements:
 * [src/widgets/foo]` 같은 inline 참조로 만든 element. 트리에 file path 가
 * leaf 로 등장해서 capability 하나가 16 file 을 한꺼번에 노출하는 *첫인상
 * 정보 과다* 의 원인. 휴리스틱: kind === 'element' + title 에 slash 포함 +
 * 공백 없음 (path 패턴). 사람 친화적 element 라벨 (`File System Access API`
 * 등) 은 공백 포함이라 제외.
 */
function isImplicitFileElement(node: { kind: string; title: string }): boolean {
  if (node.kind !== "element") return false;
  const title = node.title ?? "";
  if (!title.includes("/")) return false;
  if (/\s/.test(title)) return false;
  return true;
}

export interface OntologyTreeViewProps {
  result: OntologyTreeBuildResult;
  /** 빈 상태 메시지 — 데이터가 아직 없을 때. */
  emptyHint?: string;
  /** 시작 시 모든 노드 펼침 여부. 기본 true. */
  defaultExpanded?: boolean;
  /** R12 — first-impression UX: capability 노드는 default 접힘. element
   *  file path leaf 가 capability 마다 길게 펼쳐져 첫 화면 정보 과다.
   *  capability 한 줄만 보이고, 클릭하면 elements 펼침. domain 까지는
   *  default 펼침 유지 — 위계 자체를 한눈에. */
  collapseCapabilitiesByDefault?: boolean;
  /** 행 클릭 콜백 — 상세 패널로 라우팅 등에 사용. */
  onSelect?: (node: OntologyTreeNode["node"]) => void;
  /** 외부에서 선택된 노드 id (deeplink ?node=..., panel 클릭 등). 트리 행
   *  하나만 시각/접근성 selected 상태로 표시한다. */
  selectedId?: string | null;
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
  // capability / element 의 bg 가 한 단계 옅은 토큰 (overlay-1/-2) 이라
  // light mode (alpha 2.5–5%) 에서 흰 배경 위 거의 invisible. dark 에선
  // 차이 미세, light 에선 가독성 큰 개선 — 한 단계 진한 토큰으로 통일
  // (border 도 같이).
  capability: {
    bg: "var(--color-overlay-3)",
    text: "var(--color-text-tertiary)",
    border: "var(--color-border-soft)",
  },
  element: {
    bg: "var(--color-overlay-2)",
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
  const kindLabel = useOntologyKindLabel();
  // kind → 정적 lucide 컴포넌트 매핑. createElement 로 직접 호출해서
  // local alias (`const Icon = …; <Icon />`) 가 react-hooks/static-components
  // 룰을 트리거하는 패턴 회피. KIND_ICON 자체가 정적 record 라 element type
  // identity 는 매 render 안정.
  return (
    <span
      className="inline-flex items-center gap-1 break-keep rounded-full border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em]"
      style={{ backgroundColor: tone.bg, color: tone.text, borderColor: tone.border }}
    >
      {createElement(getOntologyKindIcon(kind), { size: 10, "aria-hidden": true })}
      {kindLabel(kind)}
    </span>
  );
}

function TreeRow({
  treeNode,
  expanded,
  onToggle,
  onSelect,
  selected,
}: {
  treeNode: OntologyTreeNode;
  expanded: boolean;
  onToggle: () => void;
  onSelect?: (node: OntologyTreeNode["node"]) => void;
  /** 외부 selection 과 일치하는 행 — aria-selected + 시각 active 톤. */
  selected: boolean;
}) {
  const t = useTranslations('ontologyWidgets');
  const hasChildren = treeNode.children.length > 0;
  // depth 0 = root → 0 padding. Mobile/narrow panes cannot afford unbounded
  // indentation: deep element paths otherwise force a desktop-width min-content
  // tree. Cap visual indentation while preserving hierarchy.
  const indent = Math.min(treeNode.depth * 16, 64);
  // UX-11 — element kind 노드는 default dim 처리해 project / domain /
  // capability 가 시각적으로 떠오르게. hover/focus 시 opacity 회복.
  // 운영 데이터 분포 기준 element 454 / capability 115 / domain 21 /
  // project 19 / document 13 — element 가 70% 점유라 평탄한 위계 mitigation.
  const isElementKind = treeNode.node.kind === "element";
  const dimClass = isElementKind
    ? "opacity-60 hover:opacity-100 focus-within:opacity-100 transition-opacity"
    : "";
  const selectedClass = selected
    ? "bg-[color:rgba(94,106,210,0.12)] ring-1 ring-inset ring-[color:rgba(94,106,210,0.32)]"
    : "hover:bg-[color:var(--color-overlay-2)]";
  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      data-testid="ontology-tree-row"
      data-kind={treeNode.node.kind}
      data-depth={treeNode.depth}
      data-dim={isElementKind ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      className={`flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 transition-colors ${selectedClass} ${dimClass}`}
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? t('tree.collapse') : t('tree.expand')}
          className="flex h-5 w-5 flex-none items-center justify-center rounded text-[color:var(--color-text-quaternary)] hover:bg-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-secondary)]"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span className="inline-block h-5 w-5 flex-none" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onSelect?.(treeNode.node)}
        title={treeNode.node.title}
        data-tree-select-button="true"
        data-row-slug={treeNode.node.id}
        data-row-depth={treeNode.depth}
        data-row-has-children={hasChildren ? "true" : "false"}
        data-row-expanded={hasChildren ? (expanded ? "true" : "false") : ""}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden break-keep text-left text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:rounded-sm"
      >
        <KindChip kind={treeNode.node.kind} />
        {(() => {
          // R12 — element 의 file path 라벨은 모바일에서 ellipsis 가 *파일명*
          // 을 먹어 식별 불가 ("src/features/.../use-projec…"). prefix 만
          // 잘리고 basename 은 항상 보이게 split. path 아닌 element 는 일반
          // truncate. element 외 kind 도 그대로.
          const title = treeNode.node.title;
          const isElementPath =
            treeNode.node.kind === "element" && title.includes("/") && !title.includes(" ");
          if (!isElementPath) {
            return <span className="min-w-0 flex-1 truncate">{title}</span>;
          }
          const lastSlash = title.lastIndexOf("/");
          const prefix = title.slice(0, lastSlash + 1);
          const basename = title.slice(lastSlash + 1);
          return (
            <span className="flex min-w-0 flex-1 items-center">
              <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">
                {prefix}
              </span>
              <span className="flex-none">{basename}</span>
            </span>
          );
        })()}
        {/* EvidenceCountChip / ProjectIdChip 모두 R10 후 vault 모드에서
            evidenceCount / projectIds 가 영구 빈 값이라 미렌더되어 cycle
            15 / 24 에서 제거. 미래에 vault 측에서 해당 값을 derive 해
            populating 하면 재도입. */}
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
export function OntologyTreeView({
  result,
  emptyHint,
  defaultExpanded = true,
  collapseCapabilitiesByDefault = true,
  onSelect,
  selectedId,
}: OntologyTreeViewProps) {
  const t = useTranslations('ontologyWidgets');
  // expand 상태 — 노드 ID 단위. defaultExpanded 면 처음 모두 펼침.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // defaultExpanded=false 시 처음 모든 children-있는 노드를 collapsed 로 시작.
  // 단순 v0 구현: defaultExpanded 변경 무시.

  // R+ capability 의 implicit file element 그룹 펼침 — capability id 집합.
  // 그룹은 *capability 별* 로 따로 토글 (한 capability 의 file path 그룹만
  // 펼치고 다른 capability 는 닫힌 상태 유지). search 중엔 강제 펼침
  // (isFiltering 분기로 적용).
  const [expandedImplicit, setExpandedImplicit] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleImplicit = (id: string) => {
    setExpandedImplicit((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // inline 검색 — ⌘K 글로벌 검색과 별개로 트리 안 빠른 좁히기.
  // 매치 노드 + 부모 chain 보존, 형제 제외.
  const [searchQuery, setSearchQuery] = useState("");
  // 트리 정렬 mode — 기본 kind 우선 (위계). 'title' 은 알파벳 lookup.
  // 페이지 reload 마다 default 로 회귀.
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
    return result.orphans.filter(
      (n) =>
        n.title.toLowerCase().includes(trimmed)
        || n.id.toLowerCase().includes(trimmed),
    );
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

  // 외부 selectedId 가 가리키는 노드의 조상 chain — derived state 로 두고
  // isCollapsed read 시점에 force-open 으로 처리한다. cycle 27 에서는
  // useEffect 안 setCollapsed 로 처리했지만 react-hooks/set-state-in-effect
  // 경고 + cascade render 위험이 있어 derived 패턴으로 전환.
  const forceOpenAncestors = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ancestors = new Set<string>();
    function walk(nodes: OntologyTreeNode[], path: string[]): boolean {
      for (const n of nodes) {
        if (n.node.id === selectedId) {
          for (const id of path) ancestors.add(id);
          return true;
        }
        if (walk(n.children, [...path, n.node.id])) return true;
      }
      return false;
    }
    walk(result.roots, []);
    return ancestors;
  }, [selectedId, result.roots]);

  const isCollapsed = (id: string) => {
    // selectedId 의 조상은 항상 펼친 상태로 보이도록 override.
    if (forceOpenAncestors.has(id)) return false;
    // capability default-collapsed: collapsed Set 의미가 *반전* — Set 에
    // 있으면 "사용자가 펼친" 것, 없으면 "default 접힌" 그대로.
    if (defaultCollapsedIds.has(id)) return !collapsed.has(id);
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

  // R12 — first-impression UX: capability 노드는 default 접힘.
  // capability 가 children (element) 을 가질 때만 의미. element/domain/project 는 영향 X.
  // 작은 트리 (수십 노드) 라 매 렌더 O(N) 계산 — useMemo 는 lint 의 manual
  // memoization 보존 룰과 충돌해서 인라인.
  const defaultCollapsedIds = new Set<string>();
  if (collapseCapabilitiesByDefault) {
    for (const flat of flattenTree(result.roots)) {
      if (flat.node.kind === "capability" && flat.children.length > 0) {
        defaultCollapsedIds.add(flat.node.id);
      }
    }
  }

  // \`collapsed\` Set 의미가 \`defaultExpanded\` 와 노드별 \`defaultCollapsedIds\`
  // 에 따라 뒤집힌다. 매 렌더 O(N) 단순 계산 — 작은 트리 (수십 노드) 라
  // useMemo 비용보다 인라인이 가독성 우위.
  let expandedCount = 0;
  for (const id of collapsibleIds) {
    let isCol: boolean;
    if (forceOpenAncestors.has(id)) {
      isCol = false;
    } else if (defaultCollapsedIds.has(id)) {
      isCol = !collapsed.has(id);
    } else if (defaultExpanded) {
      isCol = collapsed.has(id);
    } else {
      isCol = !collapsed.has(id);
    }
    if (!isCol) expandedCount += 1;
  }
  const canExpandMore = expandedCount < collapsibleIds.size;
  const canCollapseMore = expandedCount > 0;

  const expandAll = () => {
    // capability default-collapsed 가 있으면 그것들을 set 에 채워야 펼쳐짐
    // (반전 의미). 그 외 ID 는 비워 둠.
    setCollapsed(new Set(defaultCollapsedIds));
  };
  const collapseAll = () => {
    // defaultExpanded 노드: set 에 추가 → 접힘.
    // capability default-collapsed: set 에서 제외 → default 접힘 유지.
    const next = new Set<string>();
    for (const id of collapsibleIds) {
      if (!defaultCollapsedIds.has(id)) next.add(id);
    }
    setCollapsed(next);
  };

  // R+ — 트리 키보드 nav. Tab 으로 트리 진입 후 다음 키로 power-user 이동:
  //
  //   ↓/↑       → 다음/이전 visible row.
  //   →         → focused row children 있고 접혀 있으면 펼침.
  //   ←         → focused row children 있고 펼쳐져 있으면 접음. 그 외
  //              (leaf · 이미 접힌 parent) → parent 행 focus (표준 ARIA).
  //   Home/End  → 첫/마지막 visible row.
  //   a-z, 한글 → type-to-search. 600ms 안에 누적된 chars 로 첫 일치 row
  //              focus (현재 focus 다음부터 wrap-around). 같은 char 반복 시
  //              일치하는 row 들 사이 advance.
  //
  // 기존 Tab 흐름은 그대로 — additive layer.
  // type-to-search 누적 buffer + 타이머. ref 라 re-render 비유발.
  const searchBufferRef = useRef<{
    value: string;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ value: "", timer: null });
  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target?.matches?.('[data-tree-select-button="true"]')) return;

    const collectButtons = () =>
      Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[data-tree-select-button="true"]',
        ),
      );

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const buttons = collectButtons();
      const idx = buttons.indexOf(target as HTMLButtonElement);
      if (idx < 0) return;
      event.preventDefault();
      const next = event.key === "ArrowDown" ? idx + 1 : idx - 1;
      if (next < 0 || next >= buttons.length) return;
      buttons[next]?.focus();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const hasChildren = target.dataset.rowHasChildren === "true";
      const slug = target.dataset.rowSlug;
      const expanded = target.dataset.rowExpanded === "true";
      const wantExpand = event.key === "ArrowRight";

      if (wantExpand) {
        // ArrowRight — 접힌 parent 만 펼침. 이외 (leaf · 이미 펼쳐진 parent)
        // 는 표준 ARIA 면 첫 자식 focus 인데 ↓ 로 동일 효과 → 단순 no-op.
        if (!hasChildren || !slug || expanded) return;
        event.preventDefault();
        toggle(slug);
        return;
      }
      // ArrowLeft — 두 분기:
      //   ① 펼쳐진 parent → 접음
      //   ② 그 외 (leaf · 이미 접힌 parent) → parent 행 focus (R+ 표준 ARIA)
      if (hasChildren && expanded && slug) {
        event.preventDefault();
        toggle(slug);
        return;
      }
      // parent focus — depth 기준 직전 더 얕은 깊이 button 찾기.
      const ownDepth = Number(target.dataset.rowDepth);
      if (!Number.isFinite(ownDepth) || ownDepth <= 0) return; // root → no-op
      const buttons = collectButtons();
      const idx = buttons.indexOf(target as HTMLButtonElement);
      if (idx <= 0) return;
      for (let i = idx - 1; i >= 0; i -= 1) {
        const d = Number(buttons[i]?.dataset.rowDepth);
        if (Number.isFinite(d) && d < ownDepth) {
          event.preventDefault();
          buttons[i]?.focus();
          return;
        }
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      // 모디파이어 (Cmd+Home = scroll top 등) 와 충돌 회피.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const buttons = collectButtons();
      if (buttons.length === 0) return;
      event.preventDefault();
      const target2 =
        event.key === "Home" ? buttons[0] : buttons[buttons.length - 1];
      target2?.focus();
      return;
    }
    // type-to-search — 단일 printable char (모디파이어 없음). 공백 / 구두점은
    // 제외해 button activation (Space) 와 충돌 회피. 한글·숫자·라틴 모두 OK.
    if (
      event.key.length === 1
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && /[\p{L}\p{N}]/u.test(event.key)
    ) {
      const buf = searchBufferRef.current;
      if (buf.timer) clearTimeout(buf.timer);
      buf.value += event.key.toLowerCase();
      buf.timer = setTimeout(() => {
        buf.value = "";
        buf.timer = null;
      }, 600);
      const buttons = collectButtons();
      if (buttons.length === 0) return;
      const fromIdx = buttons.indexOf(target as HTMLButtonElement);
      // 검색 순서: 현재 focus 다음부터 끝까지 → 처음부터 현재 focus 까지
      // (현재 row 자체도 포함 — 같은 prefix 재입력 시 거기 머무를 수 있도록).
      const ordered =
        fromIdx >= 0
          ? buttons.slice(fromIdx + 1).concat(buttons.slice(0, fromIdx + 1))
          : buttons;
      const matches = (b: HTMLButtonElement) =>
        (b.title || "").toLowerCase().startsWith(buf.value);
      let hit = ordered.find(matches);
      // 누적 buffer 로 일치 없을 때 — 사용자가 같은 char 반복으로 advance
      // 하려는 경우 (e.g. "ㄱ ㄱ ㄱ" 로 ㄱ 시작 row 들 사이 순회). buffer 를
      // 마지막 char 만 남기고 재시도.
      if (!hit && buf.value.length > 1) {
        buf.value = event.key.toLowerCase();
        hit = ordered.find(matches);
      }
      if (hit) {
        event.preventDefault();
        hit.focus();
      }
    }
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
        {emptyHint ?? "The ontology hasn't grown yet."}
      </div>
    );
  }

  function renderSubtree(treeNode: OntologyTreeNode): React.ReactNode {
    const expanded = !isCollapsed(treeNode.node.id);
    const hasChildren = treeNode.children.length > 0;
    // capability 노드의 children 중 implicit file path element (e.g.
    // `src/widgets/...`) 가 4 개 이상이면 *그룹 chip* 으로 압축. 첫 진입에
    // capability 하나가 16 file path 를 한꺼번에 펼치는 정보 과다 해소.
    // explicit element (frontmatter 정의된 named 노드) 와 자식 capability
    // 등은 그대로 노출. 검색 중이면 그룹 자동 펼침 (matched element 가
    // 보이게).
    let childrenNode: React.ReactNode = null;
    if (expanded && hasChildren) {
      if (treeNode.node.kind === 'capability') {
        const implicit: OntologyTreeNode[] = [];
        const explicit: OntologyTreeNode[] = [];
        for (const c of treeNode.children) {
          if (isImplicitFileElement(c.node)) implicit.push(c);
          else explicit.push(c);
        }
        const groupOpen =
          isFiltering || expandedImplicit.has(treeNode.node.id);
        const shouldGroup = implicit.length >= 4 && !groupOpen;
        const indentPx = Math.min((treeNode.depth + 1) * 16, 64) + 8;
        childrenNode = (
          <div role="group">
            {explicit.map((child) => renderSubtree(child))}
            {shouldGroup ? (
              <button
                type="button"
                onClick={() => toggleImplicit(treeNode.node.id)}
                aria-expanded="false"
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                style={{ paddingLeft: `${indentPx}px` }}
              >
                <ChevronRight size={12} className="flex-none text-[color:var(--color-text-quaternary)]" />
                <span>{t('tree.implicitElementsShow', { count: implicit.length })}</span>
              </button>
            ) : (
              <>
                {implicit.map((child) => renderSubtree(child))}
                {implicit.length >= 4 && !isFiltering ? (
                  <button
                    type="button"
                    onClick={() => toggleImplicit(treeNode.node.id)}
                    aria-expanded="true"
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)]"
                    style={{ paddingLeft: `${indentPx}px` }}
                  >
                    <ChevronDown size={12} className="flex-none" />
                    <span>{t('tree.implicitElementsHide')}</span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      } else {
        childrenNode = (
          <div role="group">
            {treeNode.children.map((child) => renderSubtree(child))}
          </div>
        );
      }
    }
    return (
      <div key={treeNode.node.id} role="group">
        <TreeRow
          treeNode={treeNode}
          expanded={expanded}
          onToggle={() => toggle(treeNode.node.id)}
          onSelect={onSelect}
          selected={selectedId === treeNode.node.id}
        />
        {childrenNode}
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
          placeholder={t('tree.searchPlaceholder')}
          aria-label={t('tree.searchAriaLabel')}
          className="flex-1 bg-transparent text-[12px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
        />
        {isFiltering ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label={t('tree.searchClearAriaLabel')}
            className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--color-text-quaternary)] hover:bg-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-secondary)]"
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
      {collapsibleIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[color:var(--color-text-tertiary)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t('tree.expandedSummary', { expanded: expandedCount, total: collapsibleIds.size })}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {/* 정렬 dropdown — native select 로 모바일 접근성 보장 + 외부
                의존성 0. 기본 'kind-title' (위계 우선). */}
            <label className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-[3px] text-[10px] text-[color:var(--color-text-tertiary)] focus-within:border-[color:rgba(94,106,210,0.32)]">
              <span className="font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t('tree.sortLabel')}
              </span>
              <select
                value={sortKey}
                onChange={(event) =>
                  setSortKey(event.target.value as OntologyRootSortKey)
                }
                aria-label={t('tree.sortAriaLabel')}
                className="bg-transparent text-[10px] text-[color:var(--color-text-secondary)] focus:outline-none"
              >
                {(["kind-title", "title"] as const).map((key) => (
                  <option key={key} value={key}>
                    {t(SORT_LABEL_KEY[key])}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={expandAll}
              disabled={!canExpandMore}
              aria-label={t('tree.expandAll')}
              title={t('tree.expandAll')}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--color-divider)] disabled:hover:text-[color:var(--color-text-tertiary)]"
            >
              <ChevronsUpDown size={11} />
              {t('tree.expandAll')}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={!canCollapseMore}
              aria-label={t('tree.collapseAll')}
              title={t('tree.collapseAll')}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--color-divider)] disabled:hover:text-[color:var(--color-text-tertiary)]"
            >
              <ChevronsDownUp size={11} />
              {t('tree.collapseAll')}
            </button>
          </div>
        </div>
      ) : null}
      <div
        role="tree"
        data-testid="ontology-tree"
        className="max-w-full space-y-0.5 overflow-hidden"
        onKeyDown={handleTreeKeyDown}
      >
        {filteredRoots.map((root) => renderSubtree(root))}
      </div>
      {isFiltering && filteredRoots.length === 0 && filteredOrphans.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-center text-xs text-[color:var(--color-text-tertiary)]">
          {t('tree.noResults', { query: searchQuery })}
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
            {isFiltering && filteredOrphans.length !== result.orphans.length
              ? t('tree.orphansHeadingFiltered', {
                  filtered: filteredOrphans.length,
                  total: result.orphans.length,
                })
              : t('tree.orphansHeading', { count: filteredOrphans.length })}
          </p>
          <ul className="mt-2 space-y-0.5">
            {filteredOrphans.slice(0, 8).map((node) => (
              <li key={node.id} className="flex min-w-0 items-center gap-2" title={node.title}>
                <KindChip kind={node.kind} />
                <span className="min-w-0 flex-1 truncate">{node.title}</span>
              </li>
            ))}
            {filteredOrphans.length > 8 ? (
              <li className="text-[color:var(--color-text-quaternary)]">
                {t('tree.orphansMore', { count: filteredOrphans.length - 8 })}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {result.warnings.length > 0 ? (
        <details
          id="tree-data-warnings"
          // R+ PR #223 의 stat strip amber pill 과 톤 통일 — red (status-danger)
          // 은 *error* 신호, multi-parent drop 은 *warning* 신호. 디자인
          // 헌장도 amber 가 stub/warning, red 가 error. 같은 신호인데 두 톤
          // 이 어긋나면 사용자 시각 헷갈림.
          className="group scroll-mt-24 rounded-xl border border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)] px-4 py-3 text-xs text-[color:rgba(238,198,128,0.95)] open:bg-[color:rgba(255,179,71,0.09)]"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 font-[var(--font-weight-signature)] [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3 w-3 flex-none transition-transform duration-150 group-open:rotate-90" />
            <span className="flex-1">{t('tree.warningsSummary', { count: result.warnings.length })}</span>
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-0.5 pl-5">
            {result.warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
