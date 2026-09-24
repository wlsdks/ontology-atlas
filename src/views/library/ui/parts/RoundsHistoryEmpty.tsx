import { CalendarClock, FileCheck2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/shared/ui/icon-size";

import frame from "./constellations-starting-point.module.css";
import styles from "./rounds-history-empty.module.css";

export type RoundSignalTone = "stale" | "redrafted" | "refused" | "held";

/**
 * Check history before anything is scheduled: the one next step, what it can schedule, and
 * what a pass will leave here.
 *
 * 2026-09-25, round two. The first pass drew an empty ledger twice (two ghost rows in the index
 * column, three `--:--` rows on the stage) and left the only way forward as a 13px link in the
 * column's corner. Rows with placeholder times read as a table that failed to load, and at 1920
 * the stage was 58% empty below them. Work scope's starting point already solved the same moment
 * (no saved scope yet), so this wears its frame: the page drops the index column, the intro holds
 * the one pressable door, and the list beside it is real — the two kinds of check Automations can
 * schedule here, each with what it costs — not a drawing of rows that do not exist.
 *
 * Round three: the two columns alone still left the lower half of a 1080 stage blank. The band
 * under them is the legend of the filled screen — the four outcome words the ledger, the index
 * badge and the away card use, each with its dot and what it means for the person — so the
 * first filled morning reads without a lesson. None of those words is on this screen yet, and
 * nothing in the band repeats the intro or the list above it.
 */
export function RoundsHistoryEmpty({ title, description, action, kindsLabel, kinds, signalsLabel, signals }: {
  title: string;
  description: string;
  action: ReactNode;
  kindsLabel: string;
  kinds: readonly { id: "consistency" | "service"; name: string; body: string }[];
  signalsLabel: string;
  signals: readonly { tone: RoundSignalTone; name: string; body: string }[];
}) {
  return <section className={styles.stack} data-testid="library-rounds-empty-ledger">
    <div className={frame.layout}>
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
    </div>
    <div className={styles.signals} data-testid="library-rounds-empty-signals">
      <h3 className={styles.signalsHead}>{signalsLabel}</h3>
      <ul className={styles.signalList}>
        {signals.map(signal => <li key={signal.tone} data-signal={signal.tone}>
          <span className={styles.signalName}><span aria-hidden className={styles.dot} data-tone={signal.tone} />{signal.name}</span>
          <span className={styles.signalBody}>{signal.body}</span>
        </li>)}
      </ul>
    </div>
  </section>;
}
