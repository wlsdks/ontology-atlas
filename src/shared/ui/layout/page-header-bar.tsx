import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { PAGE_TITLE } from '@/shared/ui/tokens/page-frame';

/** The Harness shell pays the 1600px column cap as a gutter, measured against its own `@container/harness`. */
export const HARNESS_GUTTER_X =
  'px-5 md:px-[max(2.5rem,calc((100cqw_-_var(--page-max))/2_+_2.5rem))]' as const;

/**
 * The horizontal frame each page body uses, so the title starts where the first line of the body
 * starts. `page` and `form` pay `PAGE_FRAME`'s and `PAGE_FRAME_FORM`'s column cap as a gutter, so the bar
 * spans the pane and its divider meets both edges.
 */
const FRAMES = {
  harness: HARNESS_GUTTER_X,
  page: 'px-5 md:px-[max(2.5rem,calc((100%_-_var(--page-max))/2_+_2.5rem))]',
  form: 'px-5 md:px-[max(2.5rem,calc((100%_-_960px)/2_+_2.5rem))]',
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
  titleAs: Title = 'h1',
  className,
}: {
  frame: PageHeaderFrame;
  title: string;
  /** A `TabBar variant="segmented"`. */
  tabs?: ReactNode;
  actions?: ReactNode;
  tabsTestId?: string;
  /** For a page whose tabs need the whole row at a narrow width, e.g. `max-md:sr-only`. */
  titleClassName?: string;
  /** `p` where the pane below already owns the page's one h1. */
  titleAs?: 'h1' | 'p';
  className?: string;
}) {
  return (
    <div className={cn('sticky top-0 z-20 h-15 shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]', className)}>
      <div data-page-header-row className={cn('flex h-full items-center gap-5', FRAMES[frame])}>
        <Title className={cn(PAGE_TITLE, 'shrink-0 whitespace-nowrap', titleClassName)}>{title}</Title>
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
