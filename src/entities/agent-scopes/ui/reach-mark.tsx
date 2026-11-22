import { cn } from '@/shared/lib/cn';

import type { ScopeReach } from '../model/scope-reach';

const CELL_OFF = 'shadow-[inset_0_0_0_1px_var(--color-indigo-line-a35)]';

/**
 * The reach diagram at icon size: you and other people across, this repository and your other
 * projects down. Decorative; the words beside it say the same.
 */
export function ReachMark({ reach, size = 'sm', active = false }: { reach: ScopeReach; size?: 'sm' | 'md'; active?: boolean }) {
  const on = active ? 'bg-[color:var(--color-text-primary)]' : 'bg-[color:var(--color-text-secondary)]';
  const cells = [reach.meHere, reach.othersHere, reach.meElsewhere, reach.othersElsewhere];
  return (
    <span
      aria-hidden
      data-scope-reach={cells.map((filled) => (filled ? 1 : 0)).join('')}
      className={cn(
        'inline-grid shrink-0 gap-0.5',
        size === 'sm' ? 'grid-cols-[repeat(2,5px)] auto-rows-[5px]' : 'grid-cols-[repeat(2,7px)] auto-rows-[7px]',
      )}
    >
      {cells.map((filled, index) => (
        <i key={index} className={cn('block', filled ? on : CELL_OFF)} />
      ))}
    </span>
  );
}

/** The same diagram with its row and column names, for the detail that explains one scope. */
export function ReachGrid({
  reach,
  labels,
  label,
}: {
  reach: ScopeReach;
  labels: { me: string; others: string; here: string; elsewhere: string };
  /** The sentence the grid draws, so it reads as one image. */
  label: string;
}) {
  const head = (on: boolean) => (on ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-quaternary)]');
  const cell = (on: boolean) =>
    cn('h-5 rounded-micro', on ? 'bg-[color:var(--color-text-secondary)]' : 'border border-dashed border-[color:var(--color-border-strong)]');
  const meOn = reach.meHere || reach.meElsewhere;
  const othersOn = reach.othersHere || reach.othersElsewhere;
  const hereOn = reach.meHere || reach.othersHere;
  const elsewhereOn = reach.meElsewhere || reach.othersElsewhere;
  return (
    <div
      role="img"
      aria-label={label}
      data-testid="scope-reach-grid"
      className="grid w-max shrink-0 grid-cols-[auto_3.25rem_3.25rem] items-center gap-[3px] text-label"
    >
      <span />
      <span className={cn('pb-px text-center', head(meOn))}>{labels.me}</span>
      <span className={cn('pb-px text-center', head(othersOn))}>{labels.others}</span>
      <span className={cn('whitespace-nowrap pr-2 text-right', head(hereOn))}>{labels.here}</span>
      <span className={cell(reach.meHere)} />
      <span className={cell(reach.othersHere)} />
      <span className={cn('whitespace-nowrap pr-2 text-right', head(elsewhereOn))}>{labels.elsewhere}</span>
      <span className={cell(reach.meElsewhere)} />
      <span className={cell(reach.othersElsewhere)} />
    </div>
  );
}
