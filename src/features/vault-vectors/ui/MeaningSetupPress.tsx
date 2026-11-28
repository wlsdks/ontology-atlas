import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/shared/ui';
import { MeaningModelDialog } from './MeaningModelDialog';

export function MeaningSetupPress({ rootPath, testId, children }: {
  rootPath: string;
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
    <Button size="sm" variant="outline" onClick={press} data-testid={testId}>{children}</Button>
    <MeaningModelDialog open={open} rootPath={rootPath} onClose={() => setOpen(false)} />
  </>;
}
