import { ArrowUpRight, Clock3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import { cn } from "@/shared/lib/cn";
import styles from "./rounds-history-empty.module.css";

/** An empty ledger: real column structure, with no invented run or changed document. */
export function RoundsHistoryEmpty({ title, description, action, columns, empty }: {
  title: string;
  description: string;
  action: string;
  columns: readonly [string, string, string];
  empty: string;
}) {
  return <div className={styles.layout} data-testid="library-rounds-empty-ledger">
    <div className={styles.intro}>
      <Clock3 size={ICON_SIZE.lg} className={styles.icon} aria-hidden />
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href={`${DESTINATION_HREF.automations}?kind=documents`}
        className={cn(controlClass({ shape: "link", size: "lg", tone: "accent" }), "atlas-touch-floor atlas-touch-floor-wide", styles.action)}>
        {action}<ArrowUpRight size={ICON_SIZE.sm} aria-hidden />
      </Link>
    </div>
    <div className={styles.ledger} aria-label={empty}>
      <div className={styles.columns}>{columns.map(column => <span key={column}>{column}</span>)}</div>
      <div className={styles.emptyRow}><Clock3 size={ICON_SIZE.sm} aria-hidden /><span>{empty}</span></div>
    </div>
  </div>;
}
