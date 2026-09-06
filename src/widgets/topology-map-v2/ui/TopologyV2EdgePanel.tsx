"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

const EDIT_RELATION_ACTION_CLASS = controlClass({
  shape: "chip",
  className:
    "h-8 justify-center border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] text-label text-[color:var(--topology-v2-panel-text-secondary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]",
});
import { Link } from "@/i18n/navigation";
import { IconButton, RowButton } from "@/shared/ui";
import { controlClass } from '@/shared/ui/control-class';

/**
 * P3b — the edge popover. Built from the same material as the node datasheet
 * (panel tokens), it states one relation's meaning: plain sentence → type and
 * direction → the declaring source (.md) → change date → a relation-edit deep link.
 *
 * The reference study's verdict: what makes something read as an ontology is not
 * the type's name but the sentence plus the declaring source — frontmatter *is*
 * the graph here, so showing provenance costs nothing, and that is this product's
 * point of difference. The sentence and labels are assembled by the caller from
 * the relation lexicon (P1a); this widget is display-only.
 */
export interface TopologyV2EdgePanelProps {
  /** The plain sentence — "A leans on B" (from the lexicon's plain register). */
  sentence: string;
  /** The formal type label — "depends". */
  typeLabel: string;
  fromTitle: string;
  toTitle: string;
  /** P6 — one line of rationale for the relation (relation_notes). null omits it. */
  why?: string | null;
  /** The declaring vault document — null omits the provenance row. */
  declaredBy: { slug: string; href: string } | null;
  /** The declaring document's change-time label (reusing the S-C1 ramp) — null omits it. */
  updatedAtLabel: string | null;
  /**
   * The studio (Compass Stage) edit deep link — opens the node that authored this
   * relation as the focal one and expands that relation's edit card (Slice 6).
   * null means an edge the studio cannot edit (describes, domain membership and
   * the like), so the "fix this" action is not rendered at all (no dead affordance).
   */
  meaningEditHref: string | null;
  labels: {
    kicker: string;
    declaredByLabel: string;
    editRelation: string;
    close: string;
    openDoc: string;
  };
  onSelectNode: (id: string) => void;
  onEditRelation?: () => void;
  fromId: string;
  toId: string;
  onClose: () => void;
  className?: string;
}

export function TopologyV2EdgePanel({
  sentence,
  typeLabel,
  fromTitle,
  toTitle,
  why = null,
  declaredBy,
  updatedAtLabel,
  meaningEditHref,
  labels,
  onSelectNode,
  onEditRelation,
  fromId,
  toId,
  onClose,
  className,
}: TopologyV2EdgePanelProps) {
  // H3 P1 — the edge popover's focus contract. On open, focus moves into the
  // dialog so `role=dialog` plus `aria-label` is announced to a screen reader; on
  // close it returns to the trigger that opened it (the canvas, or whatever held
  // focus before). There used to be no focus management at all, so closing with
  // Esc unmounted the dialog and lost focus to body (accessibility audit P1).
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (trigger && typeof trigger.focus === "function" && trigger.isConnected) {
        trigger.focus();
      }
    };
    // Once, on mount and unmount — focus enters on open and returns on close.
  }, []);

  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-label={sentence}
      tabIndex={-1}
      data-testid="topology-v2-edge-panel"
      className={`topology-chrome-in flex w-[300px] flex-col gap-3 rounded-[var(--topology-v2-panel-radius)] outline-none focus-visible:outline-none border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-4 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.kicker} · {typeLabel}
        </p>
        <IconButton
          label={labels.close}
          size="sm"
          onClick={onClose}
          data-testid="topology-v2-edge-panel-close"
          className="-mr-1 -mt-1 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </IconButton>
      </div>

      {/* The recorded reason is the protagonist when there is one; the templated sentence is
          the same for every edge of its type, so it drops to a caption above it. Without a
          note the sentence stands alone, as before (2026-09-06). */}
      <p
        data-testid="topology-v2-edge-sentence"
        className={
          why
            ? "text-caption leading-body text-[color:var(--topology-v2-panel-text-secondary)]"
            : "text-body-lg font-[var(--font-weight-signature)] leading-body-lg text-[color:var(--topology-v2-panel-text-primary)]"
        }
      >
        {sentence}
      </p>
      {why ? (
        <p
          data-testid="topology-v2-edge-why"
          className="text-body-lg font-[var(--font-weight-signature)] leading-body-lg text-[color:var(--topology-v2-panel-text-primary)]"
        >
          {why}
        </p>
      ) : null}

      {/* The two end nodes — clicking focuses that node. */}
      <div className="flex flex-col gap-0.5">
        {[
          { id: fromId, title: fromTitle },
          { id: toId, title: toTitle },
        ].map((n) => (
          <RowButton
            key={n.id}
            size="md"
            onClick={() => onSelectNode(n.id)}
            className="rounded-chip text-[color:var(--topology-v2-panel-text-secondary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {n.title}
          </RowButton>
        ))}
      </div>

      {declaredBy ? (
        <div className="flex flex-col gap-1 border-t border-[color:var(--topology-v2-panel-divider)] pt-2.5">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--topology-v2-panel-text-quaternary)]">
            {labels.declaredByLabel}
            {updatedAtLabel ? ` · ${updatedAtLabel}` : ""}
          </span>
          <Link
            href={declaredBy.href}
            data-testid="topology-v2-edge-declared-by"
            className={controlClass({ shape: "link", className: "truncate font-mono text-label text-[color:var(--topology-v2-panel-text-secondary)] hover:text-[color:var(--topology-v2-panel-text-primary)]" })}
          >
            {declaredBy.slug}.md → {labels.openDoc}
          </Link>
        </div>
      ) : null}

      {onEditRelation ? (
        <button
          type="button"
          onClick={onEditRelation}
          data-testid="topology-v2-edge-edit"
          className={EDIT_RELATION_ACTION_CLASS}
        >
          {labels.editRelation}
        </button>
      ) : meaningEditHref ? (
        <Link
          href={meaningEditHref}
          data-testid="topology-v2-edge-edit"
          className={EDIT_RELATION_ACTION_CLASS}
        >
          {labels.editRelation}
        </Link>
      ) : null}
    </aside>
  );
}
