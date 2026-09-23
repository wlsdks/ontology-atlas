import { CircleDot, Orbit } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import styles from './constellations-starting-point.module.css';

/** Shows actual selectable ontology concepts before a working scope is saved. */
export function ConstellationsStartingPoint({ title, description, action, sourceLabel, sourceCount, concepts, noConcepts }: {
  title: string;
  description: string;
  action: ReactNode;
  sourceLabel: string;
  sourceCount: number;
  concepts: readonly { id: string; name: string; kind: string }[];
  noConcepts: string;
}) {
  return <section className={styles.layout} data-testid="library-collections-starting-point">
    <div className={styles.intro}>
      <Orbit size={ICON_SIZE.lg} className={styles.icon} aria-hidden />
      <h2>{title}</h2>
      <p>{description}</p>
      <div className={styles.action}>{action}</div>
    </div>
    <div className={styles.source} aria-label={sourceLabel}>
      <div className={styles.sourceHead}><span>{sourceLabel}</span><strong className="font-[var(--font-weight-emphasis)]">{sourceCount}</strong></div>
      {concepts.length > 0 ? <ul className={styles.concepts}>{concepts.map(concept => <li key={concept.id}>
        <span className={styles.mark}><CircleDot size={ICON_SIZE.sm} aria-hidden /></span>
        <span className={styles.name}>{concept.name}</span>
        <span className={styles.kind}>{concept.kind}</span>
      </li>)}</ul> : <p className={styles.noConcepts}>{noConcepts}</p>}
    </div>
  </section>;
}
