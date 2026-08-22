/**
 * The outline rail's visibility threshold — a pure verdict.
 *
 * Gated on the heading count so the always-on rail does not become noise on a short document. The
 * viewport gate (`min-[1440px]` and up, where the empty band can hold the rail — the arithmetic is
 * in `DocReadingOutlineRail.tsx`) is CSS's job; this function judges the heading count only.
 */
export const OUTLINE_RAIL_MIN_HEADINGS = 4;

export function shouldShowOutlineRail(headingCount: number): boolean {
  return headingCount >= OUTLINE_RAIL_MIN_HEADINGS;
}
