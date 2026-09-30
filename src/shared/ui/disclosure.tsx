'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { controlClass } from './control-class';
import { ICON_SIZE } from './icon-size';
import { AnimatedDisclosure, RowDisclosure } from './row-disclosure';

export function Disclosure({ summary, children, open, className, summaryTestId, animated = false }: { animated?: boolean; summary: ReactNode; children: ReactNode; open?: boolean; className?: string; summaryTestId?: string }) {
  const [expanded, setExpanded] = useState(open ?? false);
  const bodyId = useId();
  if (animated) return <div className={className}><AnimatedDisclosure label={summary} defaultOpen={open} testId={summaryTestId}>{children}</AnimatedDisclosure></div>;
  return <div className={className} data-state={expanded ? 'open' : 'closed'}>
    <button type="button" data-testid={summaryTestId} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((value) => !value)}
      className={controlClass({ shape: 'link', size: 'md', tone: 'muted', hoverInk: 'strong', className: 'gap-1.5 text-left' })}>
      <ChevronRight size={ICON_SIZE.sm} aria-hidden className={cn('shrink-0 transition-[rotate] duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none', expanded && 'rotate-90')} />
      <span className="min-w-0">{summary}</span>
    </button>
    <RowDisclosure open={expanded} id={bodyId}>{children}</RowDisclosure>
  </div>;
}
