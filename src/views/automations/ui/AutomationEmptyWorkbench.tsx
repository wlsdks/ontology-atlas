import type { ReactNode } from 'react';
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
 * ⚠️ **The empty list says nothing of its own** (owner review, 2026-09-26). Its body used to say
 * "schedules appear here" and its foot "results appear here after the first run", under a title
 * that had just said there were none: the page's empty message twice more, in a quieter voice.
 * The list is its frame now, title, count and column heads over the ground its rows will take,
 * and the one message is the title above it.
 *
 * `count` is null where no schedule can exist yet (the browser, no folder): a "0" there counted
 * something this runtime cannot hold.
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
    <aside className={styles.preview} aria-label={previewTitle} data-testid="automations-empty-list">
      <div className={styles.previewHead}>
        <span className={styles.previewTitle}>{previewTitle}</span>
        {count === null ? null : <span className={styles.zero}>{count}</span>}
      </div>
      <div className={styles.columnHead}>
        {columns.map(column => <span key={column}>{column}</span>)}
      </div>
      {/* Where rows will land: ground, not a sentence. */}
      <div className={styles.rows} aria-hidden data-testid="automations-empty-list-rows" />
    </aside>
  </div>;
}
