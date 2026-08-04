"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { ChevronRight } from "lucide-react";
import type { DomainCensusRow, OntologyTreeNode } from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import {
  computeCapacityRatio,
  computeDomainSubcounts,
} from "../lib/domain-subcounts";

export interface TopologyIndexTreeRowLabels {
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  /** M-6 — 도메인 배지 hover 설명 (다중 소속 중복 계상). */
  domainCountTitle: string;
  /**
   * H1 A (숫자 스코프 계약) — 도메인 행 우측 큰 숫자의 스코프 단어("하위 전체").
   * 있으면 큰 숫자 title 이 "하위 전체 {count} · {domainCountTitle}" 로 조립돼
   * 이 숫자가 직속이 아니라 하위 트리 전체 합계임을 명시한다. 미지정이면 종전대로
   * `domainCountTitle` 만.
   */
  subtotalTitle?: string;
  /** P4b — "에이전트가 방금" 귀속 배지. */
  agentBadge?: string;
}

export interface TopologyIndexTreeRowProps {
  entry: OntologyTreeNode;
  depth: number;
  isOpen: (nodeId: string) => boolean;
  onToggleOpen: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  selectedId: string | null;
  /**
   * H3 P0 — 로빙 tabindex 의 단일 진입점. 이 id 와 같은 행만 `tabIndex=0`,
   * 나머지는 `-1` 이라 트리 전체가 Tab 스톱 하나로 접힌다(WAI-ARIA tree).
   * 형제 이동은 패널 컨테이너의 ArrowUp/Down 핸들러가 담당한다.
   */
  activeRowId: string | null;
  changedSlugs: ReadonlySet<string>;
  /** P4b — fresh heartbeat 의 focus 와 일치하는 노드 하나(있다면). */
  agentAttributedNodeId?: string | null;
  maxDomainDescendantCount: number;
  /**
   * Guardian I-1 — 도메인 크기 단일 진실원(그래프 BFS) 조회 맵. 있으면
   * 트리 워크 대신 이 값을 쓴다 — 트리는 다중 부모 노드를 유실해
   * /projects·인사이트와 숫자가 갈라졌다. null 이면 종전 트리 워크 유지.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  labels: TopologyIndexTreeRowLabels;
}

/**
 * One INDEX tree row + its (conditionally rendered) children — recursive,
 * so a capability's element children are just this component called again
 * one depth deeper. Kept as its own file (vs. inlined in the panel) per the
 * repo's 300-line module budget and because the recursion is easier to
 * reason about in isolation.
 *
 * Row click = select (the `?p=` camera-fly + datasheet mechanic via
 * `onSelect`); the caret is a separate click target so selecting a node
 * never accidentally collapses/expands it (`docs/prototypes/hub-b3-immersive.html`
 * IMPLEMENTATION NOTES — "Row click = handleSelect(node.id)").
 *
 * v2.1 (feat/chrome-system §9, docs/prototypes/index-panel-v2-full.html) —
 * fixed 4-column grid (caret 14px · glyph 15px · label 1fr · count auto)
 * replaces the old flex-wrap row. The domain capacity meter now lives
 * INSIDE the label cell as a recessed inline track under the name (the old
 * basis-full full-width second line + flat grey track is retired) and the
 * caret is a Lucide chevron that rotates on expand instead of a text "▶".
 */
export function TopologyIndexTreeRow({
  entry,
  depth,
  isOpen,
  onToggleOpen,
  onSelect,
  selectedId,
  activeRowId,
  changedSlugs,
  agentAttributedNodeId = null,
  maxDomainDescendantCount,
  domainCensus = null,
  labels,
}: TopologyIndexTreeRowProps) {
  const { node, children } = entry;
  const hasChildren = children.length > 0;
  const open = isOpen(node.id);
  const selected = selectedId === node.id;
  const fresh = changedSlugs.has(node.id);
  const agentAttributed = agentAttributedNodeId !== null && agentAttributedNodeId === node.id;
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-08)]");
  const isDomain = node.kind === "domain";
  const censusRow = isDomain ? (domainCensus?.get(node.id) ?? null) : null;
  const subcounts = isDomain
    ? censusRow
      ? {
          descendantCount: censusRow.total,
          capabilityCount: censusRow.capabilityCount,
          elementCount: censusRow.elementCount,
        }
      : computeDomainSubcounts(entry)
    : null;
  const capacityRatio = subcounts
    ? computeCapacityRatio(subcounts.descendantCount, maxDomainDescendantCount)
    : 0;
  const count = isDomain && subcounts ? subcounts.descendantCount : hasChildren ? children.length : null;
  // 자식 가지의 펼침/접힘 수명 — 앱 공통 목록 행 문법과 같은 훅.
  const {
    mounted: branchMounted,
    open: branchOpen,
    boxRef: branchBoxRef,
    contentRef: branchContentRef,
  } = useRowDisclosure(hasChildren && open);

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node.id);
      return;
    }
    if (event.key === "ArrowRight" && hasChildren && !open) {
      event.preventDefault();
      onToggleOpen(node.id);
      return;
    }
    if (event.key === "ArrowLeft" && hasChildren && open) {
      event.preventDefault();
      onToggleOpen(node.id);
    }
  };

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? open : undefined}
        // H3 P0 — 로빙 tabindex: 활성 행만 Tab 진입점, 나머지는 -1(방향키로만
        // 도달). `focus()` 는 tabIndex=-1 이어도 프로그램적으로는 먹으므로
        // 패널의 Arrow 핸들러가 어느 행이든 포커스를 옮길 수 있다.
        tabIndex={node.id === activeRowId ? 0 : -1}
        data-index-row={node.id}
        data-testid="topology-index-row"
        // 소유자 실사용 지적 (2026-07-24) — 셰브론 아이콘을 정확히 눌러야만
        // 펼쳐지고 조금만 빗나가면 우측 상세만 열려 "너무 민감"했다. 자식이
        // 있는 행은 클릭 한 번이 **선택 + 펼침**을 함께 한다(접기는 넓어진
        // 셰브론 히트 영역이 담당) — 클릭이 어느 쪽으로 튈지 고민할 일이
        // 없어진다.
        onClick={() => {
          onSelect(node.id);
          if (hasChildren && !open) onToggleOpen(node.id);
        }}
        onKeyDown={handleRowKeyDown}
        style={{ marginLeft: depth * 16 }}
        className={`grid min-h-[34px] grid-cols-[22px_15px_1fr_auto] items-center gap-x-2 rounded-chip border py-1 pl-1 pr-2 text-body transition-colors ${
          selected
            ? "border-[color:var(--color-indigo-a55)] bg-[color:var(--topology-v2-panel-metric-surface)] text-[color:var(--topology-v2-panel-text-primary)]"
            : "border-transparent text-[color:var(--topology-v2-panel-text-secondary)] hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggleOpen(node.id);
          }}
          // 셰브론은 마우스 어포던스일 뿐 AT 에겐 중복이다 — 펼침 상태와
          // 조작은 바깥 role="treeitem" 행이 aria-expanded + ArrowRight/Left
          // 로 이미 노출한다(WAI-ARIA tree 패턴). 이름 없는 버튼으로 a11y
          // 트리에 남으면 스크린리더가 정체불명 버튼을 21개 읽는다
          // (aria-audit e2e 가 잡은 실결함). tabIndex=-1 이라 포커스 순서에도
          // 없으므로 presentational 로 감추는 것이 맞다.
          aria-hidden="true"
          tabIndex={-1}
          // 히트 영역은 행 높이 전체 × 22px 컬럼 — 아이콘(11px)은 그대로.
          className={`-my-1 flex h-[34px] w-full items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-transform ${
            hasChildren ? "" : "invisible"
          } ${open ? "rotate-90" : ""}`}
        >
          <ChevronRight size={11} aria-hidden="true" />
        </button>
        <TopologyV2KindGlyph kind={node.kind} size={13} className="justify-self-center" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">{node.display ?? node.title}</span>
            {agentAttributed && labels.agentBadge ? (
              <span
                data-testid="topology-index-agent-badge"
                // E-10 — 「에이전트가  방금」. 한국어 문장이라 아이브로를 걷는다.
                className={`shrink-0 text-caption text-[color:var(--topology-v2-panel-text-tertiary)] ${eyebrow}`}
              >
                {labels.agentBadge}
              </span>
            ) : null}
            {fresh ? (
              <span
                title={labels.freshTitle}
                className="h-[5px] w-[5px] shrink-0 rounded-full bg-[color:var(--topology-v2-panel-power-on)]"
              />
            ) : null}
          </div>
          {isDomain && subcounts ? (
            <div className="mt-[3.5px] flex items-center gap-1.5">
              <span className="shrink-0 font-mono text-caption text-[color:var(--topology-v2-panel-text-quaternary)]">
                {labels.capabilitiesShort} {subcounts.capabilityCount} · {labels.elementsShort}{" "}
                {subcounts.elementCount}
              </span>
              {/* 인셋 capacity meter — 라벨 아래 리세스드 트랙(기존 basis-full
                  회색 미터 폐기). 인디고 잉크: 미선택 .45 / 선택 .8. */}
              {/* eslint-disable-next-line no-restricted-syntax -- 2px 높이 capacity 미터 트랙의 1px 헤어라인 반경은 chip(6px) 밖 예외. */}
              <span className="h-[2px] max-w-[76px] flex-1 overflow-hidden rounded-[1px] bg-[var(--color-overlay-recessed-a45)] shadow-[inset_0_1px_1px_var(--color-shadow-a50)]">
                <span
                  // eslint-disable-next-line no-restricted-syntax -- 위 미터 트랙과 짝인 fill 의 1px 헤어라인 반경.
                  className="block h-full rounded-[1px] bg-[var(--color-indigo-line-a45)] data-[selected=true]:bg-[var(--color-indigo-line-a90)]"
                  data-selected={selected}
                  style={{ width: `${Math.round(capacityRatio * 100)}%` }}
                />
              </span>
            </div>
          ) : null}
        </div>
        {count !== null ? (
          <span
            // M-6 — 도메인 배지 합이 census 총계를 넘는 이유(다중 소속
            // 중복 계상)를 셈해 보는 사용자에게 즉석에서 설명한다.
            // H1 A — 스코프 단어("하위 전체 N")를 앞세워 이 숫자가 직속이 아니라
            // 하위 트리 전체 합계임을 명시한다(있을 때만).
            title={
              isDomain
                ? labels.subtotalTitle
                  ? `${labels.subtotalTitle} ${count} · ${labels.domainCountTitle}`
                  : labels.domainCountTitle
                : undefined
            }
            className="justify-self-end font-mono text-label text-[color:var(--topology-v2-numeral-face)] [text-shadow:0_1px_0_var(--topology-v2-numeral-shadow)]"
          >
            {count}
          </span>
        ) : null}
      </div>
      {/* 2026-07-27 프레임 실측 — 여기는 **33ms 하드컷**이었다(2프레임, 높이
          전이 0). 같은 클릭의 카메라는 200ms 를 쓰는데 목록만 존재/비존재를
          왕복해서, 자식이 "펼쳐졌다" 가 아니라 "다른 화면이 됐다" 로 읽혔다.
          앱에 이미 있는 목록 행 펼침 문법(`.ai-row-disclosure`)을 그대로 쓴다 —
          새 커브·새 duration 0, 접힐 때도 같은 길로 나간다. */}
      {hasChildren ? (
        // 상자는 늘 그려 둔다 — 열릴 때 마운트하면 전이의 출발 높이가 없어
        // 그대로 하드컷이 된다(`useRowDisclosure` 는 "이미 열린 채 나타난 행"
        // 과 "지금 열린 행" 을 이전 커밋으로 구분한다). 내용만 접힘 상태에서
        // 빠져 스크린 리더·탭 순서에 남지 않는다.
        <div
          ref={branchBoxRef}
          data-state={branchOpen ? "open" : "closed"}
          className="ai-row-disclosure"
          inert={!branchOpen}
        >
          {branchMounted ? (
          <div ref={branchContentRef} className="ai-row-disclosure-body">
          {children.map((child) => (
            <TopologyIndexTreeRow
              key={child.node.id}
              entry={child}
              depth={depth + 1}
              isOpen={isOpen}
              onToggleOpen={onToggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              activeRowId={activeRowId}
              changedSlugs={changedSlugs}
              agentAttributedNodeId={agentAttributedNodeId}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              labels={labels}
            />
          ))}
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
