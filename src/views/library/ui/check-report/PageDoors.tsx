"use client";

import { controlClass } from "@/shared/ui/control-class";

import { pageName } from "../../model/check-report/structural-rows";

/**
 * The door is the row's whole ability, so it takes the brightest interactive ink. `px-1.5` keeps the
 * 2px inset focus ring off the glyphs; the paragraph's `-ml-1.5` gives it back to the column.
 */
export function PageDoors({
  pages,
  suffixes,
  onOpenPage,
}: {
  pages: readonly string[];
  /** Appended after the last page: a line number per collapsed row, or a provenance word. */
  suffixes?: readonly string[];
  onOpenPage: (slug: string) => void;
}) {
  return (
    <p className="-ml-1.5 mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]">
      {pages.map((slug, pageIndex) => (
        <span key={slug} className="inline-flex items-center gap-x-1">
          {pageIndex > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            data-testid="library-finding-page"
            onClick={() => onOpenPage(slug)}
            className={controlClass({
              shape: "link",
              size: "lg",
              tone: "strong",
              className:
                "atlas-touch-floor px-1.5 underline decoration-[color:var(--color-indigo-line-a40)] underline-offset-2 hover:decoration-[color:var(--color-indigo-accent)]",
            })}
          >
            {pageName(slug)}
          </button>
        </span>
      ))}
      {(suffixes ?? []).map((suffix, suffixIndex) => (
        <span key={`${suffixIndex}-${suffix}`} className="inline-flex items-center gap-x-1">
          <span aria-hidden>·</span>
          <span>{suffix}</span>
        </span>
      ))}
    </p>
  );
}
