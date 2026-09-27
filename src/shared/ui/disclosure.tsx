'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { controlClass } from './control-class';
import { ICON_SIZE } from './icon-size';
import { AnimatedDisclosure } from './row-disclosure';

/**
 * A disclosure in this app's grammar: a turning chevron and a summary in the `link` shape,
 * instead of the engine's own triangle. The default stays a native `<details>`, which already
 * owns state, keyboard and semantics; `animated` opts into the measured row lifecycle.
 */
export function Disclosure({ summary, children, open, className, summaryTestId, animated = false }: { animated?: boolean; summary: ReactNode; children: ReactNode; open?: boolean; className?: string; summaryTestId?: string }) {
  if (animated) return <div className={className}><AnimatedDisclosure label={summary} defaultOpen={open} testId={summaryTestId}>{children}</AnimatedDisclosure></div>;
  /* `md` (`text-label`): a summary is read and pressed, and caption is the decoration step. */
  return <details open={open} className={cn('group', className)}>
    <summary data-testid={summaryTestId} className={controlClass({ shape: 'link', size: 'md', tone: 'muted', hoverInk: 'strong', className: 'list-none gap-1.5 text-left [&::-webkit-details-marker]:hidden' })}>
      <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
      <span className="min-w-0">{summary}</span>
    </summary>
    {children}
  </details>;
}
