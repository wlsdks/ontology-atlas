'use client';

import { BookOpen, Eye, FolderCode, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { AnatomySlot } from '../model/harness-anatomy';
import styles from './harness-structure-diagram.module.css';

const BANDS = [
  { id: 'tells', title: 'coverageColumnTold', Icon: BookOpen },
  { id: 'gates', title: 'coverageColumnGated', Icon: Shield },
  { id: 'watches', title: 'coverageColumnWatched', Icon: Eye },
] as const;

/** Edges describe measured repository composition, never an observed execution trace. */
export function HarnessStructureDiagram({ slots, sourceRoot, selectedId, detailId, selectedContent, onSelect }: {
  slots: readonly AnatomySlot[];
  sourceRoot: string;
  selectedId: string | null;
  detailId: string;
  selectedContent: ReactNode;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('harness');
  const name = sourceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? sourceRoot;
  return <div data-testid="harness-structure-diagram" className={styles.diagram}>
    <div className={styles.root}>
      <FolderCode size={ICON_SIZE.md} aria-hidden />
      <span className="min-w-0"><span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('diagramRoot')}</span><code title={sourceRoot} className="block truncate text-label text-[color:var(--color-text-tertiary)]">{name}</code></span>
    </div>
    <svg className={styles.connections} viewBox="0 0 900 100" preserveAspectRatio="none" fill="none" aria-hidden>
      {['M450 0V28Q450 46 425 46H175Q150 46 150 70V100','M450 0V100','M450 0V28Q450 46 475 46H725Q750 46 750 70V100'].map(path=><path key={path} d={path} className={styles.connection} pathLength="100" vectorEffect="non-scaling-stroke" />)}
    </svg>
    <div className={styles.bands}>
      {BANDS.map(({id,title,Icon})=><section key={id} data-testid={`harness-anatomy-band-${id}`} className="min-w-0">
        <h2 className={styles.bandTitle}><Icon size={ICON_SIZE.sm} aria-hidden /><span>{t(title)}</span></h2>
        <ul className={styles.slots}>
          {slots.filter(slot=>slot.band===id).map(slot=><li key={slot.id} className={styles.slot} data-status={slot.status}>
            <div className={styles.nodeHead}><button type="button" data-testid={`harness-diagram-node-${slot.id}`} aria-expanded={selectedId===slot.id} aria-controls={`${detailId}-${slot.id}`} onClick={()=>onSelect(slot.id)}
              className={controlClass({shape:'card',size:'md',active:selectedId===slot.id,hoverSurface:'lift',className:'atlas-touch-floor w-full flex-wrap justify-between text-left'})}>
              <span className="min-w-0 max-w-full break-words text-body font-[var(--font-weight-emphasis)]">{t(`anatomySlots.${slot.id}.title`)}</span>
              <span className="shrink-0 text-label text-[color:var(--color-text-tertiary)]">{slot.status==='absent'?t('anatomyAbsent'):t(`anatomyUnits.${slot.id}`,{count:slot.count})}</span>
            </button></div>
            <RowDisclosure open={selectedId===slot.id} id={`${detailId}-${slot.id}`}>
              {selectedId===slot.id ? selectedContent : null}
            </RowDisclosure>
          </li>)}
        </ul>
      </section>)}
    </div>
    <p className="mt-3 break-keep text-center text-label text-[color:var(--color-text-tertiary)]">{t('diagramHint')}</p>
  </div>;
}
