import { Bot, Clock3, Plus, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import styles from './automation-empty-workbench.module.css';

export interface AutomationLaneFact {
  title: string;
  body: string;
}

const FACT_ICONS = [Bot, Clock3, ShieldCheck] as const;

/**
 * The empty schedule's actual list shape, with no invented schedule or execution, over the
 * three facts a person needs before scheduling: what runs, when, and what it may change.
 *
 * The facts band exists because the intro and preview alone ended at about half the viewport
 * (y=497 of 949 at 1512, of 1080 at 1920), leaving the lower half of the stage dead.
 */
export function AutomationEmptyWorkbench({ title, description, action, previewTitle, previewEmpty,
  columns, resultLabel, resultEmpty, facts }: {
  title: string;
  description: string;
  action: ReactNode;
  previewTitle: string;
  previewEmpty: string;
  columns: readonly [string, string, string];
  resultLabel: string;
  resultEmpty: string;
  facts: readonly [AutomationLaneFact, AutomationLaneFact, AutomationLaneFact];
}) {
  return <div className={styles.stage} data-testid="automations-empty-workbench">
    <div className={styles.workbench}>
      <div className={styles.intro}>
        {/* No eyebrow: it repeated the preview's own title a column away. */}
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>
        <div className={styles.action}>{action}</div>
      </div>
      <aside className={styles.preview} aria-label={previewTitle}>
        <div className={styles.previewHead}>
          <span className={styles.previewTitle}>{previewTitle}</span>
          <span className={styles.zero}>0</span>
        </div>
        <div className={styles.columnHead}>
          {columns.map(column => <span key={column}>{column}</span>)}
        </div>
        <div className={styles.emptyRow}>
          <span className={styles.emptyName}><Plus size={ICON_SIZE.sm} aria-hidden />{previewEmpty}</span>
        </div>
        <div className={styles.result}>
          <Clock3 size={ICON_SIZE.sm} aria-hidden />
          <span><strong className="font-[var(--font-weight-emphasis)]">{resultLabel}</strong><small>{resultEmpty}</small></span>
        </div>
      </aside>
    </div>
    <ul className={styles.facts} data-testid="automations-lane-facts">
      {facts.map((fact, index) => {
        const Icon = FACT_ICONS[index];
        return <li key={fact.title} className={styles.fact}>
          <span className={styles.factIcon}><Icon size={ICON_SIZE.lg} aria-hidden /></span>
          <h3 className={styles.factTitle}>{fact.title}</h3>
          <p className={styles.factBody}>{fact.body}</p>
        </li>;
      })}
    </ul>
  </div>;
}
