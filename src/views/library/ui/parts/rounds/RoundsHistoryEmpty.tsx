import { CalendarClock, FileCheck2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import frame from "../first-run/constellations-starting-point.module.css";
import styles from "./rounds-history-empty.module.css";

/**
 * Check history before anything is scheduled is the same page with nothing in it yet: the index's
 * first row holds the one next step in a scheduled row's geometry, and the kinds of check that can
 * be scheduled follow the ledger, so the first round fills both rows where they already stand.
 */
export function RoundsFirstStep({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <li data-testid="library-rounds-first-step" className="flex min-h-9 w-full items-center gap-2 px-2 py-2 md:col-span-2">
      <span className="flex-none self-start pt-1 text-[color:var(--color-indigo-text-soft)]">
        <CalendarClock size={ICON_SIZE.sm} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block text-body leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{title}</span>
        <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-tertiary)]">{description}</span>
      </span>
      {action}
    </li>
  );
}

export function RoundKinds({ label, kinds }: {
  label: string;
  kinds: readonly { id: "consistency" | "service"; name: string; body: string }[];
}) {
  return <section className={frame.source} role="group" aria-label={label} data-testid="library-rounds-kinds">
    <div className={frame.sourceHead}><span>{label}</span><strong className="font-[var(--font-weight-emphasis)]">{kinds.length}</strong></div>
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
  </section>;
}
