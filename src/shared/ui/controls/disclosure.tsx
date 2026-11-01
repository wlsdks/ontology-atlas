'use client';

import { useId, useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { controlClass } from '../control-class';
import { AnimatedDisclosure, DisclosureMark, RowDisclosure } from './row-disclosure';

export function Disclosure({ summary, children, open, className, summaryClassName, summaryTestId, animated = false }: { animated?: boolean; summary: ReactNode; children: ReactNode; open?: boolean; className?: string; summaryClassName?: string; summaryTestId?: string }) {
  const [expanded, setExpanded] = useState(open ?? false);
  const bodyId = useId();
  if (animated) return <div className={className}><AnimatedDisclosure label={summary} defaultOpen={open} testId={summaryTestId} className={summaryClassName}>{children}</AnimatedDisclosure></div>;
  return <div className={className} data-state={expanded ? 'open' : 'closed'}>
    <button type="button" data-testid={summaryTestId} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((value) => !value)}
      className={controlClass({ shape: 'link', size: 'md', tone: 'secondary', hoverInk: 'strong', className: cn('max-w-full gap-1.5 text-left align-top', summaryClassName) })}>
      <DisclosureMark open={expanded} />
      <span className="min-w-0 break-words">{summary}</span>
    </button>
    <RowDisclosure open={expanded} id={bodyId}>{children}</RowDisclosure>
  </div>;
}
