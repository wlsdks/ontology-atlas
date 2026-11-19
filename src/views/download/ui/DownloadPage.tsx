'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { AtlasSymbol } from '@/shared/ui/marks/brand-mark';
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
import type { StageGraph } from '../lib/stage-graph';
import { GatewayFx } from './GatewayFx';
import { ScreensStage } from './ScreensStage';
import { StartSection } from './StartSection';
import { FaqSection } from './FaqSection';
import { OpenSourceSection } from './OpenSourceSection';
import { BuildWithMoru } from './BuildWithMoru';
import { FilmSection } from './FilmSection';
import { HarnessFilm } from './HarnessFilm';
import { MotionToggle } from '@/shared/ui/controls/motion-toggle';
import { useMotionPaused } from '@/shared/motion/motion-pause';
import { SectionIntro } from './SectionIntro';
import { ClosingContact } from './ClosingContact';
import { MoruPlayEntry } from './MoruPlayEntry';
import { ClosingMap } from './ClosingMap';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';
import { useSectionPull } from '../lib/use-section-pull';

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

/** On a touchscreen the chips grow to the 44px finger floor; they stack, so a wider hit box would overlap. */
const HERO_CHIP =
  'atlas-touch-floor gap-2 rounded-chip border border-[color:var(--color-border-strong)] px-3.5 py-1.5 text-label leading-label';

/**
 * Serves /download and /: a hero on its own clock, then sections whose scroll entrances
 * (`animation-timeline: view()`) do not exist under reduced motion
 * (`tests/contract/motion/reduced-motion-equivalent.contract.test.ts`).
 */
export function DownloadPage() {
  const pathname = usePathname() ?? '/';
  const tFooter = useTranslations('footer');
  const tMotion = useTranslations('download.motion');
  const motionLabels = { pause: tMotion('pause'), play: tMotion('play') };
  const published = isMacosReleasePublished();
  const primaryAsset = published ? macosAssetFor('aarch64') : null;
  /** The tab bar's own function: `/` shows the bar and `/download` hides it, and two lists drift. */
  const bottomTabBarPresent = !shouldHideBottomTabBar(pathname, false);
  const graph = useStageGraph();
  useSectionPull();
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
          handheld={visitorPlatform === 'handheld'}
        />
        <FilmSection graph={graph} />
        <BuildWithMoru handheld={visitorPlatform === 'handheld'} />
        <HarnessFilm />
        <ScreensSection />
        <StartSection graph={graph} />
        <OpenSourceSection />
        <FaqSection />
        <ClosingSection
          graph={graph}
          published={published}
          primaryAsset={primaryAsset}
          windowsInstaller={windowsInstaller}
          windowsPrimary={windowsPrimary}
          fileWins={winner === 'file' && published && primaryAsset !== null}
          handheld={visitorPlatform === 'handheld'}
        />

        <div
          data-testid="download-bottom-band"
          data-gateway-bottom-reserve-token={
            bottomTabBarPresent ? '--topology-mobile-bottom-tab-reserve' : undefined
          }
          data-gateway-bottom-reserve-active={bottomTabBarPresent ? 'true' : undefined}
          className={cn(
            PAGE_GUTTER,
            // The closing's map and maker's line already end the page; the colophon follows closely.
            'mt-16 sm:mt-24',
            'shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={cn(PAGE_COLUMN, '@container')}>
            {/*
              A colophon on the closing's grid: who made the page and the legal line under the name,
              the license, stack and motion control in the map's column.
            */}
            <footer className="border-t border-[color:var(--color-divider)] pt-8 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <GatewayReadingLinks className="mb-6" />
              <div className="grid min-w-0 gap-x-12 gap-y-6 @min-[52rem]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div className="min-w-0">
                  <p className="flex items-center gap-2.5 text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                    <AtlasSymbol size={20} alt="" aria-hidden="true" className="size-5 shrink-0" />
                    Ontology Atlas
                  </p>
                  {/* Nominative use; marks follow the stricter rule in docs/features/agents.md. */}
                  <p className="mt-3 max-w-[var(--measure-doc-column)] break-keep">{tFooter('trademarks')}</p>
                </div>
                <div className="flex min-w-0 flex-col items-start gap-3">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[color:var(--color-text-tertiary)]">
                    <span className="font-mono uppercase tracking-[var(--tracking-caps-14)]">{tFooter('license')}</span>
                    <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                      ·
                    </span>
                    <a
                      href={THIRD_PARTY_LICENSES_HREF}
                      data-testid="download-footer-third-party-licenses"
                      className={cn(controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' }), 'touch-hit-expand')}
                    >
                      {tFooter('thirdPartyLicenses')}
                    </a>
                  </p>
                  <p className="font-mono">{tFooter('stack')}</p>
                  <MotionToggle labels={motionLabels} testId="gateway-footer-motion-toggle" className="touch-hit-expand gap-1.5" />
                </div>
              </div>
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
  handheld,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  winner: 'file' | 'web';
  handheld: boolean;
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
  const motionPaused = useMotionPaused();

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
        One column on a narrow window: Moru beside the chips, the claim, the app. From 80rem the
        claim takes the left and the app the right, where Moru walks along the window's top edge
        (`.gateway-hero-grid`).
      */}
      <div className={cn(PAGE_COLUMN, 'gateway-hero-grid relative min-w-0')}>
        <div className={cn(rise('gateway-t240'), 'gateway-hero-moru flex justify-center')}>
          <BrandCompanion
            context="welcome"
            stilled={motionPaused}
            labels={{
              pause: moru('pause'),
              resume: moru('resume'),
              still: moru('still'),
              interact: moru('interact'),
            }}
          />
        </div>

        {/* From 80rem a container, so the headline is sized against this column, one line per sentence. */}
        <div className="gateway-hero-text relative z-[1] min-w-0 text-center min-[80rem]:text-left">
          <div className={cn(rise('gateway-t240'), 'gateway-hero-chip flex w-fit max-w-full flex-wrap gap-2')}>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="gateway-hero-source"
              className={cn(controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' }), HERO_CHIP)}
            >
              <GithubMark />
              <span>{t('eyebrow')}</span>
            </a>
            {published ? (
              <Link
                href="/changelog"
                data-testid="gateway-hero-news"
                className={cn(controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' }), HERO_CHIP)}
              >
                {/* Static: the release is a fact, not a state that changes while the page is open. */}
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]" />
                <span>{t('news', { tag: MACOS_RELEASE.tag })}</span>
              </Link>
            ) : null}
            <MotionToggle labels={{ pause: t('motion.pause'), play: t('motion.play') }} testId="gateway-motion-toggle" className={HERO_CHIP} />
          </div>

          <h1
            // The visible characters are aria-hidden.
            aria-label={heroSentence(heroLines)}
            className="gateway-hero-title mt-7 w-fit break-keep [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
          >
            {/* The first line is a step down in ink: the second line is the sentence's subject. */}
            <HeroTypewriter start={heroIn} lines={heroLines} />
          </h1>

          {/* 48rem holds the three controls on one row in every language (English 755px) from 1040. */}
          <div
            data-hero-text
            className="mt-7 flex min-w-0 max-w-[48rem] flex-col items-center min-[80rem]:items-start"
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
              handheld={handheld}
            />

            {/* Secondary to the download: a tiny Moru says who it is and opens its game. */}
            <div className={cn(rise('gateway-t400'), 'mt-6')}>
              <MoruPlayEntry />
            </div>
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
        handheld={handheld}
      />
    </section>
  );
}

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

/** Below `sm` the actions stack at the column's width, one thumb-sized target per row. */
const ACTIONS_STACK = 'max-sm:w-full max-sm:flex-col max-sm:items-stretch';

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
  /** The hero's 26rem column holds both outlined controls on one row at the compact padding. */
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
          {/* With no file to offer (a phone, or nothing published), the source is the other way in. */}
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

/** A phone is offered the browser map, so its line names that, not the installer's malware check. */
function TrustLine({
  testId,
  className,
  windowsPrimary,
  handheld,
}: {
  testId: string;
  className?: string;
  windowsPrimary: boolean;
  handheld: boolean;
}) {
  const t = useTranslations('download');
  return (
    <p
      data-testid={testId}
      className={cn('break-keep text-body leading-body text-[color:var(--color-text-tertiary)]', className)}
    >
      {handheld ? t('trustLineHandheld') : windowsPrimary ? t('trustLineWindows') : t('trustLine')}
    </p>
  );
}

function ClosingSection({
  graph,
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary,
  fileWins,
  handheld,
}: {
  graph: StageGraph;
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  fileWins: boolean;
  handheld: boolean;
}) {
  const t = useTranslations('download');
  return (
    <section
      data-testid="gateway-closing"
      aria-labelledby="gateway-closing-title"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full overflow-x-clip')}
    >
      <div className={cn(PAGE_COLUMN, '@container min-w-0 border-t border-[color:var(--color-divider)] pt-16 sm:pt-20')}>
        {/*
          The words and the maker's line on the left, the film's finished map on the right across
          both rows, where it runs past the column to 2rem from the window's edge as the hero's
          app window does; stacked, the map sits between the facts and the maker's line.
        */}
        <div className="grid min-w-0 gap-x-12 gap-y-8 @min-[52rem]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @min-[52rem]:gap-y-12">
          <div className="min-w-0">
            <h2
              id="gateway-closing-title"
              className="max-w-full pb-[0.08em] [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
            >
              {t('closingTitle')}
            </h2>
            <DownloadActions
              scope="closing"
              className="mt-10 justify-start"
              fileWins={fileWins}
              primaryAsset={primaryAsset}
              windowsInstaller={windowsInstaller}
              windowsPrimary={windowsPrimary}
            />
            <TrustLine
              testId="gateway-closing-trust"
              className="mt-5 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
              windowsPrimary={windowsPrimary}
              handheld={handheld}
            />
            <FactsStrip
              scope="gateway-closing"
              row
              className="mt-8"
              published={published}
              primaryAsset={primaryAsset}
              windowsAsset={windowsInstaller}
              windowsPrimary={windowsPrimary}
              sizeOnCta={fileWins}
              heroIn
              handheld={handheld}
            />
          </div>
          <div className="relative min-w-0 @min-[52rem]:col-start-2 @min-[52rem]:row-span-2 @min-[52rem]:row-start-1 @min-[52rem]:min-h-[30rem]">
            <ClosingMap
              graph={graph}
              className="aspect-square w-full @min-[52rem]:absolute @min-[52rem]:-inset-y-10 @min-[52rem]:left-0 @min-[52rem]:right-[calc(2rem-var(--gateway-origin))] @min-[52rem]:aspect-auto @min-[52rem]:w-auto"
            />
          </div>
          <ClosingContact className="@min-[52rem]:col-start-1 @min-[52rem]:row-start-2 @min-[52rem]:self-end" />
        </div>
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
  /** One wrapping row in sans under the closing's trust line, with no rule of its own. */
  row?: boolean;
  className?: string;
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsAsset: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  sizeOnCta: boolean;
  heroIn: boolean;
  /** A phone cannot install the file, so its size and checksum are noise there. */
  handheld: boolean;
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
  if (published && subject && !handheld) {
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
