import { getTranslations } from 'next-intl/server';
import { withBasePath } from '@/shared/lib/base-path';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The server-rendered fallback for `/`: under static export it is the whole page for anything
 * without JS (link previews, crawlers), so it must say what the gateway says. It reuses the
 * gateway's own sentences; new positioning copy would go
 * through `pnpm po:route`. `MapEntryFallback` stays where the map description is true. Both
 * links are real destinations, so the gateway works with no JS.
 */
export async function GatewayEntryFallback({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'download' });

  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="gateway-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 flex-col justify-center gap-6 bg-[color:var(--color-canvas)] px-6 py-10 md:px-12"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] break-keep text-[color:var(--color-text-primary)]">
          {/* The same two lines as the real screen, one sentence per line. */}
          <span className="block">{t('heroTitleLine1')}</span>
          <span className="block">{t('heroTitleLine2')}</span>
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('heroLead')}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body leading-body">
        {/* `link/lg` matches the parent text and adds `min-h-6`, the WCAG 2.5.8 floor. */}
        <a
          className={controlClass({ shape: 'link', size: 'lg', tone: 'accent', className: 'touch-hit-expand' })}
          href={withBasePath(`/${locale}/download/`)}
        >
          {t('downloadSectionLabel')}
        </a>
        <a
          className={controlClass({ shape: 'link', size: 'lg', className: 'touch-hit-expand' })}
          href={withBasePath(`/${locale}/topology/`)}
        >
          {t('webCta')}
        </a>
      </p>
    </main>
  );
}
