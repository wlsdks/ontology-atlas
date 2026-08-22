import { useTranslations } from "next-intl";
import { controlClass } from '@/shared/ui/control-class';
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
 * Visibility (`shouldShowOutlineRail`) is decided by the caller and the viewport gate by CSS —
 * this component is a pure display assuming it was rendered.
 *
 * Why the viewport gate is `min-[1440px]` rather than `lg` (1024): the arithmetic of the
 * no-intrusion invariant. The body is `mx-auto max-w-760`, so its side margins are symmetric and
 * the arithmetic derived for the left applies to the right. Margin up to the body's glyph edge =
 * (viewport − 344 of left chrome − 760)/2 − 40, and the rail's left edge = 24 + width. A 168px
 * rail overlaps the body text below a viewport of ≈1404px, a 200px rail below ≈1520px. So it is
 * shown at 168px from 1440px (16px of clearance to the glyphs at 1440) and widened to 200px from
 * 1536px (32px of clearance). Below that the rail is hidden.
 */
export function DocReadingOutlineRail({
  headings,
  activeHeadingSlug,
  onHeadingClick,
}: DocReadingOutlineRailProps) {
  const t = useTranslations("vaultWidgets.parts.outline");
  return (
    <nav
      aria-label={t("railAria")}
      data-testid="doc-reading-outline-rail"
      className="absolute bottom-6 right-6 top-6 hidden w-[168px] flex-col overflow-y-auto min-[1440px]:flex min-[1536px]:w-[200px]"
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
