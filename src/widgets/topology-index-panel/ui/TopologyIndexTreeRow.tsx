"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { DomainCensusRow, OntologyTreeNode } from "@/entities/knowledge-graph/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
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
   * What 「capability」 and 「element」 mean, at the one place their counts are read.
   *
   * ⚠️ Owner, 2026-08-24: *"more people than not will not know what a capability or an element even is —
   * something is needed so that a person who does not know what an ontology is can understand."*
   * The words themselves cannot change: they are the meta-model's kind names, owned by
   * `docs/ONTOLOGY-ATLAS-SPEC.md` §2, and `AGENTS.md` forbids a competing glossary. A second
   * teaching screen is forbidden too (`design.md`: the tour and the help glossary own the two
   * definitions).
   *
   * So the definition travels to the confusion instead of the reader travelling to the
   * definition — composed from the **existing** glossary strings, so there is one source and it
   * cannot drift. This row already explains its own numbers this way (`freshTitle`,
   * `domainCountTitle`); this is the same move for the one label that names a kind.
   */
  subcountsTitle?: string;
  /**
   * The number-scope contract — the scope word for the large number at the right of
   * a domain row ("everything below"). When present, the large number's title reads
   * "{subtotalTitle} {count} · {domainCountTitle}", making explicit that this number
   * is the whole subtree's total rather than direct children. Unset keeps just
   * `domainCountTitle`, as before.
   */
  subtotalTitle?: string;
  /** The "an agent just now" attribution badge. */
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
   * The roving tabindex's single entry point. Only the row matching this id is
   * `tabIndex=0` and the rest are `-1`, so the whole tree collapses into one Tab
   * stop (WAI-ARIA tree). Sibling movement is handled by the panel container's
   * ArrowUp/Down handler.
   */
  activeRowId: string | null;
  changedSlugs: ReadonlySet<string>;
  /** The one node (if any) matching a fresh heartbeat's focus. */
  agentAttributedNodeId?: string | null;
  maxDomainDescendantCount: number;
  /**
   * A lookup map for the single source of truth on domain size (graph BFS). When
   * present it is used instead of the tree walk — the tree lost multi-parent nodes,
   * so its numbers diverged from /projects and insights. null keeps the previous
   * tree walk.
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
  // The lifetime of a child branch's expansion — the same hook as the app's shared list-row grammar.
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
        // Roving tabindex: only the active row is a Tab entry point, the rest are -1
        // (reachable by arrow keys alone). `focus()` still works programmatically at
        // tabIndex=-1, so the panel's arrow handler can move focus to any row.
        tabIndex={node.id === activeRowId ? 0 : -1}
        data-index-row={node.id}
        data-testid="topology-index-row"
        // Owner report from real use (2026-07-24) — a row expanded only when the
        // chevron icon was hit exactly, and missing it by a little opened just the
        // detail on the right, which felt "far too sensitive". A row with children now
        // does **select and expand** in one click (collapsing is handled by the
        // widened chevron hit area) — there is nothing left to guess about where a
        // click will go.
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
          // The chevron is a mouse affordance only and is redundant to assistive
          // technology — the expansion state and its operation are already exposed by
          // the outer role="treeitem" row through aria-expanded plus
          // ArrowRight/Left (the WAI-ARIA tree pattern). Left in the a11y tree as an
          // unnamed button, a screen reader reads out 21 unidentifiable buttons (a real
          // defect caught by the aria-audit e2e). With tabIndex=-1 it is not in the
          // focus order either, so hiding it as presentational is right.
          aria-hidden="true"
          tabIndex={-1}
          // The hit area is the full row height × a 22px column — the icon stays 11px.
          className={`-my-1 flex h-[34px] w-full items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-transform ${
            hasChildren ? "" : "invisible"
          } ${open ? "rotate-90" : ""}`}
        >
          <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
        </button>
        <TopologyV2KindGlyph kind={node.kind} size={13} className="justify-self-center" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">{node.display ?? node.title}</span>
            {agentAttributed && labels.agentBadge ? (
              <span
                data-testid="topology-index-agent-badge"
                // 「An agent, just now」 (an agent, just now) — a Korean sentence, so the eyebrow treatment is dropped.
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
              <span
                title={labels.subcountsTitle}
                data-testid="topology-index-subcounts"
                className="shrink-0 font-mono text-caption text-[color:var(--topology-v2-panel-text-quaternary)]"
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
            // Explain on the spot, to a user counting them up, why the domain badges
            // sum past the census total (multi-membership is counted more than once).
            // The scope word ("everything below N") leads, making explicit that this
            // number is the whole subtree's total rather than direct children (only when present).
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
      {/* Frame measurement 2026-07-27 — this was a **33ms hard cut** (2 frames, zero
          height transition). The camera on the same click spends 200ms while the list
          alone flipped between existing and not, so children read as "a different
          screen" rather than "expanded". It uses the list-row disclosure grammar the
          app already has (`.ai-row-disclosure`) — zero new curves, zero new durations,
          and it leaves by the same path when collapsing. */}
      {hasChildren ? (
        // The box is always drawn — mounting it on open leaves the transition no
        // starting height and produces a hard cut (`useRowDisclosure` distinguishes "a
        // row that appeared already open" from "a row opening now" by the previous
        // commit). Only the content drops out of the collapsed state, so it does not
        // remain in the screen reader or the tab order.
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
