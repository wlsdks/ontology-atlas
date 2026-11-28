import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { buttonVariants } from '@/shared/ui/controls/button';
import { GatewayNav } from '@/widgets/gateway-chrome';
import { SampleMapStage } from './SampleMapStage';

export interface SampleCensus {
  conceptCount: number;
  relationCount: number;
}

/**
 * The words around the sample map are prerendered markup, so they read before any script runs; the map
 * itself is the client's. The counts come from the same sample file the map loads, read at build time
 * (`readSampleCensus`): a sample that holds no concept fails the build instead of publishing an empty map.
 * Without them, as in the dev server, the size line is left out.
 */
export function SampleMapPage({ locale, census }: { locale: string; census?: SampleCensus | undefined }) {
  const t = useTranslations('sampleMap');

  return (
    <div className="flex min-h-full w-full flex-col bg-[color:var(--color-canvas)]">
      <GatewayNav />
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
        <header className={cn(PAGE_GUTTER, 'py-6 md:pt-10 md:pb-8')}>
          <div className={cn(PAGE_COLUMN, 'flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10')}>
            <div className="max-w-[var(--measure-prose)]">
              <h1 className="text-hero leading-hero font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <p className="mt-3 text-body-lg leading-prose text-[color:var(--color-text-secondary)]">{t('lead')}</p>
              <p className="mt-2 text-body leading-prose text-[color:var(--color-text-tertiary)]">{t('readOnly')}</p>
              {census ? (
                <p
                  data-testid="sample-map-size"
                  className="mt-3 font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]"
                >
                  {t('size', { concepts: census.conceptCount, relations: census.relationCount })}
                </p>
              ) : null}
            </div>
            <a
              href={withBasePath(`/${locale}/download/`)}
              data-testid="sample-map-download"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'touch-hit-expand shrink-0 self-start')}
            >
              {t('download')}
            </a>
          </div>
        </header>
        <SampleMapStage />
      </main>
    </div>
  );
}
