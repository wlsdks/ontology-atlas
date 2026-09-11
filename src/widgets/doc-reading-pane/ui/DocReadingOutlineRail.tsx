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
 * reading column (it consumes only the empty band — `.claude/rules/design.md`).
 *
 * ## It is anchored to the column, not to the pane (2026-09-11)
 *
 * It used to be `right-6`: pinned to the pane's right edge, with whatever a centred column left
 * behind as the distance to the text. That distance was therefore a residue of the pane's width
 * rather than a decision — measured in the installed app at 1512, the rail's glyphs sat at
 * x=1322 both before and after the reading line was capped at the prose measure, while the
 * text's right edge moved from 1257 to 1083. The rail had not moved; the 239px hole was the
 * column shrinking away from something that was never following it.
 *
 * Now `left` is the column's right edge plus one gap, so the distance is a decision at every
 * pane width. Since 2026-09-12 the pane reserves the rail's lane as padding on its own side and
 * the column centres in what is left, which makes the composition
 * `[gutter][column][gap][rail][gutter]` with both gutters equal by construction — so this
 * `left` is half a lane left of the pane's centre. `lib/outline-rail.ts` owns that offset
 * (`OUTLINE_RAIL_LEFT_CLASS`) and the matching fit floors.
 *
 * Visibility is decided by the caller: `shouldShowOutlineRail` on the heading count and
 * `resolveOutlineRailFit` on the reading pane's measured width. This component is a pure display
 * assuming it was rendered, and `fit` only picks which of the two widths it wears.
 *
 * ⚠️ **The width gate left CSS on 2026-09-06.** It used to be `min-[1440px]` / `min-[1536px]`,
 * which is the viewport minus a constant 344px of chrome — true until a right-hand dock opened and
 * took 420px out of the same row without changing the viewport by a pixel. The rail was then drawn
 * across the body text. `lib/outline-rail.ts` carries the arithmetic and the measurement; its two
 * pane floors are now derived from the reading measure (1045 and 1109) rather than from the
 * 1096/1192 those media queries encoded.
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
      /* `left` is the column's right edge plus one gap. The column is centred in the pane
         minus the rail's lane, so its centre is half a lane left of `50%` — the offset
         `OUTLINE_RAIL_LEFT_CLASS` carries. No `right` anchor: the rail follows the text
         rather than the pane, and `outline-rail.ts` guarantees it fits before the caller
         draws it. */
      className={`absolute bottom-6 top-6 flex flex-col overflow-y-auto ${
        fit === "wide" ? OUTLINE_RAIL_LEFT_CLASS.wide : OUTLINE_RAIL_LEFT_CLASS.narrow
      } ${fit === "wide" ? OUTLINE_RAIL_WIDTH_CLASS.wide : OUTLINE_RAIL_WIDTH_CLASS.narrow}`}
    >
      {/*
        ⚠️ **`pl-3` is the items' own left inset, not spacing.** Each item below carries
        `border-l-2` plus `pl-2.5` — 12px before its first glyph — while this label had
        none, so the rail's own name stood 12px left of everything it names (measured in
        the installed app at 1512: label x=1261.5, items x=1271–1272). The alternative was
        moving the border into a negative margin, which would have pushed the active bar
        out of the rail and towards the text it is not part of. `docs/DESIGN-SYSTEM.md`,
        "One text edge per column".
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
