'use client';

import { useTranslations } from 'next-intl';
import { WaitStage } from '@/shared/ui/status/wait-stage';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE, PAGE_TITLE_ROW } from '@/shared/ui/tokens/page-frame';

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
        className="relative flex min-h-full flex-col"
      >
        <div className={PAGE_FRAME}>
          <header className={PAGE_HEADER_ROW}>
            <div className={PAGE_TITLE_ROW}>
              <h1 className={PAGE_TITLE}>
                {t('analysis.title')}
              </h1>
            </div>
          </header>
        </div>
        <WaitStage mark="mascot" title={t('loading')} delayed />
      </main>
    </div>
  );
}
