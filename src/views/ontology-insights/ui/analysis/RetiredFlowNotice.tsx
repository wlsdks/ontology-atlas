'use client';

import { useTranslations } from 'next-intl';
import { controlClass } from '@/shared/ui/control-class';

/** Says where saved explanations went, from what the folder holds: nothing extra for none, a reader for some. */
export function RetiredFlowNotice({ count, onOpenHistory }: { count: number; onOpenHistory: (() => void) | null }) {
  const t = useTranslations('ontologyPages.insights.analysis.flowRetired');
  return <p data-testid="analysis-flow-retired" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-tertiary)]">
    <span>{t('first')}</span>
    {count > 0 ? <span data-testid="analysis-flow-retired-count">{t('count', { count })}</span> : null}
    {count > 0 && onOpenHistory ? <button type="button" data-testid="analysis-flow-open-history" onClick={onOpenHistory} className={controlClass({ hoverSurface: 'lift', shape: 'link', size: 'md', tone: 'accent', className: 'atlas-touch-floor' })}>{t('open')}</button> : null}
    {count > 0 && !onOpenHistory ? <span>{t('web')}</span> : null}
  </p>;
}
