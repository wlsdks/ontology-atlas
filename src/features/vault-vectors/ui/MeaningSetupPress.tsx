'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { MeaningModelDialog } from './MeaningModelDialog';

/**
 * A press that opens the search-by-meaning dialog, for places beside the desk line: the no-match
 * block's Set up, and Download again under results the model could not answer.
 */
export function MeaningSetupPress({ rootPath, look, testId, children }: {
  rootPath: string;
  /** `button` stands among the block's actions; `link` sits inside a sentence's row. */
  look: 'button' | 'link';
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const press = (event: MouseEvent<HTMLButtonElement>) => {
    // WebKit does not focus a pressed button, so Escape would have nowhere to return focus.
    event.currentTarget.focus({ preventScroll: true });
    setOpen(true);
  };
  return <>
    {look === 'button'
      ? <Button size="sm" variant="outline" onClick={press} data-testid={testId}>{children}</Button>
      : <button type="button" onClick={press} data-testid={testId}
        className={controlClass({ shape: 'link', size: 'md', tone: 'accent', className: 'flex-none whitespace-nowrap' })}>{children}</button>}
    <MeaningModelDialog open={open} rootPath={rootPath} onClose={() => setOpen(false)} />
  </>;
}
