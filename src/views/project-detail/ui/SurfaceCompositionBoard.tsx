"use client";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";

import type { SurfaceCell } from "../model/surface-composition";

/**
 * The project's composition across Atlas's own surfaces, as the page's first block.
 *
 * The shape is a catalog entity's plugin cards (Backstage draws one small card per surface, each
 * with its headline and its door) rather than a dashboard of equal tiles: a project *is* its
 * ontology, so that cell is the wide one and the Library and Harness stand beside it. One
 * attention winner is the rule this page had lost — five figures at one weight read as
 * "everything matters, so nothing does".
 *
 * **Every cell is the same height and its door sits on the same line**, whatever its copy
 * length. Cards whose heights vary only because their copy differs is a named don't
 * (`forbidden.md`), and it is exactly what the owner saw as the page looking crooked
 * (2026-09-19). The grid gives each cell `grid-rows-[auto_1fr_auto]`: heading, body that takes
 * the slack, door at the bottom.
 */
export function SurfaceCompositionBoard({
  cells,
  titles,
  openLabels,
}: {
  cells: readonly SurfaceCell[];
  titles: Record<SurfaceCell["id"], string>;
  openLabels: Record<SurfaceCell["id"], string>;
}) {
  return (
    <ul
      data-testid="project-detail-surface-board"
      /*
       * Three equal columns once the page column passes 48rem, and the ontology cell worth two of
       * the others past 64rem: at 1024 the weighted split left the two narrow cells 210px, where a
       * sentence broke into four lines and the row stopped reading as a band (measured 2026-09-19).
       * Below 48rem every cell takes the full width and the reading order is the same one.
       */
      className="grid list-none grid-cols-1 gap-[var(--card-gap)] p-0 @3xl/project-page:grid-cols-3 @5xl/project-page:grid-cols-[2fr_1fr_1fr]"
    >
      {cells.map((cell) => (
        <li
          key={cell.id}
          data-testid="project-detail-surface-cell"
          data-surface={cell.id}
          className="grid grid-rows-[auto_1fr_auto] gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]"
        >
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {titles[cell.id]}
          </span>
          <div className="min-w-0">
            {cell.figures.length > 0 ? (
              <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                {cell.figures.map((figure) => (
                  /*
                   * `dt` before `dd` in the document, drawn the other way round. A description
                   * list groups a term with its description in that order — reversed, "9" is a
                   * description whose term has not been read yet, and a screen reader pairs them
                   * wrongly. The figure still reads "9 domains" on screen, because the row is
                   * reversed visually rather than in the markup.
                   */
                  <div key={figure.label} className="flex flex-row-reverse items-baseline justify-end gap-1.5">
                    <dt className="text-body text-[color:var(--color-text-tertiary)]">{figure.label}</dt>
                    <dd className="font-mono text-title tabular-nums text-[color:var(--color-text-primary)]">
                      {figure.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {cell.note ? (
              <p
                data-testid="project-detail-surface-note"
                className={`${cell.figures.length > 0 ? "mt-2" : ""} break-keep text-body leading-body text-[color:var(--color-text-tertiary)]`}
              >
                {cell.note}
              </p>
            ) : null}
          </div>
          <Link
            href={cell.href}
            prefetch={false}
            data-testid="project-detail-surface-open"
            className={controlClass({ shape: "link", tone: "accent", className: "self-end" })}
          >
            {openLabels[cell.id]}
          </Link>
        </li>
      ))}
    </ul>
  );
}
