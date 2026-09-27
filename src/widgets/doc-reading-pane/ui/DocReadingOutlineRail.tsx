import { useTranslations } from "next-intl";
import { controlClass } from '@/shared/ui/control-class';
import {
  OUTLINE_RAIL_LEFT_CLASS,
  OUTLINE_RAIL_WIDTH_CLASS,
  type OutlineRailFit,
} from "../lib/outline-rail";
/**
 * One entry in a document outline.
 *
 * Until 2026-07-28 this type lived in `DocsVaultDocOutlinePanel` (the document info inspector).
 * That panel's five actions (pin, copy link, print, edit, delete) were **all already in the ⌘K
 * palette** and the outline was already drawn by this rail, so the panel was removed. This file,
 * now the outline's sole owner, owns the type too.
 */
export interface OutlineHeading {
  slug: string;
  text: string;
  depth: number;
  /** Which occurrence of the same text this is — used to distinguish duplicate headings. */
  occurrence: number;
  duplicate: boolean;
}

export interface DocReadingOutlineRailProps {
  headings: OutlineHeading[];
  activeHeadingSlug: string | null;
  onHeadingClick: (slug: string) => void;
  /** Which width the pane can spare; defaults to narrow, the safe answer before measurement. */
  fit?: Exclude<OutlineRailFit, "hidden">;
}

/**
 * Read-only outline rail in the empty band right of the body (`.claude/rules/design.md`); a click
 * only jumps the scroll. `left` follows the column, not the pane; `lib/outline-rail.ts` owns the
 * offset and the fit floors, and the caller decides visibility.
 */
export function DocReadingOutlineRail({
  headings,
  activeHeadingSlug,
  onHeadingClick,
  fit = "narrow",
}: DocReadingOutlineRailProps) {
  const t = useTranslations("vaultWidgets.parts.outline");
  return (
    <nav
      aria-label={t("railAria")}
      data-testid="doc-reading-outline-rail"
      data-outline-fit={fit}
      /*
       * `left` is the column's right edge plus one gap (`OUTLINE_RAIL_LEFT_CLASS`); no `right`
       * anchor so the rail follows the text.
       */
      className={`absolute bottom-6 top-6 flex flex-col overflow-y-auto ${
        fit === "wide" ? OUTLINE_RAIL_LEFT_CLASS.wide : OUTLINE_RAIL_LEFT_CLASS.narrow
      } ${fit === "wide" ? OUTLINE_RAIL_WIDTH_CLASS.wide : OUTLINE_RAIL_WIDTH_CLASS.narrow}`}
    >
      {/*
       * `pl-3` matches the items' own left inset so the label shares their text edge
       * (`docs/DESIGN-SYSTEM.md`, "One text edge per column").
       */}
      <span className="mb-2 flex-none pl-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t("railLabel")} · {headings.length}
      </span>
      <ul className="flex flex-col gap-0.5 text-body">
        {headings.map((heading, index) => {
          const isActive = activeHeadingSlug === heading.slug;
          return (
            <li key={`${heading.slug}:${index}`}>
              <a
                href={`#${heading.slug}`}
                onClick={(event) => {
                  event.preventDefault();
                  onHeadingClick(heading.slug);
                }}
                aria-current={isActive ? "true" : undefined}
                className={controlClass({
                  shape: "row",
                  stacked: true,
                  size: "sm",
                  tone: isActive ? "default" : "muted",
                  className: `block truncate border-l-2 py-1.5 pl-2.5 leading-body ${
                    isActive
                      ? "border-[color:var(--color-indigo-accent)]"
                      : "border-transparent hover:text-[color:var(--color-text-secondary)]"
                  }`,
                })}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
