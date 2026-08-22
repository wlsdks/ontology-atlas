import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface EmptyStateProps {
  /** One-line summary of the empty situation; a node, so it may contain a link. */
  title: ReactNode;
  /**
   * `p` by default: an empty state inside a list or section is not a document
   * division.
   *
   * **Pass `h1` where this card *is* the whole page body.** Measured while
   * dogfooding, 2026-07-29: a route that degraded to a single fallback card at
   * narrow widths ended up with **zero** heading elements, leaving a screen
   * reader user no way to hear what the page was or why the real surface did not
   * open. A degradation card promises "why, and where to go next"; if the "why"
   * cannot be read, that promise is not kept.
   *
   * Only the tag changes — Tailwind preflight resets heading size and weight to
   * `inherit`, so the classes below still decide the appearance.
   */
  titleAs?: 'p' | 'h1' | 'h2';
  /** Supporting text or the next action; a node, so it may contain a link. */
  description?: ReactNode;
  /** Line-art glyph, framed in a muted rounded square. Above the title when centred, left of it otherwise. */
  icon?: ReactNode;
  /**
   * `true` draws three muted bars; a node draws that shape instead. Shows an
   * empty chart or list the shape it will take rather than a long blank.
   * Decorative, hence `aria-hidden`.
   */
  skeleton?: boolean | ReactNode;
  /** Primary action at the bottom. */
  action?: ReactNode;
  /** `regular` when the card needs more room. */
  size?: 'compact' | 'regular';
  /** `dashed` signals "something belongs here"; `solid` suits a whole empty page. */
  tone?: 'dashed' | 'solid';
  /** `center` is for a page body that is empty apart from one sentence. */
  align?: 'left' | 'center';
  className?: string;
}

/** Three muted bars, hinting at the shape a list or chart will take. */
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
 * Shared empty state for lists and sections. A whole empty page calls it with
 * `tone="solid"` + `align="center"` to show one centred sentence.
 */
export function EmptyState({
  title,
  titleAs = 'p',
  description,
  icon,
  skeleton,
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
  const titleEl = (
    <TitleTag
      className={cn(
        'font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
        size === 'compact' ? 'text-body-lg' : 'text-title',
        // The one-sentence centred pattern reads as body text, not a heading.
        isCenter && 'font-normal text-body-lg text-[color:var(--color-text-tertiary)]',
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

  const skeletonEl = skeleton
    ? typeof skeleton === 'boolean'
      ? <DefaultSkeleton align={align} />
      : (
          <div aria-hidden data-empty-skeleton className={cn('w-full', isCenter && 'flex justify-center')}>
            {skeleton}
          </div>
        )
    : null;

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
        <div className="flex items-start gap-3">
          {iconEl}
          {textBlock}
        </div>
      ) : (
        <>
          {iconEl && isCenter ? <div className="mb-3 flex justify-center">{iconEl}</div> : null}
          {textBlock}
        </>
      )}
      {action ? (
        <div className={cn('mt-4 flex flex-wrap gap-2', isCenter && 'justify-center')}>
          {action}
        </div>
      ) : null}
    </div>
  );
}
