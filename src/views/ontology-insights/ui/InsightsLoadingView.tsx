'use client';

import { useTranslations } from 'next-intl';
import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';
import { PageHeaderBar } from '@/shared/ui/layout/page-header-bar';
import { cn } from '@/shared/lib/cn';
import { PAGE_FRAME } from '@/shared/ui/tokens/page-frame';

/** This shell must not subscribe to graph derivation or import analysis widgets. */
export function InsightsLoadingView() {
  const t = useTranslations('ontologyPages.insights');
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main
        id="main"
        tabIndex={-1}
        data-route-loading="true"
        data-testid="insights-loading"
        aria-busy="true"
        className="flex min-h-full flex-col pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]"
      >
        <PageHeaderBar frame="page" title={t('analysis.title')} />
        <div className={cn(PAGE_FRAME, 'flex flex-1 flex-col pt-8 md:pt-10')}>
          <div role="status" className="route-loading-in flex flex-1 flex-col items-center justify-center gap-3 py-12 text-body text-[color:var(--color-text-secondary)]">
            <BrandWaitingMark active initialVisibility="visible" />
            <p>{t('loading')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
