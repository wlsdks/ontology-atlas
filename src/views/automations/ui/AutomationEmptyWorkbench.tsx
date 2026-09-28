import type { ReactNode } from 'react';
import styles from './automation-empty-workbench.module.css';

export interface AutomationLaneFact {
  title: string;
  body: string;
}

/**
 * An empty lane: what to do, the three facts to know before scheduling, then the empty list
 * frame. Each sentence appears once on screen, so the list itself says nothing. `count` is null
 * where no schedule can exist (browser, no folder), where a "0" would count the impossible.
 */
export function AutomationEmptyWorkbench({ title, description, action, previewTitle,
  count, columns, facts }: {
  title: string;
  description: string;
  action: ReactNode;
  previewTitle: string;
  count: number | null;
  columns: readonly [string, string, string];
  facts: readonly [AutomationLaneFact, AutomationLaneFact, AutomationLaneFact];
}) {
  return <div className={styles.stage} data-testid="automations-empty-workbench">
    <div className={styles.intro}>
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
    <aside className={styles.preview} aria-label={previewTitle} data-testid="automations-empty-list">
      <div className={styles.previewHead}>
        <span className={styles.previewTitle}>{previewTitle}</span>
        {count === null ? null : <span className={styles.zero}>{count}</span>}
      </div>
      <div className={styles.columnHead}>
        {columns.map(column => <span key={column}>{column}</span>)}
      </div>
      <div className={styles.rows} aria-hidden data-testid="automations-empty-list-rows" />
    </aside>
  </div>;
}
