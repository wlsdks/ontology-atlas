import styles from "./rounds-history-empty.module.css";

/** How many ghost passes the empty axis draws: enough to read as a column of rows, not a list. */
const GHOST_ROWS = [0, 1, 2] as const;

/**
 * An empty ledger: the section the ledger will be, in the shape it will take.
 *
 * 2026-09-25: this used to be a second headline ("no check history yet") under a page head that
 * already said "no pass yet", beside a table whose only row said "this fills after the first
 * run", with a second "Manage in Automations" link under it. Three sentences for one fact and
 * two doors to one place. Now the page head says the fact, the index column holds the one door,
 * and this section keeps its own title at the same step the filled ledger uses, one sentence on
 * how it fills, and the axis drawn empty: time, dot, row, with no invented run in it.
 */
export function RoundsHistoryEmpty({ title, description, columns, aria }: {
  title: string;
  description: string;
  columns: readonly [string, string, string];
  aria: string;
}) {
  return <section className={styles.layout} data-testid="library-rounds-empty-ledger" aria-label={aria}>
    <div className={styles.intro}>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <div className={styles.ledger} aria-hidden>
      <div className={styles.columns}>{columns.map(column => <span key={column}>{column}</span>)}</div>
      {GHOST_ROWS.map(row => <div key={row} className={styles.ghost} data-ghost-row={row}>
        <span className={styles.time}>--:--</span>
        <span className={styles.dot} />
        <span className={styles.line}><span /></span>
      </div>)}
    </div>
  </section>;
}
