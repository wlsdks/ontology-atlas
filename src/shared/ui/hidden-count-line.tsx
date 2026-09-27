import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface HiddenCountLineProps {
  total: number;
  shown: number;
  /**
   * A function of the difference, not a finished string, so the rendered number cannot disagree
   * with `total - shown`.
   */
  label: (hidden: number) => string;
  /** Required: a remainder with nowhere to go is a dead number. */
  route: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * One quiet line saying what a truncated view leaves out and where to read it. Renders only
 * when `total > shown` (`hidden-count-line.test.tsx`). No trailing arrow
 * (`tests/contract/label-decoration.contract.test.ts`), and no colour or icon, because it
 * states a view boundary, not a vault problem.
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
