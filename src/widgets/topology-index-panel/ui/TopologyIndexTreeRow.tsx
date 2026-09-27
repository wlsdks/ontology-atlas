"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { DomainCensusRow, OntologyTreeNode } from "@/entities/knowledge-graph";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { HighlightedText } from "@/shared/ui";
import {
  computeCapacityRatio,
  computeDomainSubcounts,
} from "../lib/domain-subcounts";

interface TopologyIndexTreeRowLabels {
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  /** Hover explanation for the domain badge (multi-membership is counted more than once). */
  domainCountTitle: string;
  /**
   * What capability and element mean, where their counts are read. The kind names are fixed
   * by `docs/ONTOLOGY-ATLAS-SPEC.md` §2, `AGENTS.md` forbids a competing glossary and `design.md` a
   * second teaching screen, so the definition is composed from the existing glossary strings.
   */
  subcountsTitle?: string;
  /**
   * The scope word for a domain's large number ("everything below"), making clear it is the subtree
   * total.
   */
  subtotalTitle?: string;
  /** The "an agent just now" attribution badge. */
  agentBadge?: string;
}

export interface TopologyIndexTreeRowProps {
  entry: OntologyTreeNode;
  depth: number;
  /**
   * Position among siblings, one-based, and their count. The tree is flat in the DOM, so aria-level
   * and position must be spoken.
   */
  position: number;
  setSize: number;
  isOpen: (nodeId: string) => boolean;
  onToggleOpen: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  selectedId: string | null;
  /** The roving tabindex entry point; only this row is tabIndex=0. */
  activeRowId: string | null;
  changedSlugs: ReadonlySet<string>;
  /** The one node (if any) matching a fresh heartbeat's focus. */
  agentAttributedNodeId?: string | null;
  maxDomainDescendantCount: number;
  /**
   * Domain size from the graph BFS census, used instead of the tree walk, which loses multi-parent
   * nodes.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  labels: TopologyIndexTreeRowLabels;
  /** The panel's search text, so the row can mark where the query landed. */
  query?: string;
}

/**
 * One INDEX tree row and its children, recursive by depth. Row click selects
 * (`docs/prototypes/hub-b3-immersive.html`); the caret is a separate target. Four-column grid
 * (caret, glyph, label, count) with the capacity meter inside the label cell
 * (`docs/prototypes/index-panel-v2-full.html`).
 */
export function TopologyIndexTreeRow({
  entry,
  depth,
  position,
  setSize,
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
  query,
}: TopologyIndexTreeRowProps) {
  const { node, children } = entry;
  const hasChildren = children.length > 0;
  const open = isOpen(node.id);
  const selected = selectedId === node.id;
  const fresh = changedSlugs.has(node.id);
  const agentAttributed = agentAttributedNodeId !== null && agentAttributedNodeId === node.id;
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-08)]");
  const isDomain = node.kind === "domain";
  // Every kind reads its own census row: the badge is the mark the map draws inside the node.
  const censusRow = domainCensus?.get(node.id) ?? null;
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
  const count = censusRow ? censusRow.total : isDomain && subcounts ? subcounts.descendantCount : hasChildren ? children.length : null;
  // The expansion lifetime uses the shared list-row disclosure hook.
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
        aria-level={depth + 1}
        aria-posinset={position}
        aria-setsize={setSize}
        aria-selected={selected}
        aria-expanded={hasChildren ? open : undefined}
        // Only the active row is a Tab stop; `focus()` still works at tabIndex=-1 for the arrow
        // handler.
        tabIndex={node.id === activeRowId ? 0 : -1}
        data-index-row={node.id}
        data-testid="topology-index-row"
        // A row with children selects and expands in one click; collapsing is the chevron's job.
        onClick={() => {
          onSelect(node.id);
          if (hasChildren && !open) onToggleOpen(node.id);
        }}
        onKeyDown={handleRowKeyDown}
        style={{ marginLeft: depth * 16 }}
        // `min-h-9` (36), a step of the control ladder
        // (`control-height-ladder-scope.contract.test.ts`); rows with a subcount line are taller.
        className={`atlas-touch-floor grid min-h-9 grid-cols-[24px_15px_1fr_auto] items-center gap-x-2 rounded-chip border py-1 pl-1 pr-2 text-body transition-colors ${
          selected
            ? "border-[color:var(--color-indigo-a55)] bg-[color:var(--map-panel-metric-surface)] text-[color:var(--map-panel-text-primary)]"
            : "border-transparent text-[color:var(--map-panel-text-secondary)] hover:border-[color:var(--map-panel-action-border)] hover:text-[color:var(--map-panel-text-primary)]"
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggleOpen(node.id);
          }}
          // The chevron is presentational: the treeitem already exposes aria-expanded and
          // ArrowRight/Left, and it is out of the focus order.
          aria-hidden="true"
          tabIndex={-1}
          // The hit area is the full row height by a 24px column; the icon stays 11px.
          className={`-my-1 flex w-full items-center justify-center self-stretch text-[color:var(--map-panel-text-quaternary)] transition-transform ${
            hasChildren ? "" : "invisible"
          } ${open ? "rotate-90" : ""}`}
        >
          <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
        </button>
        <OntologyMapKindGlyph kind={node.kind} size={13} className="justify-self-center" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">
              <HighlightedText text={node.display ?? node.title} query={query} />
            </span>
            {agentAttributed && labels.agentBadge ? (
              <span
                data-testid="topology-index-agent-badge"
                // 「An agent, just now」 (an agent, just now) — a Korean sentence, so the eyebrow treatment is dropped.
                className={`shrink-0 text-caption text-[color:var(--map-panel-text-tertiary)] ${eyebrow}`}
              >
                {labels.agentBadge}
              </span>
            ) : null}
            {fresh ? (
              <span
                title={labels.freshTitle}
                className="h-[5px] w-[5px] shrink-0 rounded-full bg-[color:var(--map-panel-power-on)]"
              />
            ) : null}
          </div>
          {isDomain && subcounts ? (
            <div className="mt-[3.5px] flex items-center gap-1.5">
              <span
                title={labels.subcountsTitle}
                data-testid="topology-index-subcounts"
                // Label step, sans with tabular figures: a count line people read, and mono pushes
                // Hangul apart.
                className="shrink-0 text-label leading-label tabular-nums text-[color:var(--map-panel-text-tertiary)]"
              >
                {labels.capabilitiesShort} {subcounts.capabilityCount} · {labels.elementsShort}{" "}
                {subcounts.elementCount}
              </span>
              {/* Inset capacity meter — a recessed track under the label (the former
                  full-basis grey meter is retired). Indigo ink: .45 unselected, .8 selected. */}
              {/* eslint-disable-next-line no-restricted-syntax -- the 1px hairline radius of a 2px-tall capacity meter track is an exception outside chip(6px). */}
              <span className="h-[2px] max-w-[76px] flex-1 overflow-hidden rounded-[1px] bg-[var(--color-overlay-recessed-a45)] shadow-[inset_0_1px_1px_var(--color-shadow-a50)]">
                <span
                  // eslint-disable-next-line no-restricted-syntax -- the fill paired with the meter track above, same 1px hairline radius.
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
            data-testid="topology-index-row-count"
            // Explains why domain badges sum past the census (multi-membership counts more than
            // once); the scope word leads when present.
            title={
              isDomain
                ? labels.subtotalTitle
                  ? `${labels.subtotalTitle} ${count} · ${labels.domainCountTitle}`
                  : labels.domainCountTitle
                : // Only domain badges carry the multi-membership caveat (they can sum past the
                  // census); the scope word applies to every badge.
                  censusRow && labels.subtotalTitle
                  ? `${labels.subtotalTitle} ${count}`
                  : undefined
            }
            className="justify-self-end font-mono text-label text-[color:var(--map-numeral-face)] [text-shadow:0_1px_0_var(--map-numeral-shadow)]"
          >
            {count}
          </span>
        ) : null}
      </div>
      {/*
       * Children use the list-row disclosure grammar (`.ai-row-disclosure`) instead of a hard cut,
       * leaving the same way.
       */}
      {hasChildren ? (
        // The box is always drawn so the transition has a starting height; only the content drops
        // out when collapsed, leaving the accessibility tree and tab order.
        <div
          ref={branchBoxRef}
          data-state={branchOpen ? "open" : "closed"}
          className="ai-row-disclosure"
          inert={!branchOpen}
        >
          {branchMounted ? (
          <div ref={branchContentRef} className="ai-row-disclosure-body">
          {children.map((child, childIndex) => (
            <TopologyIndexTreeRow
              key={child.node.id}
              entry={child}
              depth={depth + 1}
              position={childIndex + 1}
              setSize={children.length}
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
              query={query}
            />
          ))}
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
