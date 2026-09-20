"use client";

import { useEffect, useRef } from "react";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

const EDIT_RELATION_ACTION_CLASS = controlClass({
  shape: "chip",
  className:
    "h-8 justify-center border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] text-label text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]",
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
export interface OntologyMapEdgePanelProps {
  /** The plain sentence — "A leans on B" (from the lexicon's plain register). */
  sentence: string;
  /** The formal type label — "depends". */
  typeLabel: string;
  fromTitle: string;
  toTitle: string;
  /** P6 — one line of rationale for the relation (relation_notes). null omits it. */
  why?: string | null;
  /** Shown under the sentence when no reason is recorded, so the absence is said, not implied. */
  noReasonHint?: string | null;
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

export function OntologyMapEdgePanel({
  sentence,
  typeLabel,
  fromTitle,
  toTitle,
  why = null,
  noReasonHint = null,
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
}: OntologyMapEdgePanelProps) {
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
      data-testid="map-edge-panel"
      className={`topology-chrome-in flex w-[300px] flex-col gap-3 rounded-[var(--map-panel-radius)] outline-none focus-visible:outline-none border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-4 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--map-panel-text-tertiary)]">
          {labels.kicker} · {typeLabel}
        </p>
        <IconButton
          label={labels.close}
          size="sm"
          onClick={onClose}
          data-testid="map-edge-panel-close"
          className="-mr-1 -mt-1 text-[color:var(--map-panel-text-tertiary)] hover:text-[color:var(--map-panel-text-primary)]"
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </IconButton>
      </div>

      {/* The recorded reason is the protagonist when there is one; the templated sentence is
          the same for every edge of its type, so it drops to a caption above it. Without a
          note the sentence stands alone, as before (2026-09-06). */}
      <p
        data-testid="map-edge-sentence"
        className={
          why
            ? "text-caption leading-body text-[color:var(--map-panel-text-secondary)]"
            : "text-body-lg font-[var(--font-weight-signature)] leading-body-lg text-[color:var(--map-panel-text-primary)]"
        }
      >
        {sentence}
      </p>
      {why ? (
        <p
          data-testid="map-edge-why"
          className="text-body-lg font-[var(--font-weight-signature)] leading-body-lg text-[color:var(--map-panel-text-primary)]"
        >
          {why}
        </p>
      ) : noReasonHint ? (
        <p data-testid="map-edge-no-reason" className="text-caption leading-body text-[color:var(--map-panel-text-tertiary)]">
          {noReasonHint}
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
            className="rounded-chip text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]"
          >
            {/* The same row grammar as the node panel's connection rows: the kind
                glyph first, then the name. Two bare names read as headings, not as
                the doors to the two nodes they are (2026-09-19). The kind is the
                id's prefix — the one place it is always known. */}
            <OntologyMapKindGlyph kind={n.id.split(":")[0] ?? ""} />
            <span className="min-w-0 flex-1 truncate">{n.title}</span>
          </RowButton>
        ))}
      </div>

      {declaredBy ? (
        <div className="flex flex-col gap-1 border-t border-[color:var(--map-panel-divider)] pt-2.5">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--map-panel-text-quaternary)]">
            {labels.declaredByLabel}
            {updatedAtLabel ? ` · ${updatedAtLabel}` : ""}
          </span>
          {/*
            The label is the document's name and nothing else. It used to read
            `{slug}.md → {openDoc}`, an arrow between a name and an action inside
            a link that navigates within the app — the decoration `forbidden.md`
            refuses, and the one shape the label-decoration gate's two scans
            cannot see (they look for an arrow followed by a tag, or alone in an
            element). The action stays in the accessible name so a reader still
            hears what pressing it does.
          */}
          <Link
            href={declaredBy.href}
            aria-label={`${declaredBy.slug}.md · ${labels.openDoc}`}
            data-testid="map-edge-declared-by"
            className={controlClass({ shape: "link", className: "truncate font-mono text-label text-[color:var(--map-panel-text-secondary)] hover:text-[color:var(--map-panel-text-primary)]" })}
          >
            {declaredBy.slug}.md
          </Link>
        </div>
      ) : null}

      {onEditRelation ? (
        <button
          type="button"
          onClick={onEditRelation}
          data-testid="map-edge-edit"
          className={EDIT_RELATION_ACTION_CLASS}
        >
          {labels.editRelation}
        </button>
      ) : meaningEditHref ? (
        <Link
          href={meaningEditHref}
          data-testid="map-edge-edit"
          className={EDIT_RELATION_ACTION_CLASS}
        >
          {labels.editRelation}
        </Link>
      ) : null}
    </aside>
  );
}
