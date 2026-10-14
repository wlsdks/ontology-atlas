import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface EmptyStateProps {
  /** A node, so it may contain a link. */
  title: ReactNode;
  /**
   * Pass `h1` where this card is the whole page body, so the page has a heading. Only the tag
   * changes: preflight resets heading size and weight, so the classes still decide.
   */
  titleAs?: 'p' | 'h1' | 'h2';
  /** A node, so it may contain a link. */
  description?: ReactNode;
  /** Framed in a muted square: above the title when centred, left of it otherwise. */
  icon?: ReactNode;
  /**
   * Passing `true` draws three muted bars, a node draws that shape: the shape the content will
   * take. Decorative.
   */
  skeleton?: boolean | ReactNode;
  /**
   * A ghost row of the finished empty list, drawn in place of the skeleton. The arrival gate
   * counts `[data-empty-skeleton]` as unpainted, and an empty destination is finished.
   */
  shape?: ReactNode;
  action?: ReactNode;
  size?: 'compact' | 'regular';
  /** `dashed` says "something belongs here"; `solid` suits a whole empty page. */
  tone?: 'dashed' | 'solid';
  /** `center` is for a page body that is empty apart from one sentence. */
  align?: 'left' | 'center';
  className?: string;
}

function DefaultSkeleton({ align }: { align: 'left' | 'center' }) {
  const widths = ['72%', '52%', '38%'];
  return (
    <div
      aria-hidden
      data-empty-skeleton
      className={cn('flex w-full flex-col gap-2', align === 'center' && 'items-center')}
    >
      {widths.map((w) => (
        <span
          key={w}
          className="block h-2 rounded-full bg-[color:var(--color-overlay-2)]"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

/**
 * Shared empty state for lists and sections. A whole empty page uses `tone="solid"`
 * and `align="center"`.
 */
export function EmptyState({
  title,
  titleAs = 'p',
  description,
  icon,
  skeleton,
  shape,
  action,
  size = 'regular',
  tone = 'dashed',
  align = 'left',
  className,
}: EmptyStateProps) {
  const borderClass =
    tone === 'dashed'
      ? 'border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]'
      : 'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]';
  const padClass = size === 'compact' ? 'px-4 py-4' : 'px-5 py-6';
  const centerPadOverride = align === 'center' ? 'px-6 py-10' : null;
  const isCenter = align === 'center';

  const TitleTag = titleAs;
  /*
   * Only the one-sentence centred card demotes its title to body text; with a description the
   * title keeps the heading step so the two lines do not read as one grey block.
   */
  const demoteTitle = isCenter && !description;
  const titleEl = (
    <TitleTag
      className={cn(
        'font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
        size === 'compact' ? 'text-body-lg' : 'text-title',
        demoteTitle && 'font-normal text-body-lg text-[color:var(--color-text-tertiary)]',
      )}
    >
      {title}
    </TitleTag>
  );

  const descriptionEl = description ? (
    <p
      className={cn(
        'leading-title text-[color:var(--color-text-tertiary)]',
        size === 'compact' ? 'mt-1 text-body' : 'mt-2 text-body-lg',
      )}
    >
      {description}
    </p>
  ) : null;

  const iconEl = icon ? (
    <span
      aria-hidden
      data-empty-icon
      className="inline-flex size-9 flex-none items-center justify-center rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)] [&>svg]:size-4"
    >
      {icon}
    </span>
  ) : null;

  const skeletonEl = shape
    ? (
        <div aria-hidden data-empty-shape className={cn('w-full', isCenter && 'flex justify-center')}>
          {shape}
        </div>
      )
    : skeleton
      ? typeof skeleton === 'boolean'
        ? <DefaultSkeleton align={align} />
        : (
            <div aria-hidden data-empty-skeleton className={cn('w-full', isCenter && 'flex justify-center')}>
              {skeleton}
            </div>
          )
      : null;

  const actionEl = action ? (
    <div data-empty-action className={cn('mt-4 flex flex-wrap gap-2', isCenter && 'justify-center')}>
      {action}
    </div>
  ) : null;

  const textBlock = (
    <div className="min-w-0">
      {titleEl}
      {descriptionEl}
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-panel border',
        borderClass,
        centerPadOverride ?? padClass,
        isCenter && 'text-center',
        className,
      )}
      data-empty-tone={tone}
      data-empty-align={align}
    >
      {skeletonEl ? <div className="mb-4">{skeletonEl}</div> : null}
      {iconEl && !isCenter ? (
        /* The action row sits in the text column, so it starts on the text's line. */
        <div className="flex items-start gap-3">
          {iconEl}
          <div className="min-w-0 flex-1">
            {textBlock}
            {actionEl}
          </div>
        </div>
      ) : (
        <>
          {iconEl && isCenter ? <div className="mb-3 flex justify-center">{iconEl}</div> : null}
          {textBlock}
          {actionEl}
        </>
      )}
    </div>
  );
}
