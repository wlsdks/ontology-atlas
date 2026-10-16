import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import styles from './automation-list-frame.module.css';

interface AutomationLaneFact {
  title: string;
  body: string;
}

/** Shared by the column head, the ghost and every schedule row. */
export const AUTOMATION_ROW_PAD = 'gap-3 px-[var(--card-pad)] py-4';
export const AUTOMATION_ROW_GRID =
  'grid min-w-0 flex-1 grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-center';

export function AutomationLaneIntro({ title, description, action }: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className={styles.intro} data-testid="automations-empty-workbench">
    <h2 className={styles.title}>{title}</h2>
    <p className={styles.description}>{description}</p>
    {action ? <div className={styles.action}>{action}</div> : null}
  </div>;
}

/** `count` is null where no schedule can exist yet. */
export function AutomationListPanel({ title, count, columns, trailing, children }: {
  title: string;
  count: number | null;
  columns: readonly [string, string, string];
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { leaving } = useSurfaceSwap(count);
  return <section className={styles.panel} aria-labelledby="automations-list-title" data-testid="automations-list-panel">
    <div className={styles.head}>
      <h2 id="automations-list-title" className={styles.panelTitle}>{title}</h2>
      {count === null ? null : <span className={styles.count} data-testid="automations-list-count">
        <span key={count} className={cn('col-start-1 row-start-1', leaving !== null && 'motion-swap-in')}>{count}</span>
        {leaving === null ? null : <span key={`leaving:${leaving}`} aria-hidden inert className="motion-swap-out pointer-events-none col-start-1 row-start-1">{leaving}</span>}
      </span>}
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
    <div className={cn('hidden md:flex', AUTOMATION_ROW_PAD, styles.columnHead)} data-testid="automations-list-head" aria-hidden>
      <span className="w-4 flex-none" />
      <span className={AUTOMATION_ROW_GRID}>
        <span data-automation-col="name">{columns[0]}</span>
        <span data-automation-col="cadence">{columns[1]}</span>
        <span data-automation-col="outcome" className="text-right">{columns[2]}</span>
      </span>
      <span className="size-4 flex-none" />
    </div>
    {children}
  </section>;
}

export function AutomationGhostRow({ cadence, outcome, className }: { cadence: string; outcome: string; className?: string }) {
  return <div aria-hidden data-testid="automations-ghost-row" className={cn('flex items-center', AUTOMATION_ROW_PAD, styles.ghost, className)}>
    <span className="mt-1 flex w-4 flex-none self-start justify-center"><CalendarClock size={ICON_SIZE.md} /></span>
    <span className={AUTOMATION_ROW_GRID}>
      <span data-automation-col="name" className="col-span-2 min-w-0 md:col-span-1">
        <span className="relative block text-title">&nbsp;<span className={styles.nameBar} /></span>
        <span className="mt-1 block text-body">&nbsp;</span>
      </span>
      <span data-automation-col="cadence" className="min-w-0 text-body">
        <span className="block">{cadence}</span>
        <span className="mt-1 block text-label">&nbsp;</span>
      </span>
      <span data-automation-col="outcome" className="min-w-0 text-body md:text-right">{outcome}</span>
    </span>
    <span className="size-4 flex-none" />
  </div>;
}

export function AutomationLaneFacts({ facts }: { facts: readonly [AutomationLaneFact, AutomationLaneFact, AutomationLaneFact] }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3 md:gap-8 2xl:grid-cols-1 2xl:gap-6" data-testid="automations-lane-facts">
    {facts.map((fact) => <div key={fact.title} className={styles.fact}>
      <dt className={styles.factTitle}>{fact.title}</dt>
      <dd className={styles.factBody}>{fact.body}</dd>
    </div>)}
  </dl>;
}
