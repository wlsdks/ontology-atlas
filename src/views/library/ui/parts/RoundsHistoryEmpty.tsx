import { CalendarClock, FileCheck2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/shared/ui/icon-size";

import frame from "./constellations-starting-point.module.css";
import styles from "./rounds-history-empty.module.css";

/**
 * Check history before anything is scheduled: the one next step, and what it can schedule.
 *
 * 2026-09-25, round two. The first pass drew an empty ledger twice (two ghost rows in the index
 * column, three `--:--` rows on the stage) and left the only way forward as a 13px link in the
 * column's corner. Rows with placeholder times read as a table that failed to load, and at 1920
 * the stage was 58% empty below them. Work scope's starting point already solved the same moment
 * (no saved scope yet), so this wears its frame: the page drops the index column, the intro holds
 * the one pressable door, and the list beside it is real — the two kinds of check Automations can
 * schedule here, each with what it costs — not a drawing of rows that do not exist.
 */
export function RoundsHistoryEmpty({ title, description, action, kindsLabel, kinds }: {
  title: string;
  description: string;
  action: ReactNode;
  kindsLabel: string;
  kinds: readonly { id: "consistency" | "service"; name: string; body: string }[];
}) {
  return <section className={frame.layout} data-testid="library-rounds-empty-ledger">
    <div className={frame.intro}>
      <CalendarClock size={ICON_SIZE.lg} className={frame.icon} aria-hidden />
      <h2>{title}</h2>
      <p>{description}</p>
      <div className={frame.action}>{action}</div>
    </div>
    <div className={frame.source} role="group" aria-label={kindsLabel}>
      <div className={frame.sourceHead}><span>{kindsLabel}</span><strong className="font-[var(--font-weight-emphasis)]">{kinds.length}</strong></div>
      <ul className={styles.kinds}>
        {kinds.map(kind => <li key={kind.id} data-round-kind={kind.id}>
          <span className={styles.mark}>{kind.id === "consistency"
            ? <FileCheck2 size={ICON_SIZE.sm} aria-hidden />
            : <RefreshCw size={ICON_SIZE.sm} aria-hidden />}</span>
          <span className={styles.copy}>
            <span className={styles.name}>{kind.name}</span>
            <span className={styles.body}>{kind.body}</span>
          </span>
        </li>)}
      </ul>
    </div>
  </section>;
}
