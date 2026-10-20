import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { PAGE_TITLE } from '@/shared/ui/tokens/page-frame';

/** The Harness shell pays the 1600px column cap as a gutter, measured against its own `@container/harness`. */
export const HARNESS_GUTTER_X =
  'px-5 md:px-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;

/**
 * The horizontal frame each page body uses, so the title starts where the first line of the body
 * starts. `page` and `form` mirror `PAGE_FRAME` and `PAGE_FRAME_FORM` without their top inset.
 */
const FRAMES = {
  harness: HARNESS_GUTTER_X,
  page: 'mx-auto w-full max-w-[var(--page-max)] px-5 md:px-10',
  form: 'mx-auto w-full max-w-[960px] px-5 md:px-10',
} as const;

export type PageHeaderFrame = keyof typeof FRAMES;

/**
 * One 60px row for a workbench page: the title, an optional segmented view switcher right after it,
 * and the page's actions on the right. No lede lives here; it is the first line of the body.
 */
export function PageHeaderBar({
  frame,
  title,
  tabs,
  actions,
  tabsTestId,
  titleClassName,
  className,
}: {
  frame: PageHeaderFrame;
  title: string;
  /** A `TabBar variant="segmented"`. */
  tabs?: ReactNode;
  actions?: ReactNode;
  tabsTestId?: string;
  /** For a page whose tabs need the whole row at a narrow width, e.g. `max-md:hidden`. */
  titleClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('h-15 shrink-0 border-b border-[color:var(--color-divider)]', className)}>
      <div className={cn('flex h-full items-center gap-5', FRAMES[frame])}>
        <h1 className={cn(PAGE_TITLE, 'shrink-0 whitespace-nowrap', titleClassName)}>{title}</h1>
        {tabs ? (
          <div data-testid={tabsTestId} className="min-w-0">
            {tabs}
          </div>
        ) : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
