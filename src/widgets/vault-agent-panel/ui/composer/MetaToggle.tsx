'use client';

import { controlClass } from '@/shared/ui/control-class';

/** The one-row control that opens a side branch: unbordered, or the floor reads as several strips. */
export function MetaToggle({
  testId,
  open,
  label,
  onToggle,
}: {
  testId: string;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      onClick={onToggle}
      className={controlClass({
        shape: 'link',
        tone: open ? 'default' : 'muted',
        className: [
          'rounded-chip tracking-label',
          open ? '' : 'hover:text-[color:var(--color-text-secondary)]',
        ].join(' '),
      })}
    >
      {label}
    </button>
  );
}
