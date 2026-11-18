'use client';

import { useTranslations } from 'next-intl';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { controlClass } from '@/shared/ui/control-class';

/** What the gateway fallback says, as plain strings, so server and browser draw the same markup. */
export interface GatewayEntryCopy {
  eyebrow: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroLead: string;
  downloadSectionLabel: string;
  webCta: string;
}

export function GatewayEntryView({ copy, locale }: { copy: GatewayEntryCopy; locale: string }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="gateway-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 flex-col justify-center bg-[color:var(--color-canvas)] px-6 py-10 md:px-12"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] break-keep text-[color:var(--color-text-primary)]">
          {/* The same two lines as the real screen, one sentence per line. */}
          <span className="block">{copy.heroTitleLine1}</span>
          <span className="block">{copy.heroTitleLine2}</span>
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {copy.heroLead}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body leading-body">
        {/* `link/lg` matches the parent text and adds `min-h-6`, the WCAG 2.5.8 floor. */}
        <a
          className={controlClass({ shape: 'link', size: 'lg', tone: 'accent', className: 'touch-hit-expand' })}
          href={withBasePath(`/${locale}/download/`)}
        >
          {copy.downloadSectionLabel}
        </a>
        <a
          className={controlClass({ shape: 'link', size: 'lg', className: 'touch-hit-expand' })}
          href={withBasePath(`/${locale}/topology/`)}
        >
          {copy.webCta}
        </a>
      </p>
      </div>
    </main>
  );
}

/**
 * The same markup in the browser, for the moment React renders the page body before it knows
 * whether this is the installed app: it keeps the exported fallback on screen instead of drawing
 * another surface in its place.
 */
export function GatewayEntryFallbackLive({ locale }: { locale: string }) {
  const t = useTranslations('download');
  return (
    <GatewayEntryView
      locale={locale}
      copy={{
        eyebrow: t('eyebrow'),
        heroTitleLine1: t('heroTitleLine1'),
        heroTitleLine2: t('heroTitleLine2'),
        heroLead: t('heroLead'),
        downloadSectionLabel: t('downloadSectionLabel'),
        webCta: t('webCta'),
      }}
    />
  );
}
