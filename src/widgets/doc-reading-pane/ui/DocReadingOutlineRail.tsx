import { useTranslations } from "next-intl";
import { controlClass } from '@/shared/ui/control-class';
import type { OutlineRailFit } from "../lib/outline-rail";
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
  /**
   * Which width the pane can actually spare. `hidden` never reaches this component —
   * the pane stops rendering it — so the prop carries only the two drawn cases and
   * defaults to the narrow one, which is the safe answer when nothing measured yet.
   */
  fit?: Exclude<OutlineRailFit, "hidden">;
}

/**
 * The read-only outline rail, always rendered in the empty band to the right of the body.
 *
 * It sits to the right of the body, following the "on this page" convention of GitHub and most
 * document readers. (It used to be on the left, immediately beside the sidebar, which read as four
 * columns: rail, document list, TOC, body.) The `back to top` button (`BackToTopButton`) moved to
 * the left to avoid colliding in the same bottom-right corner.
 *
 * This is a pure reading aid — no pin, edit, or share; a click only jumps the scroll. It is
 * absolutely positioned inside the `position:relative` wrapper outside the article scroll
 * container, so it keeps the same on-screen position while scrolling and never intrudes on the
 * body's max-w-760 (it consumes only the empty band — `.claude/rules/design.md`).
 *
 * Visibility is decided by the caller: `shouldShowOutlineRail` on the heading count and
 * `resolveOutlineRailFit` on the reading pane's measured width. This component is a pure display
 * assuming it was rendered, and `fit` only picks which of the two widths it wears.
 *
 * ⚠️ **The width gate left CSS on 2026-09-06.** It used to be `min-[1440px]` / `min-[1536px]`,
 * which is the viewport minus a constant 344px of chrome — true until a right-hand dock opened and
 * took 420px out of the same row without changing the viewport by a pixel. The rail was then drawn
 * across the body text. `lib/outline-rail.ts` carries the arithmetic and the measurement; the two
 * pane floors it names (1096 and 1192) are the same widths those media queries encoded.
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
      className={`absolute bottom-6 right-6 top-6 flex flex-col overflow-y-auto ${
        fit === "wide" ? "w-[200px]" : "w-[168px]"
      }`}
    >
      <span className="mb-2 flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
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
