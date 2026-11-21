'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { controlClass } from '@/shared/ui/control-class';
import { AtlasSymbol } from '@/shared/ui/marks/brand-mark';
import { MotionToggle } from '@/shared/ui/controls/motion-toggle';
import { chooseDownload } from '../lib/release/download-choice';
import { isMacosReleasePublished, macosAssetFor, windowsAsset } from '../lib/release/release-state';
import { useVisitorDesktopPlatform } from '../lib/release/visitor-platform';
import { useSectionPull } from '../lib/page-motion/use-section-pull';
import { useStageGraph } from '../lib/use-stage-graph';
import { BuildWithMoru } from './build-with-moru/BuildWithMoru';
import { ClosingSection } from './ClosingSection';
import { FaqSection } from './FaqSection';
import { FilmSection } from './film/FilmSection';
import { HarnessFilm } from './film/HarnessFilm';
import { GatewayFx } from './GatewayFx';
import { HeroSection } from './hero/HeroSection';
import { OpenSourceSection } from './OpenSourceSection';
import { ScreensSection } from './ScreensSection';
import { StartSection } from './StartSection';

const THIRD_PARTY_LICENSES_HREF = withBasePath('/third-party-licenses.txt');

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
  const { windowsPrimary, fileWins } = chooseDownload({ published, primaryAsset, windowsInstaller, visitorPlatform });

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
          fileWins={fileWins}
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
          fileWins={fileWins}
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
            'mt-16 sm:mt-24',
            'shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={cn(PAGE_COLUMN, '@container')}>
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
