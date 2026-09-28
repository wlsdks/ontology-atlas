'use client';

import { cn } from '@/shared/lib/cn';
import { useCountUp } from '@/shared/lib/use-count-up';

export function CountUpNumber({
  value,
  format = String,
  animateChanges = false,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  animateChanges?: boolean;
  className?: string;
}) {
  const shown = useCountUp(value, undefined, { animateChanges });
  return (
    <>
      <span aria-hidden="true" className={cn('tabular-nums', className)} data-count-up-animated>
        {format(shown)}
      </span>
      <span className="sr-only" data-count-up-final>
        {format(value)}
      </span>
    </>
  );
}
