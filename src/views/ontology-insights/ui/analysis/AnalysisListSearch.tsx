'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import styles from './analysis.module.css';

export function AnalysisListSearch({ value, onChange, label, shown, matches, total, selectionHidden, testId }: {
  value: string; onChange: (value: string) => void; label: string;
  shown: number; matches: number; total: number; selectionHidden: boolean; testId: string;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const input = useRef<HTMLInputElement>(null);
  function clear() { onChange(''); input.current?.focus(); }
  return <div className={styles.listSearch}>
    <Input ref={input} type="search" label={label} value={value} placeholder={t('searchByName')} data-testid={testId}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === 'Escape' && value) { event.preventDefault(); event.stopPropagation(); clear(); } }} />
    <div className={styles.listSearchStatus}>
      <p role="status" aria-atomic="true" className="text-label text-[color:var(--color-text-secondary)]">{value.trim() ? t('searchMatches', { count: matches, total }) : t('listShown', { shown, total })}</p>
      {value ? <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={clear} data-testid={`${testId}-clear`}>{t('clearSearch')}</Button> : null}
    </div>
    {value.trim() && !matches ? <p className="text-body text-[color:var(--color-text-secondary)]">{t('noSearchResults')}</p> : null}
    {selectionHidden ? <p className="text-label text-[color:var(--color-text-tertiary)]">{t('selectionKept')}</p> : null}
  </div>;
}
