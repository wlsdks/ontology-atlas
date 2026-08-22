import type { SVGProps } from 'react';

/**
 * The X (formerly Twitter) mark — **a platform pointer**, not our brand.
 *
 * The reasoning is the same as `github-mark.tsx`: `lucide-react` dropped all
 * brand icons; this mark is not the name of something of ours but **the
 * destination of a link**; and we take none of that platform's layout, colour or
 * typography, only the destination's name tag. Both charter paragraphs in that
 * file apply here unchanged.
 *
 * Colour is a single `currentColor` — a mark arriving with its own colour would
 * be a **third colour system** (`.claude/rules/design.md` forbids it).
 *
 * The default size of 14 exists so it stands level with the GitHub mark: this
 * glyph also uses its 16 viewBox out to the edges, so it carries the same
 * optical weight as the Octicon beside it.
 */
const X_MARK_16 =
  'M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.6.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z';

export interface XMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** Rendered size in px, square. Default 14 — the same optical weight as the GitHub mark. */
  size?: number;
}

export function XMark({ size = 14, ...rest }: XMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path data-mark-part="x" d={X_MARK_16} />
    </svg>
  );
}
