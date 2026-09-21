import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** A form scrolls between a stable heading and its always-reachable actions. */
export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--color-divider)] pt-4">{children}</div>;
}
