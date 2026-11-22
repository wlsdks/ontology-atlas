import { Orbit } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';
import styles from './constellations-starting-point.module.css';

/**
 * A preview, not a picker: rows carry the kind glyph, never a radio-shaped mark, because nothing
 * here selects. The list says how many it did not show and ends with the map as the one real door.
 */
export function ConstellationsStartingPoint({ title, description, action, sourceLabel, sourceCount, concepts, noConcepts, more, stepsLabel, steps }: {
  title: string;
  description: string;
  action: ReactNode;
  sourceLabel: string;
  sourceCount: number;
  concepts: readonly { id: string; name: string; kind: string; kindLabel: string }[];
  noConcepts: string;
  /** The row that closes a truncated list: what was left out, and the map that shows it all. */
  more: { label: string; onOpen: () => void } | null;
  stepsLabel: string;
  steps: readonly { id: string; name: string; body: string }[];
}) {
  return <section className={styles.stack} data-testid="library-collections-starting-point">
    <div className={styles.layout}>
      <div className={styles.intro}>
        <Orbit size={ICON_SIZE.lg} className={styles.icon} aria-hidden />
        <h2>{title}</h2>
        <p>{description}</p>
        <div className={styles.action}>{action}</div>
      </div>
      <div className={styles.source} aria-label={sourceLabel} role="group">
        <div className={styles.sourceHead}><span>{sourceLabel}</span><strong className="font-[var(--font-weight-emphasis)]">{sourceCount}</strong></div>
        {concepts.length > 0 ? <ul className={styles.concepts} data-testid="library-collections-starting-concepts">{concepts.map(concept => <li key={concept.id}>
          <span className={styles.mark}><OntologyMapKindGlyph kind={concept.kind} size={12} /></span>
          <span className={styles.name}>{concept.name}</span>
          <span className={styles.kind}>{concept.kindLabel}</span>
        </li>)}</ul> : <p className={styles.noConcepts}>{noConcepts}</p>}
        {more ? <button type="button" data-testid="library-collections-starting-more" onClick={more.onOpen}
          className={cn(controlClass({ shape: 'row', size: 'sm', tone: 'secondary', hoverSurface: 'lift' }), styles.more)}>
          <span className={styles.mark}><Orbit size={ICON_SIZE.sm} aria-hidden /></span>
          <span>{more.label}</span>
        </button> : null}
      </div>
    </div>
    <div className={styles.band} data-testid="library-collections-steps">
      <h3 className={styles.bandHead}>{stepsLabel}</h3>
      <ol className={styles.bandList} style={{ '--band-columns': steps.length } as CSSProperties}>
        {steps.map((step, index) => <li key={step.id} data-step={step.id}>
          <span className={styles.bandName}><span aria-hidden className={styles.stepNumber}>{index + 1}</span>{step.name}</span>
          <span className={styles.bandBody}>{step.body}</span>
        </li>)}
      </ol>
    </div>
  </section>;
}
