import { CalendarClock, FileCheck2, RefreshCw } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import frame from "./constellations-starting-point.module.css";
import styles from "./rounds-history-empty.module.css";

export type RoundSignalTone = "stale" | "redrafted" | "refused" | "held";

/**
 * Check history before anything is scheduled: the one next step, the two kinds of check that can be
 * scheduled with what each costs, and a legend of the four outcome words the ledger, index badge and
 * away card use. The page drops the index column.
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
  return <section className={frame.stack} data-testid="library-rounds-empty-ledger">
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
    <div className={frame.band} data-testid="library-rounds-empty-signals">
      <h3 className={frame.bandHead}>{signalsLabel}</h3>
      <ul className={frame.bandList} style={{ '--band-columns': signals.length, '--band-columns-narrow': 2 } as CSSProperties}>
        {signals.map(signal => <li key={signal.tone} data-signal={signal.tone}>
          <span className={frame.bandName}><span aria-hidden className={styles.dot} data-tone={signal.tone} />{signal.name}</span>
          <span className={frame.bandBody}>{signal.body}</span>
        </li>)}
      </ul>
    </div>
  </section>;
}
