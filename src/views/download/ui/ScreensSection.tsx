import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { ScreensStage } from './ScreensStage';
import { SectionIntro } from './SectionIntro';

export function ScreensSection() {
  const t = useTranslations('download.screens');
  return (
    <section
      id="screens"
      data-testid="gateway-screens-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <ScreensStage intro={<SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />} />
      </div>
    </section>
  );
}
