"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLatinEyebrow } from "@/shared/lib/locale-text/latin-eyebrow";
import { useRowDisclosure } from "@/shared/lib/list-rows/use-row-disclosure";
import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { DomainCensusRow, OntologyTreeNode } from "@/entities/knowledge-graph";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { HighlightedText } from "@/shared/ui";
import {
  computeDomainSubcounts,
} from "../lib/domain-subcounts";
import { ADD_KINDS_BY_GROUP, type IndexAddConcept, type IndexAddKind, TopologyIndexAddRow } from "./TopologyIndexAddRow";

export type IndexAddLabels = Record<IndexAddKind, { action: string; field: string }>;

interface TopologyIndexTreeRowLabels {
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  domainCountTitle: string;
  /**
   * What capability and element mean, where their counts are read. The kind names are fixed
   * by `docs/ONTOLOGY-ATLAS-SPEC.md` §2, `AGENTS.md` forbids a competing glossary and `design.md` a
   * second teaching screen, so the definition is composed from the existing glossary strings.
   */
  subcountsTitle?: string;
  subtotalTitle?: string;
  agentBadge?: string;
  holdsSelection?: string;
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
  /** The closed row the selection sits inside; the tree never opens itself to show it. */
  selectionHolderId?: string | null;
  activeRowId: string | null;
  changedSlugs: ReadonlySet<string>;
  agentAttributedNodeId?: string | null;
  maxDomainDescendantCount: number;
  /**
   * Domain size from the graph BFS census, used instead of the tree walk, which loses multi-parent
   * nodes.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  labels: TopologyIndexTreeRowLabels & { censusConcepts?: string };
  projectCount?: number | null;
  query?: string;
  onAddInGroup?: IndexAddConcept;
  addLabels?: IndexAddLabels;
}

export function TopologyIndexTreeRow({
  entry,
  depth,
  position,
  setSize,
  isOpen,
  onToggleOpen,
  onSelect,
  selectedId,
  selectionHolderId = null,
  activeRowId,
  changedSlugs,
  agentAttributedNodeId = null,
  maxDomainDescendantCount,
  domainCensus = null,
  labels,
  projectCount = null,
  query,
  onAddInGroup,
  addLabels,
}: TopologyIndexTreeRowProps) {
  const { node, children } = entry;
  const hasChildren = children.length > 0;
  const addKinds = onAddInGroup && addLabels ? (ADD_KINDS_BY_GROUP[node.kind] ?? []) : [];
  const groupSize = children.length + addKinds.length;
  const open = isOpen(node.id);
  const selected = selectedId === node.id;
  const holdsSelection = selectionHolderId === node.id;
  const fresh = changedSlugs.has(node.id);
  const agentAttributed = agentAttributedNodeId !== null && agentAttributedNodeId === node.id;
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-08)]");
  const isDomain = node.kind === "domain";
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
  const projectCensus = node.kind === "project" && projectCount !== null;
  const count = projectCensus ? projectCount : censusRow ? censusRow.total : isDomain && subcounts ? subcounts.descendantCount : hasChildren ? children.length : null;
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
        data-holds-selection={holdsSelection || undefined}
        data-testid="topology-index-row"
        onClick={() => onSelect(node.id)}
        onKeyDown={handleRowKeyDown}
        style={{ marginLeft: depth * 16 }}
        // `min-h-9` (36), a step of the control ladder; rows with a subcount line are taller.
        className={`atlas-touch-floor grid min-h-9 grid-cols-[24px_15px_1fr_auto] items-center gap-x-2 rounded-chip border py-1 pl-1 pr-2 text-body transition-colors ${
          selected
            ? "border-[color:var(--color-indigo-a55)] bg-[color:var(--map-panel-metric-surface)] text-[color:var(--map-panel-text-primary)]"
            : `border-transparent hover:border-[color:var(--map-panel-action-border)] hover:text-[color:var(--map-panel-text-primary)] ${
                holdsSelection ? "text-[color:var(--map-panel-text-primary)]" : "text-[color:var(--map-panel-text-secondary)]"
              }`
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
            {holdsSelection && labels.holdsSelection ? (
              <span className="sr-only">{labels.holdsSelection}</span>
            ) : null}
            {fresh ? (
              <span
                title={labels.freshTitle}
                className="sr-only"
              >{labels.freshTitle}</span>
            ) : null}
          </div>
          {isDomain && subcounts ? (
            <div className="sr-only">
              <span
                title={labels.subcountsTitle}
                data-testid="topology-index-subcounts"
                // Label step, sans with tabular figures: a count line people read, and mono pushes
                // Hangul apart.
                className="shrink-0 text-label leading-label tabular-nums text-[color:var(--map-panel-text-secondary)]"
              >
                {labels.capabilitiesShort} {subcounts.capabilityCount} · {labels.elementsShort}{" "}
                {subcounts.elementCount}
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
              projectCensus
                ? labels.censusConcepts ? `${count} ${labels.censusConcepts}` : undefined
                : isDomain
                ? labels.subtotalTitle
                  ? `${labels.subtotalTitle} ${count} · ${labels.domainCountTitle}`
                  : labels.domainCountTitle
                : // Only domain badges carry the multi-membership caveat (they can sum past the
                  // census); the scope word applies to every badge.
                  censusRow && labels.subtotalTitle
                  ? `${labels.subtotalTitle} ${count}`
                  : undefined
            }
            className={`inline-flex items-center gap-1.5 justify-self-end text-label tabular-nums ${
              holdsSelection ? "text-[color:var(--map-panel-text-primary)]" : "text-[color:var(--map-panel-text-tertiary)]"
            }`}
          >
            {holdsSelection ? (
              <span
                aria-hidden="true"
                data-testid="topology-index-holds-selection-dot"
                className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
              />
            ) : null}
            {count}
          </span>
        ) : null}
      </div>
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
              setSize={groupSize}
              isOpen={isOpen}
              onToggleOpen={onToggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              selectionHolderId={selectionHolderId}
              activeRowId={activeRowId}
              changedSlugs={changedSlugs}
              agentAttributedNodeId={agentAttributedNodeId}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              labels={labels}
              projectCount={projectCount}
              query={query}
              onAddInGroup={onAddInGroup}
              addLabels={addLabels}
            />
          ))}
          {onAddInGroup && addLabels
            ? addKinds.map((kind, kindIndex) => (
                <TopologyIndexAddRow
                  key={kind}
                  parent={node}
                  kind={kind}
                  depth={depth + 1}
                  position={children.length + kindIndex + 1}
                  setSize={groupSize}
                  onAdd={onAddInGroup}
                  labels={addLabels[kind]}
                />
              ))
            : null}
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
