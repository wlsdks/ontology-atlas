'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import type { AnalysisPair } from '../../lib/analysis-model';
import { visibleAnalysisItems } from '../../lib/analysis-selection';
import styles from './analysis.module.css';

const name = (node: AnalysisPair['from']) => node.display ?? node.title;
export function PairRail({ pairs, selected, count, onSelect }: { pairs: readonly AnalysisPair[]; selected: string; count: number; onSelect: (pair: AnalysisPair) => void }) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const [limit, setLimit] = useState(6);
  const list = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);
  const visible = visibleAnalysisItems(pairs, limit, selected, pair => pair.id);
  useLayoutEffect(() => {
    if (!pending.current) return;
    const target = [...list.current?.querySelectorAll<HTMLButtonElement>('[data-analysis-pair-id]') ?? []].find(node => node.dataset.analysisPairId === pending.current);
    if (target) { target.focus(); pending.current = null; }
  }, [limit]);
  function reveal() {
    const next = visibleAnalysisItems(pairs, limit + 6, selected, pair => pair.id);
    pending.current = next.find(pair => !visible.some(item => item.id === pair.id))?.id ?? null;
    setLimit(value => value + 6);
  }
  return <nav className={styles.pairRail} aria-label={t('choosePair')}>
    <div className={styles.railHeading}><div><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('pairRailTitle')}</h3><p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">{t('pairRailScope', { pairs: pairs.length, count })}</p></div>{pairs.length > limit ? <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={reveal}>{t('morePairsCompact', { count: pairs.length - limit })}</Button> : null}</div>
    <div ref={list} className={styles.pairChoices}>{visible.map(pair => <button type="button" key={pair.id} data-testid="analysis-pair" data-analysis-pair-id={pair.id} aria-pressed={pair.id === selected} onClick={() => onSelect(pair)} className={controlClass({ hoverSurface: 'lift', shape: 'row', size: 'lg', tone: pair.id === selected ? 'accentOnTint' : 'default', active: pair.id === selected, className: 'atlas-touch-floor w-full justify-between' })}><span className={styles.pairNames}><span>{name(pair.from)}</span><span className={styles.pairTarget}>→ {name(pair.to)}</span></span><span className="font-mono text-title tabular-nums">{pair.edges.length}</span></button>)}</div>
  </nav>;
}
