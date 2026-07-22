"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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
        tabIndex={0}
        data-index-row={node.id}
        data-testid="topology-index-row"
        onClick={() => onSelect(node.id)}
        onKeyDown={handleRowKeyDown}
        style={{ marginLeft: depth * 16 }}
        className={`grid min-h-[34px] grid-cols-[14px_15px_1fr_auto] items-center gap-x-2 rounded-md border px-2 py-1 text-body transition-colors ${
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
          className={`flex items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-transform ${
            hasChildren ? "" : "invisible"
          } ${open ? "rotate-90" : ""}`}
        >
          <ChevronRight size={11} aria-hidden="true" />
        </button>
        <TopologyV2KindGlyph kind={node.kind} size={13} className="justify-self-center" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
            {agentAttributed && labels.agentBadge ? (
              <span
                data-testid="topology-index-agent-badge"
                className="shrink-0 font-mono text-caption uppercase tracking-[0.06em] text-[color:var(--topology-v2-panel-text-tertiary)]"
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
            title={isDomain ? labels.domainCountTitle : undefined}
            className="justify-self-end font-mono text-label text-[color:var(--topology-v2-numeral-face)] [text-shadow:0_1px_0_var(--topology-v2-numeral-shadow)]"
          >
            {count}
          </span>
        ) : null}
      </div>
      {hasChildren && open ? (
        <div>
          {children.map((child) => (
            <TopologyIndexTreeRow
              key={child.node.id}
              entry={child}
              depth={depth + 1}
              isOpen={isOpen}
              onToggleOpen={onToggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
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
  );
}
