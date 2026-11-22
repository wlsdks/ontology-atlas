import type { ReactNode } from 'react';

import { DESTINATION_HREF } from '@/shared/config/destinations';

export const MAP_TIDY_LIST_HREF = `${DESTINATION_HREF.map}?index=expanded`;

/** One line-1 box for every row kind: a row with a link is 8px taller (the link control carries the 24px WCAG 2.5.8 floor), so rows without one reserve the same box and the pitch stays equal in all three tabs. */
export const ROW_HEADLINE_CLASS = 'flex min-h-6 min-w-0 items-center gap-1.5';

/** The 12px mark column every row wears, drawn or not, so the sentence starts at the same x in all three tabs. */
export function RowMark({ children }: { children?: ReactNode }) {
  return (
    <span className="mt-0.5 flex size-3 shrink-0 items-center justify-center self-start">
      {children}
    </span>
  );
}

export function InboxEmpty({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="grid justify-items-center px-1 py-6 text-center text-caption leading-label text-[color:var(--color-text-tertiary)]"
    >
      {children}
    </div>
  );
}
