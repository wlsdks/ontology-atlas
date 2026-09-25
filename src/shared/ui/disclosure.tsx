'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { controlClass } from './control-class';
import { ICON_SIZE } from './icon-size';
import { AnimatedDisclosure } from './row-disclosure';

/**
 * A disclosure in **this app's grammar** — a chevron that turns, and a summary wearing the
 * `link` control shape.
 *
 * ⚠️ Every fold in the meaning workbench was a bare `<details>` (2026-09-06), so the browser drew
 * its own triangle: a mark with no hover, no focus ring, no ink from the ramp, and a different
 * shape on every engine. The chat panel beside it already opened its work trace and its error
 * detail with a chevron and the `link` shape — two disclosure languages on two halves of one dock
 * is one language too many, which is what earned this a name here rather than a copy there.
 *
 * The default stays a real `<details>`. `animated` opts into the shared measured
 * row lifecycle for results that need continuous opening and closing.
 *
 * With the native default, The element already owns open/closed state, keyboard operation and
 * the accessibility semantics — what was missing was only the appearance, and replacing it with a
 * hand-built button would trade a working control for a styled one.
 */
export function Disclosure({ summary, children, open, className, summaryTestId, animated = false }: { animated?: boolean; summary: ReactNode; children: ReactNode; open?: boolean; className?: string; summaryTestId?: string }) {
  if (animated) return <div className={className}><AnimatedDisclosure label={summary} defaultOpen={open} testId={summaryTestId}>{children}</AnimatedDisclosure></div>;
  /*
   * `md` (11px, `text-label`), not `sm` (9.5px, `text-caption`), since 2026-09-25: a summary is
   * read and pressed — often a whole question ("What goes in each kind?") — and 9.5px is the
   * decoration step. `text-label` is the smallest step this app gives an actionable word.
   */
  return <details open={open} className={cn('group', className)}>
    <summary data-testid={summaryTestId} className={controlClass({ shape: 'link', size: 'md', tone: 'muted', hoverInk: 'strong', className: 'list-none gap-1.5 text-left [&::-webkit-details-marker]:hidden' })}>
      <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
      <span className="min-w-0">{summary}</span>
    </summary>
    {children}
  </details>;
}
