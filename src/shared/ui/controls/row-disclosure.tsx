'use client';

import { useId, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useRowDisclosure } from '@/shared/lib/list-rows/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { ICON_SIZE } from '../tokens/icon-size';

export function DisclosureMark({ open }: { open: boolean }) {
  const Icon = open ? Minus : Plus;
  return <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-micro)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-secondary)]"><Icon size={ICON_SIZE.lg} /></span>;
}

/** Height and opacity grammar; children survive the exit but leave the focus order at once. */
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
export function AnimatedDisclosure({ label, children, defaultOpen = false, testId, className }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} data-testid={testId}
        className={cn('atlas-touch-floor h-auto max-w-full justify-start whitespace-normal px-0 text-left text-body text-[color:var(--color-text-secondary)]', className)}>
        <DisclosureMark open={open} />
        <span className="min-w-0 break-words">{label}</span>
      </Button>
      <RowDisclosure open={open} id={id} className="pt-3">{children}</RowDisclosure>
    </div>
  );
}
