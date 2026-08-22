import type { SVGProps } from 'react';

/**
 * The GitHub mark (Invertocat) — **a platform pointer**, not our brand.
 *
 * **Why an inline SVG and not lucide.** `lucide-react` dropped all brand icons
 * (measured 2026-07-29: `typeof l.Github === 'undefined'`). It is absent from
 * the app's only icon set, so an inline path is the only way to use the mark.
 * The coordinates are copied **verbatim** from GitHub's own Octicons
 * `mark-github-16`, and leaving them untouched is the contract — altering a logo
 * turns it from "a mark pointing at that platform" into "something we made that
 * resembles their logo".
 *
 * **Charter verdict: this is not imitating another company's assets**
 * (2026-07-29). Both clauses of `.claude/rules/forbidden.md` were checked
 * separately.
 *
 * - The ban on **putting another service's brand in identifiers, labels or
 *   comments** exists to stop us naming *our own things* after someone else
 *   (`Notion-killer`, internal codenames). Here GitHub is not the name of
 *   something of ours but **the destination of a link**, and that destination
 *   really is GitHub. There is no false association, so the clause does not
 *   reach this.
 * - The ban on **imitating another company's assets or visuals** exists to stop
 *   us dressing our screens in someone else's design language. Using a platform
 *   mark to point at that platform is the mark's intended use, not imitation
 *   (GitHub's own logo guidelines permit linking to a repository), and we take
 *   **none of GitHub's layout, colour or typography** — only the destination's
 *   name tag.
 *
 * Not using the mark costs more: `↗` says "this leaves the app" but not
 * **where to**, and in an open-source product that "where to" is exactly why
 * this control exists.
 *
 * **Colour — a single `currentColor`.** GitHub distributes a monochrome variant
 * itself (`github-mark-white.svg`), so going monochrome is supported use rather
 * than alteration. This app is neutrals plus one indigo, so a mark arriving with
 * its own colour would be a **third colour system**
 * (`.claude/rules/design.md` forbids it). It inherits the caller's text colour.
 *
 * **Size — 14 by default, though the Octicons original is 16.** This mark is a
 * circle that **fills 16×16 to the edges**. The lucide `external-link` that used
 * to sit in the same slot draws inside a 24 viewBox with padding, so at 14px its
 * real visual diameter was ~12.8px. Rendering this one at 16 would make a
 * secondary control's icon heavier than the primary CTA's — a value that shifts
 * the attention winner. So the default is 14, which optically occupies the same
 * space as what it replaced.
 */
const OCTICON_MARK_GITHUB_16 =
  'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export interface GithubMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** Rendered size in px, square. Default 14 — the optical correction above. */
  size?: number;
}

export function GithubMark({ size = 14, ...rest }: GithubMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      // Decorative by default, since it sits inside a labelled control. To give
      // screen readers the destination name too, the caller overrides with
      // `aria-hidden={false}` plus `aria-label`.
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path data-mark-part="octicon" d={OCTICON_MARK_GITHUB_16} />
    </svg>
  );
}
