'use client';

import { ArrowRight, BookOpen, CircleHelp, Eye, FolderCode, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore, type ReactNode } from 'react';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { controlClass } from '@/shared/ui/control-class';
import { InfoHint } from '@/shared/ui/info-hint';
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
  const loopSlot = slots.find(slot => slot.band === 'tool');
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
    <div className={styles.source}><FolderCode size={ICON_SIZE.md} aria-hidden /><span>{t('diagramRoot')}</span><code title={sourceRoot}><span className={styles.sourceName}>{name}</span>{sourceRoot !== name ? <span className={styles.sourcePath}>{sourceRoot}</span> : null}</code></div>
    <div className={styles.workbench}>
      <div className={styles.flow}>
        {band('tells')}
        <span className={styles.connector} aria-hidden><ArrowRight size={ICON_SIZE.md} /></span>
        <div className={styles.center}>
          {/* The one place the agent loop is named. Its explanation used to be repeated in a
              dashed band under the whole panel, title and all; it lives behind this card's own
              hint now, so the diagram says it once, where the loop sits. */}
          <div className={styles.core} data-testid="harness-anatomy-band-tool">
            <CircleHelp size={ICON_SIZE.lg} aria-hidden />
            <span data-testid="harness-anatomy-slot-loop" data-status={loopSlot?.status ?? 'tool-owned'}><strong className="font-[var(--font-weight-emphasis)]">{t('anatomySlots.loop.title')}</strong><small>{t('anatomyToolBand')}</small></span>
            <InfoHint align="center" className="ml-auto" label={t('anatomyToolBand')} panelClassName="max-w-full max-h-[35dvh] overflow-y-auto">
              <span className="flex flex-col gap-2">
                <span>{t('anatomyToolCaption')}</span>
                <span>{t('anatomySlots.loop.body')}</span>
              </span>
            </InfoHint>
          </div>
          {band('gates')}
        </div>
        <span className={styles.connector} aria-hidden><ArrowRight size={ICON_SIZE.md} /></span>
        {band('watches')}
      </div>
      <section className={styles.inspector} aria-label={t('diagramEvidence')} data-selected={selectedId !== null}>
        {/* One name for the selection: the header carries it with its count, and the evidence
            below starts at the row's sentence instead of printing the same title a second time. */}
        <div className={styles.inspectorHeading}><span>{t('diagramEvidence')}</span><div className={styles.inspectorTitle}><strong className="font-[var(--font-weight-emphasis)]">{selected ? t(`anatomySlots.${selected.id}.title`) : t('diagramSelectPart')}</strong>{selected ? <span data-status={selected.status}>{selected.status === 'absent' ? t('anatomyAbsent') : t(`anatomyUnits.${selected.id}`, { count: selected.count })}</span> : null}</div></div>
        <RowDisclosure open={!stacked && selectedId !== null} id={detailId}>{!stacked && selectedId ? <div key={selectedId} data-harness-detail className={styles.detailEnter}>{selectedContent}</div> : null}</RowDisclosure>
      </section>
    </div>
    <p className={styles.hint}>{t('diagramHint')}</p>
  </div>;
}
