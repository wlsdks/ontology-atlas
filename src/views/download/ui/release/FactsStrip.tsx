'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN } from '@/shared/lib/public-pages/gateway-frame';
import { controlClass } from '@/shared/ui/control-class';
import { releaseFactRows } from '../../lib/release/release-fact-rows';
import { displayReleaseTag, macosPublishedDate, type MacosReleaseAsset, type WindowsReleaseAsset } from '../../lib/release/release-state';

/**
 * Release facts for the file the CTA points at, taking the page's one platform decision, or a
 * visitor checks another file's checksum. Unpublished, size and checksum rows do not exist.
 */
export function FactsStrip({
  scope = 'gateway',
  row = false,
  className,
  published,
  primaryAsset,
  windowsAsset: windowsInstaller,
  windowsPrimary,
  sizeOnCta,
  heroIn,
  handheld,
}: {
  scope?: 'gateway' | 'gateway-closing';
  row?: boolean;
  className?: string;
  published: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsAsset: WindowsReleaseAsset | null;
  windowsPrimary: boolean;
  sizeOnCta: boolean;
  heroIn: boolean;
  handheld: boolean;
}) {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();
  const facts = releaseFactRows(
    {
      published,
      primaryAsset,
      windowsAsset: windowsInstaller,
      windowsPrimary,
      handheld,
      sizeOnCta,
      tag: displayReleaseTag(published),
      publishedOn: publishedAt
        ? format.dateTime(publishedAt, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })
        : null,
    },
    {
      versionLabel: t('factVersionLabel'),
      requiresLabel: t('factRequiresLabel'),
      minOsSuffix: t('factMinOsSuffix'),
      unpublished: t('factUnpublished'),
      shaLinkName: (file) => t('factShaLink', { file }),
    },
  );
  const tag = displayReleaseTag(published);

  return (
    <div className={cn('gateway-rise gateway-t400', heroIn && 'is-in', 'w-full', className)}>
      {/* One line when every fact fits; otherwise a grid of equal columns that fill the width, so
          every row shares a start line. A container query, since the column decides the fit. 54rem:
          four equal columns hold the widest fact (the Korean requirements value, 173px). */}
      <div
        data-testid={`${scope}-facts`}
        className={cn(
          !row && PAGE_COLUMN,
          !row && '@container/gateway-facts border-t border-[color:var(--color-border-soft)] py-5',
        )}
      >
        <dl
          className={
            row
              ? 'flex min-w-0 flex-wrap gap-x-8 gap-y-4'
              : 'grid min-w-0 grid-cols-1 gap-x-12 gap-y-4 @min-[21rem]/gateway-facts:grid-cols-2 @min-[54rem]/gateway-facts:grid-cols-[repeat(4,minmax(0,1fr))] @min-[66rem]/gateway-facts:flex'
          }
        >
          {facts.map((fact) => (
            <div key={fact.label} className={cn('min-w-0', fact.narrowOnly && 'sm:hidden')}>
              <dt className={row ? ROW_LABEL : FACT_LABEL}>{fact.label}</dt>
              <dd
                data-token="engraved-numeral"
                className={cn(
                  FACT_VALUE,
                  row && ROW_VALUE,
                  'tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]',
                  fact.code && 'font-mono',
                )}
              >
                {fact.href ? (
                  <a
                    href={fact.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={fact.name}
                    data-testid={`${scope}-facts-sha`}
                    className={cn(FACT_LINK, 'font-mono', row && ROW_VALUE)}
                  >
                    <span aria-hidden data-external-link-marker>
                      ↗
                    </span>
                    {fact.value}
                  </a>
                ) : (
                  fact.value
                )}
              </dd>
            </div>
          ))}
          {/* A link, not a fact, so it takes the link grammar instead of the engraved face. On a
              phone it takes the last row whole, since five cells leave one alone in two columns. */}
          {scope === 'gateway' ? (
            <div className="min-w-0 max-sm:col-span-full @min-[66rem]/gateway-facts:ml-auto">
              <dt className={FACT_LABEL}>{t('factChangelogLabel')}</dt>
              <dd className={FACT_VALUE}>
                <Link href="/changelog" data-testid={`${scope}-facts-changelog`} className={FACT_LINK}>
                  {t('factChangelogValue', { tag })}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

const FACT_LABEL =
  'font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-tertiary)]';

const FACT_VALUE = 'mt-1 text-body leading-body';

const ROW_LABEL = 'text-label leading-label text-[color:var(--color-text-tertiary)]';

const ROW_VALUE = 'mt-1 text-body leading-body';

const FACT_LINK = controlClass({
  shape: 'link',
  hoverInk: 'strong',
  className:
    // Top-aligned, or the link's 24px floor sits its label below the values beside it.
    'touch-hit-expand items-start text-body leading-body text-[color:var(--color-text-secondary)] underline underline-offset-2',
});
