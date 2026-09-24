import { Clock3, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import styles from './automation-empty-workbench.module.css';

export interface AutomationLaneFact {
  title: string;
  body: string;
}

/**
 * An empty lane in the order a person reads it, on one text start line: what to do, the three
 * facts a person needs before scheduling (what runs, when, what it may change), then the
 * schedule list itself, full width like the list it becomes, holding the page's remaining height.
 * No invented schedule or execution.
 *
 * Each sentence appears once on the screen. The page lede owns "runs on this computer while
 * Atlas is open", the facts own what/when/what-changes, and the description only says what the
 * facts do not (review, 2026-09-25: the same runtime sentence was on screen three times).
 *
 * `count` is null where no schedule can exist yet (the browser, no folder): a "0" there counted
 * something this runtime cannot hold.
 */
export function AutomationEmptyWorkbench({ title, description, action, previewTitle, previewEmpty,
  count, columns, resultLabel, resultEmpty, facts }: {
  title: string;
  description: string;
  action: ReactNode;
  previewTitle: string;
  previewEmpty: string;
  count: number | null;
  columns: readonly [string, string, string];
  resultLabel: string;
  resultEmpty: string;
  facts: readonly [AutomationLaneFact, AutomationLaneFact, AutomationLaneFact];
}) {
  return <div className={styles.stage} data-testid="automations-empty-workbench">
    <div className={styles.intro}>
      {/* No eyebrow: it repeated the list's own title below. */}
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.action}>{action}</div>
    </div>
    <dl className={styles.facts} data-testid="automations-lane-facts">
      {facts.map((fact) => <div key={fact.title} className={styles.fact}>
        <dt className={styles.factTitle}>{fact.title}</dt>
        <dd className={styles.factBody}>{fact.body}</dd>
      </div>)}
    </dl>
    <aside className={styles.preview} aria-label={previewTitle}>
      <div className={styles.previewHead}>
        <span className={styles.previewTitle}>{previewTitle}</span>
        {count === null ? null : <span className={styles.zero}>{count}</span>}
      </div>
      <div className={styles.columnHead}>
        {columns.map(column => <span key={column}>{column}</span>)}
      </div>
      <div className={styles.emptyRow}>
        <span className={styles.emptyName}><Plus size={ICON_SIZE.md} aria-hidden />{previewEmpty}</span>
      </div>
      <div className={styles.result}>
        <Clock3 size={ICON_SIZE.sm} aria-hidden />
        <span><strong className="font-[var(--font-weight-emphasis)]">{resultLabel}</strong><small>{resultEmpty}</small></span>
      </div>
    </aside>
  </div>;
}
