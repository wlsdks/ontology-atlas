import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import styles from './automation-list-frame.module.css';

interface AutomationLaneFact {
  title: string;
  body: string;
}

/**
 * Shared by the column head and every schedule row: name, cadence, last result, actions. Each row
 * is its own grid, so the actions column is a fixed width rather than `auto`. Below `md` the
 * actions stay beside the name and cadence and result share the second line.
 */
export const AUTOMATION_ROW_GRID =
  'grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-3 px-[var(--card-pad)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_9rem] md:gap-x-6';
export const AUTOMATION_CELL = {
  name: 'col-start-1 row-start-1 min-w-0',
  cadence: 'col-start-1 row-start-2 min-w-0 self-start md:col-start-2 md:row-start-1 md:self-center',
  outcome: 'col-start-2 row-start-2 min-w-0 self-start md:col-start-3 md:row-start-1 md:self-center',
  actions: 'col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-4',
} as const;

export function AutomationListPanel({ title, count, columns, trailing, children }: {
  title: string;
  count: number;
  columns: readonly [string, string, string, string];
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { leaving } = useSurfaceSwap(count);
  return <section className={styles.panel} aria-labelledby="automations-list-title" data-testid="automations-list-panel">
    <div className={styles.head}>
      <h2 id="automations-list-title" className={styles.panelTitle}>{title}</h2>
      <span className={styles.count} data-testid="automations-list-count">
        <span key={count} className={cn('col-start-1 row-start-1', leaving !== null && 'motion-swap-in')}>{count}</span>
        {leaving === null ? null : <span key={`leaving:${leaving}`} aria-hidden inert className="motion-swap-out pointer-events-none col-start-1 row-start-1">{leaving}</span>}
      </span>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
    <div role="grid" aria-labelledby="automations-list-title" className="min-w-0">
      <div role="row" className={cn(AUTOMATION_ROW_GRID, 'hidden md:grid', styles.columnHead)} data-testid="automations-list-head">
        <span role="columnheader" className={AUTOMATION_CELL.name}>{columns[0]}</span>
        <span role="columnheader" className={AUTOMATION_CELL.cadence}>{columns[1]}</span>
        <span role="columnheader" className={AUTOMATION_CELL.outcome}>{columns[2]}</span>
        <span role="columnheader" className={AUTOMATION_CELL.actions}><span className="sr-only">{columns[3]}</span></span>
      </div>
      <div role="rowgroup" data-testid="automations-list" className={styles.body}>{children}</div>
    </div>
  </section>;
}

export function AutomationLaneFacts({ facts }: { facts: readonly [AutomationLaneFact, AutomationLaneFact, AutomationLaneFact] }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3 md:gap-8" data-testid="automations-lane-facts">
    {facts.map((fact) => <div key={fact.title} className={styles.fact}>
      <dt className={styles.factTitle}>{fact.title}</dt>
      <dd className={styles.factBody}>{fact.body}</dd>
    </div>)}
  </dl>;
}
