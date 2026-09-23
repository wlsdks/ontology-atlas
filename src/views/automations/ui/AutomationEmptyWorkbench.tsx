import { CalendarClock, Clock3, Plus, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import styles from './automation-empty-workbench.module.css';

/** The empty schedule's actual list shape, with no invented schedule or execution. */
export function AutomationEmptyWorkbench({ title, description, guard, action, previewTitle, previewEmpty,
  columns, resultLabel, resultEmpty }: {
  title: string;
  description: string;
  guard: string;
  action: ReactNode;
  previewTitle: string;
  previewEmpty: string;
  columns: readonly [string, string, string];
  resultLabel: string;
  resultEmpty: string;
}) {
  return <div className={styles.workbench} data-testid="automations-empty-workbench">
    <div className={styles.intro}>
      <span className={styles.kicker}><CalendarClock size={ICON_SIZE.sm} aria-hidden />{previewTitle}</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.action}>{action}</div>
      <p className={styles.guard}><ShieldCheck size={ICON_SIZE.sm} aria-hidden />{guard}</p>
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
        <span className={styles.emptyDash}>—</span><span className={styles.emptyDash}>—</span>
      </div>
      <div className={styles.result}>
        <Clock3 size={ICON_SIZE.sm} aria-hidden />
        <span><strong className="font-[var(--font-weight-emphasis)]">{resultLabel}</strong><small>{resultEmpty}</small></span>
      </div>
    </aside>
  </div>;
}
