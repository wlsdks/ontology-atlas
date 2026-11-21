'use client';

import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GITHUB_REPO_URL } from '@/shared/config/site/social-links';
import { cn } from '@/shared/lib/cn';
import { buttonVariants } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { GithubMark } from '@/shared/ui/marks/service-marks/github-mark';
import { formatAssetSize, type MacosReleaseAsset, type WindowsReleaseAsset } from '../../lib/release/release-state';

/**
 * The CTA wraps below `sm`: its longest label overflows 320px, and neither "unsigned" nor the
 * file's name may be cut (`.claude/rules/surfaces.md`). Left-aligned, or a two-line wrap splits
 * the icon from the text.
 */
const HERO_CTA_WRAP = 'min-w-0 whitespace-normal text-left sm:whitespace-nowrap';

const TEST_IDS = {
  hero: {
    cta: 'gateway-hero-cta',
    mac: 'gateway-hero-mac',
    windows: 'gateway-hero-windows',
    github: 'gateway-hero-github',
  },
  closing: {
    cta: 'gateway-closing-cta',
    mac: 'gateway-closing-mac',
    windows: 'gateway-closing-windows',
    github: 'gateway-closing-github',
  },
} as const;

/**
 * The browser map is the download page's second way in and its heaviest route, so it is fetched
 * once a visitor points at, focuses or touches a way to it, not as soon as the link is on screen.
 */
function MapLink({
  href,
  className,
  children,
  'data-testid': testId,
}: {
  href: '/topology';
  className: string;
  children: ReactNode;
  'data-testid': string;
}) {
  const [intent, setIntent] = useState(false);
  const want = () => setIntent(true);
  return (
    <Link
      href={href}
      prefetch={intent ? null : false}
      onPointerEnter={want}
      onFocus={want}
      onTouchStart={want}
      data-testid={testId}
      className={className}
    >
      {children}
    </Link>
  );
}

const ACTIONS_STACK = 'max-sm:w-full max-sm:flex-col max-sm:items-stretch';

export function DownloadActions({
  scope,
  className,
  fileWins,
  primaryAsset,
  windowsInstaller,
  windowsPrimary,
}: {
  scope: 'hero' | 'closing';
  className?: string;
  fileWins: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsInstaller: WindowsReleaseAsset | null;
  windowsPrimary: boolean;
}) {
  const t = useTranslations('download');
  const id = TEST_IDS[scope];
  const outlinedPad = cn('px-4 sm:px-6', scope === 'hero' && 'min-[80rem]:px-4');

  const macLink = primaryAsset ? (
    <a
      href={primaryAsset.downloadUrl}
      data-testid={windowsPrimary ? id.mac : id.cta}
      className={cn(
        buttonVariants(windowsPrimary ? { variant: 'outline', size: 'lg' } : { size: 'lg' }),
        windowsPrimary && outlinedPad,
        HERO_CTA_WRAP,
      )}
    >
      <Download size={ICON_SIZE.lg} aria-hidden />
      {t('primaryCtaPublished')}
      <AssetSize bytes={primaryAsset.sizeBytes} onFill={!windowsPrimary} />
    </a>
  ) : null;
  /* As the outlined control the unsigned marker rides on the button: it is needed before downloading. */
  const windowsLink = windowsInstaller ? (
    <a
      href={windowsInstaller.downloadUrl}
      data-testid={windowsPrimary ? id.cta : id.windows}
      className={cn(
        buttonVariants(windowsPrimary ? { size: 'lg' } : { variant: 'outline', size: 'lg' }),
        !windowsPrimary && outlinedPad,
        HERO_CTA_WRAP,
      )}
    >
      <Download size={ICON_SIZE.lg} aria-hidden />
      {windowsPrimary ? (
        <>
          {t('windowsDownloadCta')}
          <AssetSize bytes={windowsInstaller.sizeBytes} onFill />
        </>
      ) : (
        <>
          {t('heroWindowsCta')}
          <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('windowsUnsignedShort')}
          </span>
        </>
      )}
    </a>
  ) : null;

  return (
    <div className={cn('flex flex-wrap items-center gap-3', ACTIONS_STACK, className)}>
      {fileWins ? (
        <>
          {windowsPrimary ? windowsLink : null}
          {macLink}
          {windowsPrimary ? null : windowsLink}
        </>
      ) : (
        <>
          <MapLink
            href="/topology"
            data-testid={id.cta}
            className={cn(buttonVariants({ size: 'lg' }), HERO_CTA_WRAP)}
          >
            {t('webCta')}
          </MapLink>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            data-testid={id.github}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), outlinedPad, HERO_CTA_WRAP)}
          >
            <GithubMark />
            {t('githubCta')}
          </a>
        </>
      )}
      {fileWins && scope === 'hero' ? (
        <MapLink
          href="/topology"
          data-testid="gateway-hero-web-cta"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            outlinedPad,
            HERO_CTA_WRAP,
          )}
        >
          {t('heroPlaygroundCta')}
        </MapLink>
      ) : null}
    </div>
  );
}

/**
 * Hidden below `sm`, where it clipped the button and a phone cannot install the file anyway.
 * On a filled button it takes the label's ink: the engraved face drops to 1.41:1 on indigo.
 */
function AssetSize({ bytes, onFill = false }: { bytes: number; onFill?: boolean }) {
  return (
    <span
      className={cn(
        'hidden font-mono text-label leading-label sm:inline',
        // The label's exact token, unweakened: any step down falls below AA on filled indigo.
        onFill
          ? 'text-[color:var(--color-text-on-accent)]'
          : 'text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]',
      )}
    >
      {formatAssetSize(bytes)}
    </span>
  );
}
