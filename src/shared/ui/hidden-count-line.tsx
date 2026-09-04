import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface HiddenCountLineProps {
  /** How many rows the group really holds. */
  total: number;
  /** How many of them this view drew. */
  shown: number;
  /**
   * The sentence, formatted from the difference the component computes. Taking a
   * function rather than a finished string is the whole guarantee: a caller
   * cannot render this line with a number that disagrees with `total - shown`.
   */
  label: (hidden: number) => string;
  /**
   * Where the rest lives — a `Link` or a button. Required: a remainder with
   * nowhere to go is the dead number this repository already rejected once
   * (the project detail's "N more capabilities", 2026-08-12).
   */
  route: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * One plain line saying what a truncated view is not showing, and where to read it.
 *
 * **Why a primitive and not a per-site paragraph.** Four counted groups were
 * measured truncating in silence (2026-09-05 audit): the insights hero census
 * relation strip, the freshness "recently updated" list, the full-detail reach
 * domain bars, and the domain-coupling example edges. Each knew its true total
 * one line away from where it cut the array. A shared component makes the
 * invariant checkable in one place — `hidden-count-line.test.tsx`
 * asserts it renders **iff** `total > shown` and always carries the difference —
 * instead of trusting four hand-written ternaries to keep agreeing.
 *
 * **No trailing arrow.** `tests/contract/label-decoration.contract.test.ts`
 * forbids a decorative arrow after a link label, so the route reads as an
 * ordinary link and a middot carries the separation.
 *
 * Quiet by design: label-size quaternary text on the caller's own surface. This
 * states a boundary of the view, not a problem with the vault, so it introduces
 * no colour channel and no icon.
 */
export function HiddenCountLine({
  total,
  shown,
  label,
  route,
  className,
  'data-testid': testId = 'hidden-count-line',
}: HiddenCountLineProps) {
  const hidden = total - shown;
  if (!Number.isFinite(hidden) || hidden <= 0) return null;
  return (
    <p
      data-testid={testId}
      data-hidden-count={hidden}
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]',
        className,
      )}
    >
      <span className="min-w-0">{label(hidden)}</span>
      <span aria-hidden>·</span>
      {route}
    </p>
  );
}
