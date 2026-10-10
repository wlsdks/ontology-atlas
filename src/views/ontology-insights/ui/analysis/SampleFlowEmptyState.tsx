'use client';

import { useTranslations } from 'next-intl';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { Button, EmptyState } from '@/shared/ui';

export function SampleFlowEmptyState({ onExplore }: { onExplore: () => void }) {
  const t = useTranslations('ontologyPages.insights.flow');
  return <section data-testid="flow-tab" className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-8 md:py-12">
    <div data-testid="flow-no-version">
      <EmptyState align="center" tone="solid" titleAs="h2" title={t('sampleTitle')} description={t('sampleBody')}
        action={<>
          <OpenVaultCta testId="flow-open-vault" variant="primary" className="atlas-touch-floor" />
          <Button data-testid="analysis-back-to-system" variant="ghost" size="sm" className="atlas-touch-floor" onClick={onExplore}>{t('exploreConnections')}</Button>
        </>} />
    </div>
  </section>;
}
