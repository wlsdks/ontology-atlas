'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { ICON_SIZE } from './icon-size';

/** Inline height + opacity grammar; children survive exit but immediately leave focus order. */
export function RowDisclosure({ open, id, children, className }: {
  open: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <div ref={boxRef} id={id} className="ai-row-disclosure" data-state={open ? 'open' : 'closed'}
      inert={!open} aria-hidden={!open}>
      {mounted ? <div ref={contentRef} className={cn('ai-row-disclosure-body', className)}>{children}</div> : null}
    </div>
  );
}

/** Secondary evidence uses the same disclosure rhythm as the owning schedule. */
export function AnimatedDisclosure({ label, children, defaultOpen = false, testId }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} data-testid={testId}
        className="atlas-touch-floor h-auto justify-start px-0 text-body text-[color:var(--color-text-secondary)]">
        <ChevronDown size={ICON_SIZE.sm} aria-hidden className={cn('flex-none transition-transform motion-reduce:transition-none', !open && '-rotate-90')} />
        {label}
      </Button>
      <RowDisclosure open={open} id={id} className="pt-3">{children}</RowDisclosure>
    </div>
  );
}
