import { getTranslations } from 'next-intl/server';
import { withBasePath } from '@/shared/lib/base-path';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The server-rendered surface for the root `/` — **the gateway version**.
 *
 * **Why not `MapEntryFallback`.** Under static export this route's HTML body is
 * nothing but the Suspense fallback, so this component *is* the entire page content
 * as seen by anything that does not run JS: link preview cards and crawlers.
 *
 * The owner's 2026-07-29 sign-off made `/` the face shown to web visitors (ledger:
 * the reversal of 「root-first-open」). The fallback still described the map, which
 * meant sharing this product's headline URL produced a preview saying something
 * **different from the screen that actually opens**. `MapEntryFallback` stays where
 * that description is true (`/topology`).
 *
 * **No new copy is written here.** The headline and lead reuse the sentences the
 * gateway page already uses (`download.heroTitleLine1/2` and `heroLead`, the
 * monument headline from the 2026-08-18 gateway remake). Inventing positioning here
 * would be a PO-council trigger, and above all **a fallback saying something other
 * than the real screen** is precisely the defect this fixes.
 *
 * (The old `stageTitle`/`stageLead` left the catalogue during that remake while this
 * shared component kept requesting them, so `/ko/` printed MISSING_MESSAGE — owner
 * observation, 2026-08-18. Deleting a copy key starts with grepping every consumer.)
 *
 * The two links are real destinations — where to download and where to look without
 * installing. A gateway has to stay alive with no JS.
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
          {/* The same two lines as the real screen: one sentence per line, the monument contract in miniature. */}
          <span className="block">{t('heroTitleLine1')}</span>
          <span className="block">{t('heroTitleLine2')}</span>
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('heroLead')}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body leading-body">
        {/* link/lg = text-body (matching the parent p) + min-h-6, the WCAG 2.5.8 floor; it used to be an 18px line box. */}
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
