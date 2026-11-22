'use client';

import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

/** Where a file name's middle gives way: the name's tail kept whole, and the length written whole. */
function middleCut(name: string, keepEnd: number, wholeUpTo: number): number {
  return name.length > wholeUpTo ? name.length - keepEnd : 0;
}

/**
 * A file's name alone, its middle giving way first so the ending and extension stay readable; a name
 * written whole gives way at its end in a row too narrow for it. The full path is its title and its
 * description.
 */
export function MiddleCutName({ path, keepEnd, wholeUpTo = keepEnd, testId, className }: {
  path: string;
  /** Characters of the name's end that never give way: a word's tail and the extension. */
  keepEnd: number;
  /** A name this long or shorter is written whole, so a cut never leaves a stub that reads as another name. */
  wholeUpTo?: number;
  testId: string;
  className?: string;
}) {
  const pathId = useId();
  const name = path.split('/').pop() || path;
  const cut = middleCut(name, keepEnd, wholeUpTo);
  return (
    <>
      <span className={cn('flex min-w-0', className)} title={path} aria-describedby={pathId} data-testid={testId}>
        {cut > 0 ? <span className="min-w-0 truncate">{name.slice(0, cut)}</span> : null}
        <span className={cut > 0 ? 'flex-none whitespace-pre' : 'min-w-0 truncate'}>{name.slice(cut)}</span>
      </span>
      <span id={pathId} hidden>{path}</span>
    </>
  );
}
