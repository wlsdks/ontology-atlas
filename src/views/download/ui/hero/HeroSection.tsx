'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GITHUB_REPO_URL } from '@/shared/config/site/social-links';
import { cn } from '@/shared/lib/cn';
import { useMotionPaused } from '@/shared/motion/motion-pause';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { controlClass } from '@/shared/ui/control-class';
import { MotionToggle } from '@/shared/ui/controls/motion-toggle';
import { BrandCompanion } from '@/shared/ui/marks/moru/brand-companion';
import { GithubMark } from '@/shared/ui/marks/service-marks/github-mark';
import { MACOS_RELEASE, type MacosReleaseAsset, type WindowsReleaseAsset } from '../../lib/release/release-state';
import { DownloadActions } from '../release/DownloadActions';
import { FactsStrip } from '../release/FactsStrip';
import { TrustLine } from '../release/TrustLine';
import { DemoStage } from './DemoStage';
import { HeroTypewriter, heroSentence } from './HeroTypewriter';
import { MoruPlayEntry } from './MoruPlayEntry';

/**
 * On a touchscreen the chips keep their size and their hit boxes reach the 44px finger floor; the
 * row's gap grows to 14px there, so the stacked boxes meet instead of overlapping.
 */
const HERO_CHIP =
  'touch-hit-expand gap-2 rounded-chip border border-[color:var(--color-border-strong)] px-3.5 py-1.5 text-label leading-label';

/**
 * Every entrance delay lives in CSS; JS adds one `is-in` class after mount. One headline line per
 * sentence at every width, so it measures against the full column.
 */
export function HeroSection({
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary: heroWindowsPrimary,
  fileWins,
  handheld,
}: {
  published: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsInstaller: WindowsReleaseAsset | null;
  windowsPrimary: boolean;
  fileWins: boolean;
  handheld: boolean;
}) {
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
          <div className={cn(rise('gateway-t240'), 'gateway-hero-chip flex w-fit max-w-full flex-wrap gap-2 pointer-coarse:gap-3.5')}>
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
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]" />
                <span>{t('news', { tag: MACOS_RELEASE.tag })}</span>
              </Link>
            ) : null}
            <MotionToggle labels={{ pause: t('motion.pause'), play: t('motion.play') }} testId="gateway-motion-toggle" className={HERO_CHIP} />
          </div>

          <h1
            aria-label={heroSentence(heroLines)}
            className="gateway-hero-title mt-7 w-fit break-keep [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
          >
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
