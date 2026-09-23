'use client';

import { ArrowRight, BookOpen, CircleHelp, Eye, FolderCode, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore, type ReactNode } from 'react';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { AnatomyBand, AnatomySlot } from '../model/harness-anatomy';
import styles from './harness-structure-diagram.module.css';

const BANDS = [
  { id: 'tells', title: 'coverageColumnTold', caption: 'anatomyTellsCaption', Icon: BookOpen },
  { id: 'gates', title: 'coverageColumnGated', caption: 'anatomyGatesCaption', Icon: Shield },
  { id: 'watches', title: 'coverageColumnWatched', caption: 'anatomyWatchesCaption', Icon: Eye },
] as const;

const STACKED_QUERY = '(max-width: 79.99rem)';
const subscribeToLayout = (onChange: () => void) => {
  const query = window.matchMedia(STACKED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const getStackedLayout = () => window.matchMedia(STACKED_QUERY).matches;
const getServerLayout = () => false;

/** A conceptual repository-defined path: guides enter, gates constrain, checks observe. */
export function HarnessStructureDiagram({ slots, sourceRoot, selectedId, detailId, selectedContent, onSelect }: {
  slots: readonly AnatomySlot[];
  sourceRoot: string;
  selectedId: string | null;
  detailId: string;
  selectedContent: ReactNode;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('harness');
  const stacked = useSyncExternalStore(subscribeToLayout, getStackedLayout, getServerLayout);
  const name = sourceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? sourceRoot;
  const selected = slots.find(slot => slot.id === selectedId);
  const selectSlot = (id: string, button: HTMLButtonElement) => {
    onSelect(id);
    if (!stacked) return;
    const keepSelectionVisible = () => {
      if (!button.isConnected) return;
      const box = button.getBoundingClientRect();
      if (!button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))) {
        button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
    };
    requestAnimationFrame(keepSelectionVisible);
    window.setTimeout(keepSelectionVisible, 220);
  };
  const band = (id: AnatomyBand) => {
    const config = BANDS.find(item => item.id === id)!;
    const bandSlots = slots.filter(slot => slot.band === id);
    return <section data-testid={`harness-anatomy-band-${id}`} className={styles.band} data-band={id} key={id}>
      <div className={styles.bandHeading}>
        <span className={styles.bandIcon}><config.Icon size={ICON_SIZE.md} aria-hidden /></span>
        <span className={styles.bandTitle}><strong className="font-[var(--font-weight-emphasis)]">{t(config.title)}</strong><small>{t(config.caption)}</small></span>
        <span className={styles.bandCount}>{t('diagramParts', { count: bandSlots.length })}</span>
      </div>
      <ul className={styles.slots}>{bandSlots.map(slot => <li key={slot.id} className={styles.slot} data-selected={selectedId === slot.id} data-status={slot.status}>
        <button type="button" data-testid={`harness-diagram-node-${slot.id}`} aria-expanded={selectedId === slot.id} aria-controls={stacked ? `${detailId}-${slot.id}` : detailId} onClick={event => selectSlot(slot.id, event.currentTarget)}
          className={controlClass({ shape: 'row', size: 'md', active: selectedId === slot.id, hoverSurface: 'lift', className: 'atlas-touch-floor w-full text-left' })}>
          <span className={styles.slotName}>{t(`anatomySlots.${slot.id}.title`)}</span>
          <span className={styles.slotCount}>{slot.status === 'absent' ? t('anatomyAbsent') : t(`anatomyUnits.${slot.id}`, { count: slot.count })}</span>
        </button>
        <div className={styles.inlineEvidence}>
          <RowDisclosure open={stacked && selectedId === slot.id} id={`${detailId}-${slot.id}`}>
            {stacked && selectedId === slot.id ? <div key={slot.id} data-harness-detail className={styles.detailEnter}>{selectedContent}</div> : null}
          </RowDisclosure>
        </div>
      </li>)}</ul>
    </section>;
  };
  return <div data-testid="harness-structure-diagram" className={styles.diagram} data-active-band={selected?.band ?? 'tool'}>
    <div className={styles.source}><FolderCode size={ICON_SIZE.md} aria-hidden /><span>{t('diagramRoot')}</span><code title={sourceRoot}>{name}</code></div>
    <div className={styles.workbench}>
      <div className={styles.flow}>
        {band('tells')}
        <span className={styles.connector} aria-hidden><ArrowRight size={ICON_SIZE.md} /></span>
        <div className={styles.center}>
          <div className={styles.core}>
            <CircleHelp size={ICON_SIZE.lg} aria-hidden />
            <span><strong className="font-[var(--font-weight-emphasis)]">{t('anatomySlots.loop.title')}</strong><small>{t('anatomyToolBand')}</small></span>
          </div>
          {band('gates')}
        </div>
        <span className={styles.connector} aria-hidden><ArrowRight size={ICON_SIZE.md} /></span>
        {band('watches')}
      </div>
      <section className={styles.inspector} aria-label={t('diagramEvidence')} data-selected={selectedId !== null}>
        <div className={styles.inspectorHeading}><span>{t('diagramEvidence')}</span><strong className="font-[var(--font-weight-emphasis)]">{selected ? t(`anatomySlots.${selected.id}.title`) : t('diagramSelectPart')}</strong></div>
        <RowDisclosure open={!stacked && selectedId !== null} id={detailId}>{!stacked && selectedId ? <div key={selectedId} data-harness-detail className={styles.detailEnter}>{selectedContent}</div> : null}</RowDisclosure>
      </section>
    </div>
    <p className={styles.hint}>{t('diagramHint')}</p>
  </div>;
}
