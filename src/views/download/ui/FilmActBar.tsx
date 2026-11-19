'use client';

import type { Ref } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * A film's acts as a row of short bars under its caption: each fills while its act plays, and a
 * press jumps there. The fills are set by the film's own frame (`fills`), not by React state.
 * On a touchscreen each bar's button grows to the 44px finger floor; the bar stays a line.
 * `align="start"` lines the first bar up with a left-aligned caption above it.
 */
export function FilmActBar({
  titles,
  label,
  fills,
  onSeek,
  align = 'center',
  className,
}: {
  titles: readonly string[];
  label: string;
  fills: Ref<(HTMLSpanElement | null)[]>;
  onSeek: (act: number) => void;
  align?: 'center' | 'start';
  className?: string;
}) {
  const setFill = (i: number) => (node: HTMLSpanElement | null) => {
    if (fills && typeof fills === 'object' && fills.current) fills.current[i] = node;
  };
  return (
    <nav aria-label={label} className={cn('flex items-center gap-1.5', align === 'start' ? 'justify-start' : 'justify-center', className)}>
      {titles.map((title, i) => (
        <button
          key={title}
          type="button"
          aria-label={`${String(i + 1).padStart(2, '0')} ${title}`}
          onClick={() => onSeek(i)}
          className="atlas-touch-floor atlas-touch-floor-wide group grid h-6 w-10 place-items-center rounded-micro focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          <span className="relative block h-0.5 w-full overflow-hidden rounded-full bg-[color:var(--color-border-strong)] transition-colors duration-[var(--motion-fast)] group-hover:bg-[color:var(--color-text-tertiary)]">
            <span
              ref={setFill(i)}
              style={{ transform: 'scaleX(0)' }}
              className="absolute inset-0 origin-left rounded-full bg-[color:var(--color-text-primary)]"
            />
          </span>
        </button>
      ))}
    </nav>
  );
}
