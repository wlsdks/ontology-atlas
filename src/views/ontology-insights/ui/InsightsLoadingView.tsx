'use client';

import { useTranslations } from 'next-intl';
import { useDataSourceMode } from '@/entities/vault-session';
import { BrandWaitingMark } from '@/shared/ui/brand-waiting-mark';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';
import { selectInsightsScopeTitle } from '../lib/insights-scope-title';

/** This shell must not subscribe to graph derivation or import analysis widgets. */
export function InsightsLoadingView() {
  const t = useTranslations('ontologyPages.insights');
  const mode = useDataSourceMode();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main
        id="main"
        tabIndex={-1}
        data-route-loading="true"
        data-testid="insights-loading"
        aria-busy="true"
        className={`${PAGE_FRAME} flex min-h-full flex-col pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]`}
      >
        <header className={PAGE_HEADER_ROW}>
          <div className={PAGE_TITLE_ROW}>
            <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
              {selectInsightsScopeTitle(mode, { sample: t('titleSample'), folder: t('title') })}
            </h1>
            <p className="max-w-xl text-body text-[color:var(--color-text-tertiary)]">
              {selectInsightsScopeTitle(mode, { sample: t('subtitleSample'), folder: t('subtitle') })}
            </p>
          </div>
        </header>
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-body text-[color:var(--color-text-secondary)]">
          <BrandWaitingMark active initialVisibility="visible" />
          <p>{t('loading')}</p>
        </div>
      </main>
    </div>
  );
}
