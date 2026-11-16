'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveDisplayReleaseTag } from '../lib/pending-release-tag';
import { Link, usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { DemoStage } from './DemoStage';
import { HeroTypewriter, heroSentence } from './HeroTypewriter';
import { buttonVariants } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { BrandCompanion } from '@/shared/ui/marks/brand-companion';
import { GithubMark } from '@/shared/ui/marks/github-mark';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS, RELEASE_VERSION } from '../lib/release-facts';
import {
  MACOS_RELEASE,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  releasePageUrl,
  windowsAsset,
} from '../lib/release-state';
import { useStageGraph } from '../lib/use-stage-graph';
import { GatewayFx } from './GatewayFx';
import { ScreensStage } from './ScreensStage';
import { LoopSection, StartSection } from './LoopSection';
import { OpenSourceSection } from './OpenSourceSection';
import { SectionIntro } from './SectionIntro';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';

/**
 * One grid: every section's content sits in `PAGE_GUTTER` + `PAGE_COLUMN`, starting at
 * max(--gateway-gutter, (viewport − --gateway-page-max) / 2), the --gateway-origin
 * (`shared/lib/public-pages/gateway-frame.ts`).
 */

const THIRD_PARTY_LICENSES_HREF = withBasePath('/third-party-licenses.txt');

/**
 * The CTA wraps below `sm`: its longest label overflows 320px, and neither "unsigned" nor the
 * file's name may be cut (`.claude/rules/surfaces.md`). Left-aligned, or a two-line wrap splits
 * the icon from the text.
 */
const HERO_CTA_WRAP = 'min-w-0 whitespace-normal text-left sm:whitespace-nowrap';

/**
 * Serves /download and /: a hero on its own clock, then sections whose scroll entrances
 * (`animation-timeline: view()`) do not exist under reduced motion
 * (`tests/contract/motion/reduced-motion-equivalent.contract.test.ts`).
 */
export function DownloadPage() {
  const pathname = usePathname() ?? '/';
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  const primaryAsset = published ? macosAssetFor('aarch64') : null;
  /** The tab bar's own function: `/` shows the bar and `/download` hides it, and two lists drift. */
  const bottomTabBarPresent = !shouldHideBottomTabBar(pathname, false);
  const graph = useStageGraph();
  /** Decided once for the CTA, trust line and facts strip, or they disagree. */
  const visitorPlatform = useVisitorDesktopPlatform();
  const windowsInstaller = windowsAsset();
  const windowsPrimary = visitorPlatform === 'windows' && windowsInstaller !== null;
  /** The browser map wins when there is nothing to download or the visitor holds a phone. */
  const winner: 'file' | 'web' =
    published && primaryAsset && visitorPlatform !== 'handheld' ? 'file' : 'web';

  return (
    <div className="gateway-fx-stage relative flex min-h-full w-full flex-col">
      <GatewayFx />
      <GatewayNav />

      <main id="main" tabIndex={-1} className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <HeroSection
          published={published}
          primaryAsset={primaryAsset}
          windowsInstaller={windowsInstaller}
          windowsPrimary={windowsPrimary}
          winner={winner}
        />
        <LoopSection graph={graph} />
        <ScreensSection />
        <StartSection />
        <OpenSourceSection />
        <ClosingSection
          published={published}
          primaryAsset={primaryAsset}
          windowsInstaller={windowsInstaller}
          windowsPrimary={windowsPrimary}
          fileWins={winner === 'file' && published && primaryAsset !== null}
        />

        <div
          data-testid="download-bottom-band"
          data-gateway-bottom-reserve-token={
            bottomTabBarPresent ? '--topology-mobile-bottom-tab-reserve' : undefined
          }
          data-gateway-bottom-reserve-active={bottomTabBarPresent ? 'true' : undefined}
          className={cn(
            PAGE_GUTTER,
            'mt-[var(--gateway-section-gap)]',
            'shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={PAGE_COLUMN}>
            <footer className="border-t border-[color:var(--color-divider)] pt-5 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <GatewayReadingLinks />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono uppercase tracking-[var(--tracking-caps-14)]">
                  {tFooter('license')}
                </span>
                <span aria-hidden>·</span>
                <a
                  href={THIRD_PARTY_LICENSES_HREF}
                  data-testid="download-footer-third-party-licenses"
                  className={controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' })}
                >
                  {tFooter('thirdPartyLicenses')}
                </a>
                <span aria-hidden>·</span>
                <span className="font-mono">{tFooter('stack')}</span>
              </div>
              {/* Nominative use; marks follow the stricter rule in docs/features/agents.md. */}
              <p className="mt-3 max-w-[var(--measure-doc-column)] break-keep text-[color:var(--color-text-quaternary)]">
                {tFooter('trademarks')}
              </p>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Every entrance delay lives in CSS; JS adds one `is-in` class after mount. One headline line per
 * sentence at every width, so it measures against the full column.
 */
function HeroSection({
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary: heroWindowsPrimary,
  winner,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  winner: 'file' | 'web';
}) {
  const fileWins = winner === 'file' && published && primaryAsset !== null;
  const t = useTranslations('download');
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    // The frame after the still first paint; not a synchronous setState in the effect body.
    const id = requestAnimationFrame(() => setHeroIn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const moru = useTranslations('moru');

  /**
   * Every branch keeps all four destinations reachable. Windows' unsigned status is stated before
   * pressing, in the trust line or beside a demoted label; `TrustLine` is the only place it lives (hero and
   * closing), so shortening the copy deletes the fact.
   */
  const rise = (extra: string) => cn('gateway-rise', extra, heroIn && 'is-in');

  const heroLines = [
    { text: t('heroTitleLine1'), className: 'text-[color:var(--color-text-secondary)]' },
    { text: t('heroTitleLine2') },
  ];

  return (
    <section
      data-testid="gateway-hero"
      className={cn(PAGE_GUTTER, 'gateway-hero relative flex w-full flex-col overflow-x-clip')}
    >
      <div aria-hidden className="gateway-hero-stars" />
      {/*
        One column on a narrow window: Moru, the claim, the app. From 80rem the claim takes the left
        and the app the right, where Moru walks along the window's top edge (`.gateway-hero-grid`).
      */}
      <div className={cn(PAGE_COLUMN, 'gateway-hero-grid relative min-w-0')}>
        <div className={cn(rise('gateway-t240'), 'gateway-hero-moru flex justify-center')}>
          <BrandCompanion
            context="welcome"
            labels={{
              pause: moru('pause'),
              resume: moru('resume'),
              still: moru('still'),
              interact: moru('interact'),
            }}
          />
        </div>

        {/* The container sizes the headline against this column, one line per sentence. */}
        <div className="gateway-hero-text @container relative z-[1] flex min-w-0 flex-col items-center text-center min-[80rem]:items-start min-[80rem]:text-left">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="gateway-hero-source"
            className={cn(
              rise('gateway-t240'),
              controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' }),
              'gateway-hero-chip gap-2 rounded-chip border border-[color:var(--color-border-strong)] px-3.5 py-1.5 text-label leading-label',
            )}
          >
            <GithubMark />
            <span>{t('eyebrow')}</span>
          </a>

          <h1
            // The visible characters are aria-hidden.
            aria-label={heroSentence(heroLines)}
            className="gateway-hero-title mt-7 w-fit break-keep [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
          >
            {/* The first line is a step down in ink: the second line is the sentence's subject. */}
            <HeroTypewriter start={heroIn} lines={heroLines} />
          </h1>

          <div
            data-hero-text
            className="mt-7 flex min-w-0 max-w-[45rem] flex-col items-center min-[80rem]:items-start"
          >
            <p
              className={cn(
                rise('gateway-t240'),
                'max-w-[40rem] break-keep text-title font-normal leading-title text-[color:var(--color-text-secondary)]',
              )}
            >
              {t('heroLead')}
            </p>

            {/* Three controls: the visitor's platform filled, the others outlined at the same height. */}
            <DownloadActions
              scope="hero"
              className={cn(rise('gateway-t320'), 'mt-9 justify-center min-[80rem]:justify-start')}
              fileWins={fileWins}
              primaryAsset={primaryAsset}
              windowsInstaller={windowsInstaller}
              windowsPrimary={heroWindowsPrimary}
            />

            <TrustLine
              testId="gateway-hero-trust"
              className={cn(rise('gateway-t400'), 'mt-5')}
              windowsPrimary={heroWindowsPrimary}
            />
          </div>
        </div>

        <div
          id="demo"
          data-testid="gateway-demo-section"
          className="gateway-hero-window gateway-window min-w-0 scroll-mt-24"
        >
          <DemoStage />
        </div>
      </div>

      <FactsStrip
        className="relative z-[1] mt-10"
        published={published}
        primaryAsset={primaryAsset}
        windowsAsset={windowsInstaller}
        windowsPrimary={heroWindowsPrimary}
        sizeOnCta={fileWins}
        heroIn={heroIn}
      />
    </section>
  );
}

const TEST_IDS = {
  hero: {
    cta: 'gateway-hero-cta',
    mac: 'gateway-hero-mac',
    windows: 'gateway-hero-windows',
  },
  closing: {
    cta: 'gateway-closing-cta',
    mac: 'gateway-closing-mac',
    windows: 'gateway-closing-windows',
  },
} as const;

function DownloadActions({
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
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
}) {
  const t = useTranslations('download');
  const id = TEST_IDS[scope];

  const macLink = primaryAsset ? (
    <a
      href={primaryAsset.downloadUrl}
      data-testid={windowsPrimary ? id.mac : id.cta}
      className={cn(
        buttonVariants(windowsPrimary ? { variant: 'outline', size: 'lg' } : { size: 'lg' }),
        windowsPrimary && 'px-4 sm:px-6',
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
        !windowsPrimary && 'px-4 sm:px-6',
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
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {fileWins ? (
        <>
          {windowsPrimary ? windowsLink : null}
          {macLink}
          {windowsPrimary ? null : windowsLink}
        </>
      ) : (
        <Link
          href="/topology"
          data-testid={id.cta}
          className={cn(buttonVariants({ size: 'lg' }), HERO_CTA_WRAP)}
        >
          {t('webCta')}
        </Link>
      )}
      {fileWins && scope === 'hero' ? (
        <Link
          href="/topology"
          data-testid="gateway-hero-web-cta"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'lg' }),
            'px-4 sm:px-6',
            HERO_CTA_WRAP,
          )}
        >
          {t('heroPlaygroundCta')}
        </Link>
      ) : null}
    </div>
  );
}

function TrustLine({
  testId,
  className,
  windowsPrimary,
}: {
  testId: string;
  className?: string;
  windowsPrimary: boolean;
}) {
  const t = useTranslations('download');
  return (
    <p
      data-testid={testId}
      className={cn('break-keep text-body leading-body text-[color:var(--color-text-tertiary)]', className)}
    >
      {windowsPrimary ? t('trustLineWindows') : t('trustLine')}
    </p>
  );
}

function ClosingSection({
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary,
  fileWins,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  fileWins: boolean;
}) {
  const t = useTranslations('download');
  return (
    <section
      data-testid="gateway-closing"
      aria-labelledby="gateway-closing-title"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <div className="gateway-closing-stage @container flex min-w-0 flex-col items-center px-6 py-16 text-center sm:py-20">
          <h2
            id="gateway-closing-title"
            className="max-w-full [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
          >
            {t('closingTitle')}
          </h2>
          <DownloadActions
            scope="closing"
            className="mt-9 justify-center"
            fileWins={fileWins}
            primaryAsset={primaryAsset}
            windowsInstaller={windowsInstaller}
            windowsPrimary={windowsPrimary}
          />
          <TrustLine testId="gateway-closing-trust" className="mt-5" windowsPrimary={windowsPrimary} />
        </div>
        <FactsStrip
          scope="gateway-closing"
          className="mt-8"
          published={published}
          primaryAsset={primaryAsset}
          windowsAsset={windowsInstaller}
          windowsPrimary={windowsPrimary}
          sizeOnCta={fileWins}
          heroIn
        />
      </div>
    </section>
  );
}

/**
 * Release facts for the file the CTA points at, taking the page's one platform decision, or a
 * visitor checks another file's checksum. Unpublished, size and checksum rows do not exist.
 */
function FactsStrip({
  scope = 'gateway',
  className,
  published,
  primaryAsset,
  windowsAsset: windowsInstaller,
  windowsPrimary,
  sizeOnCta,
  heroIn,
}: {
  scope?: 'gateway' | 'gateway-closing';
  className?: string;
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsAsset: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  sizeOnCta: boolean;
  heroIn: boolean;
}) {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();

  const version = published
    ? [
        MACOS_RELEASE.tag,
        publishedAt
          ? format.dateTime(publishedAt, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      })} · ${t('factUnpublished')}`;

  const subject = windowsPrimary && windowsInstaller ? windowsInstaller : primaryAsset;
  const subjectIsWindows = subject !== null && subject === windowsInstaller;

  /* Mono only for program text (`code`): Hangul in the mono face reads as spaced-out printout. */
  const facts: { label: string; value: string; code?: boolean; href?: string; name?: string; narrowOnly?: boolean }[] = [
    { label: t('factVersionLabel'), value: version },
    {
      label: t('factRequiresLabel'),
      value: subjectIsWindows
        ? `${RELEASE_MIN_WINDOWS}${t('factMinOsSuffix')}`
        : `${RELEASE_MIN_MACOS}${t('factMinOsSuffix')} · Apple Silicon`,
    },
  ];
  if (published && subject) {
    facts.push({
      label: subjectIsWindows ? 'EXE' : 'DMG',
      value: formatAssetSize(subject.sizeBytes),
      narrowOnly: sizeOnCta,
    });
    facts.push({
      label: 'SHA-256',
      value: `${subject.sha256.slice(0, 8)}…${subject.sha256.slice(-8)}`,
      code: true,
      // The release page lists `<file>.sha256` beside the file; the guide holds the commands.
      href: releasePageUrl(subjectIsWindows ? 'windows' : 'macos'),
      name: t('factShaLink', { file: subject.fileName }),
    });
  }

  const tag = published
    ? MACOS_RELEASE.tag
    : resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      });

  return (
    <div className={cn('gateway-rise gateway-t400', heroIn && 'is-in', 'w-full', className)}>
      {/* One line when every fact fits; otherwise a grid of equal columns that fill the width, so
          every row shares a start line. A container query, since the column decides the fit. 54rem:
          four equal columns hold the widest fact (the Korean requirements value, 173px). */}
      <div
        data-testid={`${scope}-facts`}
        className={cn(
          PAGE_COLUMN,
          '@container/gateway-facts border-t border-[color:var(--color-border-soft)] py-5',
        )}
      >
        <dl className="grid min-w-0 grid-cols-1 gap-x-12 gap-y-4 @min-[21rem]/gateway-facts:grid-cols-2 @min-[54rem]/gateway-facts:grid-cols-[repeat(4,minmax(0,1fr))] @min-[66rem]/gateway-facts:flex">
          {facts.map((fact) => (
            <div key={fact.label} className={cn('min-w-0', fact.narrowOnly && 'sm:hidden')}>
              <dt className={FACT_LABEL}>{fact.label}</dt>
              <dd
                data-token="engraved-numeral"
                className={cn(
                  FACT_VALUE,
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
                    className={cn(FACT_LINK, 'font-mono')}
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
  'font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-tertiary)]';

const FACT_VALUE = 'mt-1 text-body leading-body';

const FACT_LINK = controlClass({
  shape: 'link',
  hoverInk: 'strong',
  className:
    // Top-aligned, or the link's 24px floor sits its label below the values beside it.
    'touch-hit-expand items-start text-body leading-body text-[color:var(--color-text-secondary)] underline underline-offset-2',
});

function ScreensSection() {
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
