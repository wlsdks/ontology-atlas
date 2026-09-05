'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { controlClass } from './control-class';
import { ICON_SIZE } from './icon-size';

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
 * It stays a real `<details>`. The element already owns open/closed state, keyboard operation and
 * the accessibility semantics — what was missing was only the appearance, and replacing it with a
 * hand-built button would trade a working control for a styled one.
 */
export function Disclosure({ summary, children, open, className, summaryTestId }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string; summaryTestId?: string }) {
  return <details open={open} className={cn('group', className)}>
    <summary data-testid={summaryTestId} className={controlClass({ shape: 'link', size: 'sm', tone: 'muted', hoverInk: 'strong', className: 'list-none gap-1.5 text-left [&::-webkit-details-marker]:hidden' })}>
      <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
      <span className="min-w-0">{summary}</span>
    </summary>
    {children}
  </details>;
}
