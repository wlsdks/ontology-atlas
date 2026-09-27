"use client";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";

import type { SurfaceCell } from "../model/surface-composition";

/**
 * One card per surface, the ontology wide. Cells share a height and a door line whatever their
 * copy (`.claude/rules/forbidden.md`, content-decided card height). No proportion bar over the
 * totals: they form a containment pyramid, not parts of a whole.
 */
export function SurfaceCompositionBoard({
  cells,
  titles,
  openLabels,
}: {
  cells: readonly SurfaceCell[];
  titles: Record<SurfaceCell["id"], string>;
  /** A cell without a label draws no door. */
  openLabels: Partial<Record<SurfaceCell["id"], string>>;
}) {
  const closesOnNote = (cell: SurfaceCell) =>
    Boolean(cell.note) && cell.figures.length > 0 && !openLabels[cell.id];
  return (
    <ul
      data-testid="project-detail-surface-board"
      /* Weighted only past 64rem; earlier it squeezed the narrow cells into four-line sentences. */
      className="grid list-none grid-cols-1 gap-[var(--card-gap)] p-0 @3xl/project-page:grid-cols-3 @5xl/project-page:grid-cols-[2fr_1fr_1fr]"
    >
      {cells.map((cell) => (
        <li
          key={cell.id}
          data-testid="project-detail-surface-cell"
          data-surface={cell.id}
          className="grid grid-rows-[auto_1fr_auto] gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)]"
        >
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {titles[cell.id]}
          </span>
          <div className="min-w-0">
            {cell.figures.length > 0 ? (
              <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                {cell.figures.map((figure) => (
                  /* Term first in the markup for screen readers; reversed visually to read "9 domains". */
                  <div key={figure.label} className="flex flex-row-reverse items-baseline justify-end gap-1.5">
                    <dt className="text-body text-[color:var(--color-text-tertiary)]">{figure.label}</dt>
                    <dd className="font-mono text-title tabular-nums text-[color:var(--color-text-primary)]">
                      {figure.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {cell.note && !closesOnNote(cell) ? (
              <p
                data-testid="project-detail-surface-note"
                className={`${cell.figures.length > 0 ? "mt-2" : ""} break-keep text-body leading-body text-[color:var(--color-text-tertiary)]`}
              >
                {cell.note}
              </p>
            ) : null}
          </div>
          {/* Without a door the note takes the door line. */}
          {closesOnNote(cell) ? (
            <p
              data-testid="project-detail-surface-note"
              className="self-end text-body leading-body text-[color:var(--color-text-tertiary)]"
            >
              {cell.note}
            </p>
          ) : null}
          {openLabels[cell.id] ? (
          <Link
            href={cell.href}
            prefetch={false}
            data-testid="project-detail-surface-open"
            /* 44px coarse-pointer target; one door per cell a card gap apart, so no expanded areas meet. */
            className={controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand self-end" })}
          >
            {openLabels[cell.id]}
          </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
