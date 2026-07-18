"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import {
  computeCapacityRatio,
  computeDomainSubcounts,
} from "../lib/domain-subcounts";

export interface TopologyIndexTreeRowLabels {
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
}

export interface TopologyIndexTreeRowProps {
  entry: OntologyTreeNode;
  depth: number;
  isOpen: (nodeId: string) => boolean;
  onToggleOpen: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  selectedId: string | null;
  changedSlugs: ReadonlySet<string>;
  maxDomainDescendantCount: number;
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
  maxDomainDescendantCount,
  labels,
}: TopologyIndexTreeRowProps) {
  const { node, children } = entry;
  const hasChildren = children.length > 0;
  const open = isOpen(node.id);
  const selected = selectedId === node.id;
  const fresh = changedSlugs.has(node.id);
  const isDomain = node.kind === "domain";
  const subcounts = isDomain ? computeDomainSubcounts(entry) : null;
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
        className={`grid min-h-[34px] grid-cols-[14px_15px_1fr_auto] items-center gap-x-2 rounded-md border px-2 py-1 text-[12.5px] transition-colors ${
          selected
            ? "border-[color:rgba(94,106,210,0.55)] bg-[color:var(--topology-v2-panel-metric-surface)] text-[color:var(--topology-v2-panel-text-primary)]"
            : "border-transparent text-[color:var(--topology-v2-panel-text-secondary)] hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggleOpen(node.id);
          }}
          aria-hidden={!hasChildren}
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
            {fresh ? (
              <span
                title={labels.freshTitle}
                className="h-[5px] w-[5px] shrink-0 rounded-full bg-[color:var(--topology-v2-panel-power-on)]"
              />
            ) : null}
          </div>
          {isDomain && subcounts ? (
            <div className="mt-[3.5px] flex items-center gap-1.5">
              <span className="shrink-0 font-mono text-[9.5px] text-[color:var(--topology-v2-panel-text-quaternary)]">
                {labels.capabilitiesShort} {subcounts.capabilityCount} · {labels.elementsShort}{" "}
                {subcounts.elementCount}
              </span>
              {/* 인셋 capacity meter — 라벨 아래 리세스드 트랙(기존 basis-full
                  회색 미터 폐기). 인디고 잉크: 미선택 .45 / 선택 .8. */}
              <span className="h-[2px] max-w-[76px] flex-1 overflow-hidden rounded-[1px] bg-[rgba(0,0,0,0.45)] shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]">
                <span
                  className="block h-full rounded-[1px] bg-[rgba(139,151,255,0.45)] data-[selected=true]:bg-[rgba(139,151,255,0.8)]"
                  data-selected={selected}
                  style={{ width: `${Math.round(capacityRatio * 100)}%` }}
                />
              </span>
            </div>
          ) : null}
        </div>
        {count !== null ? (
          <span className="justify-self-end font-mono text-[11px] text-[color:var(--topology-v2-numeral-face)] [text-shadow:0_1px_0_var(--topology-v2-numeral-shadow)]">
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
              maxDomainDescendantCount={maxDomainDescendantCount}
              labels={labels}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
