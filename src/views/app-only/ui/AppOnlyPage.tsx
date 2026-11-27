import { AppWindow } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/shared/lib/cn';
import { PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { buttonVariants } from '@/shared/ui/controls/button';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

const INLINE_LINK_CLASS =
  'rounded-chip font-[var(--font-weight-emphasis)] text-[color:var(--color-indigo-text-soft)] underline decoration-[color:var(--color-indigo-a40)] underline-offset-4 hover:decoration-[color:var(--color-indigo-accent)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * What a plain browser sees at an address that is a screen of the installed app. It is server markup
 * with plain anchors and no client component, so it reads and links the same with scripts off, and
 * the exported HTML paints it from the first frame (`AppAddressFaces`).
 */
export async function AppOnlyPage({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'appOnly' });
  const downloadHref = withBasePath(`/${locale}/download/`);
  const sampleHref = withBasePath(`/${locale}/sample/`);
  const guideHref = withBasePath(`/${locale}/guide/connect-agent/`);

  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="app-only-page"
      className={cn(
        PAGE_GUTTER,
        'relative isolate flex flex-1 items-center justify-center overflow-hidden bg-[color:var(--color-canvas)] py-16',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(52%_62%_at_50%_46%,var(--color-indigo-a10)_0%,var(--color-indigo-a06)_40%,transparent_76%)]"
      />
      <div className="flex w-full max-w-[var(--measure-note-column)] flex-col items-center text-center">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] text-[color:var(--color-indigo-pale-a92)] shadow-[var(--shadow-elevation-2)]"
        >
          <AppWindow size={ICON_SIZE.lg} />
        </span>
        <h1 className="mt-6 text-balance text-hero-lg leading-hero-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <p className="mt-4 text-balance text-body-lg leading-prose text-[color:var(--color-text-secondary)]">
          {t('body')}
        </p>
        <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
          <a
            href={downloadHref}
            data-testid="app-only-download"
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'touch-hit-expand')}
          >
            {t('download')}
          </a>
          <a
            href={sampleHref}
            data-testid="app-only-sample"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'touch-hit-expand')}
          >
            {t('sample')}
          </a>
        </div>
        <p className="mt-8 text-balance text-body leading-prose text-[color:var(--color-text-tertiary)]">
          {t.rich('otherComputers', {
            sample: (chunks) => (
              <a href={sampleHref} data-testid="app-only-other-sample" className={INLINE_LINK_CLASS}>
                {chunks}
              </a>
            ),
            guide: (chunks) => (
              <a href={guideHref} data-testid="app-only-other-guide" className={INLINE_LINK_CLASS}>
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </main>
  );
}
