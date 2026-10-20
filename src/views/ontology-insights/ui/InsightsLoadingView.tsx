'use client';

import { useTranslations } from 'next-intl';
import { PageHeaderBar } from '@/shared/ui/layout/page-header-bar';
import { PAGE_FRAME } from '@/shared/ui/tokens/page-frame';
import { WaitStage } from '@/shared/ui/status/wait-stage';

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
        className="flex min-h-full flex-col"
      >
        <PageHeaderBar frame="page" title={t('analysis.title')} />
        <div className={`${PAGE_FRAME} relative flex-1`}>
          <WaitStage mark="mascot" title={t('loading')} delayed />
        </div>
      </main>
    </div>
  );
}
