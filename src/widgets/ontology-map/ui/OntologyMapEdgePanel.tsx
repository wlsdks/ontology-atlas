"use client";

import { useEffect, useRef } from "react";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";

import { Link } from "@/i18n/navigation";
import { Button, buttonVariants, CloseButton, RowButton } from "@/shared/ui";
import { controlClass } from '@/shared/ui/control-class';
import { cn } from "@/shared/lib/cn";

/**
 * The edge panel's one action wears the node panel's primary grammar: `Button` sm on the chip
 * radius. A `<Link>` cannot be a `<Button>`, so both branches use the Button's own variant
 * string.
 */
const EDIT_RELATION_ACTION_TRIM = "atlas-touch-floor w-full rounded-chip";
/** The same class for the `<Link>` branch, which cannot be a `<Button>`. */
const EDIT_RELATION_ACTION_CLASS = cn(buttonVariants({ variant: "primary", size: "sm" }), EDIT_RELATION_ACTION_TRIM);

/**
 * The edge popover: one relation's plain sentence, type and direction, declaring source (.md),
 * change date and a relation-edit deep link. Display-only; the caller assembles sentence and
 * labels.
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
  // Focus moves into the dialog on open so `role=dialog` plus `aria-label` is announced, and
  // returns to the trigger on close.
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
      className={`topology-chrome-in flex w-[var(--map-panel-width)] flex-col gap-3 rounded-[var(--map-panel-radius)] outline-none focus-visible:outline-none border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-4 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--map-panel-text-tertiary)]">
          {labels.kicker} · {typeLabel}
        </p>
        <CloseButton
          label={labels.close}
          onClick={onClose}
          data-testid="map-edge-panel-close"
          className="-mr-2 -mt-2 text-[color:var(--map-panel-text-tertiary)] hover:text-[color:var(--map-panel-text-primary)]"
        />
      </div>

      {/* With a recorded reason it leads; the templated sentence is the same for every edge of its
         type, so it drops to a caption. */}
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
            {/* Same row grammar as the node panel's connection rows: kind glyph first, then the name. The
               kind is the id's prefix, the one place it is always known. */}
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
          {/* The label is the document's name only; the action stays in the accessible name, so no arrow
             decorates it. */}
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
        <Button
          size="sm"
          onClick={onEditRelation}
          data-testid="map-edge-edit"
          className={EDIT_RELATION_ACTION_TRIM}
        >
          {labels.editRelation}
        </Button>
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
