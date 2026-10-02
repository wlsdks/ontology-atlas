'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveDisplayReleaseTag } from '../lib/pending-release-tag';
import { Link, usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { withBasePath } from '@/shared/lib/base-path';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { DemoStage } from './DemoStage';
import { availableDemoClips } from '../model/demo-clips';
import { HeroTypewriter, heroSentence } from './HeroTypewriter';
import { EvidenceSpecimen, type EvidenceDemoKey } from './EvidenceSpecimen';
import { CountUp } from './CountUp';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';
import { buttonVariants } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS, RELEASE_VERSION } from '../lib/release-facts';
import {
  MACOS_RELEASE,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  windowsAsset,
} from '../lib/release-state';
import { StageMap, useStageGraph, type StageScriptedFocus } from './StageMap';
import { GatewayFx } from './GatewayFx';
import { HeroAtlas } from './HeroAtlas';
import { HeroMacMenu } from './HeroMacMenu';
import { ScreensStage } from './ScreensStage';
import { AcpChatScene } from './AcpChatScene';
import { useInViewOnce } from '../lib/use-in-view-once';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';
import type { StageGraph } from '../lib/stage-graph';

/**
 * One grid: every section's content sits in `PAGE_GUTTER` + `PAGE_COLUMN`, starting at
 * max(--gateway-gutter, (viewport − --gateway-page-max) / 2), the --gateway-origin
 * (`shared/lib/gateway-frame.ts`, `tests/e2e/download-gateway-grid.spec.ts`).
 */

const SECTION_GAP = 'mt-[var(--gateway-section-gap)]';
const THIRD_PARTY_LICENSES_HREF = withBasePath('/third-party-licenses.txt');

/**
 * The CTA wraps below `sm`: its longest label overflows 320px, and neither "unsigned" nor the
 * file's name may be cut (`.claude/rules/surfaces.md`). Left-aligned, or a two-line wrap splits
 * the icon from the text.
 */
const HERO_CTA_WRAP = 'min-w-0 whitespace-normal text-left sm:whitespace-nowrap';

/**
 * Serves /download and / (`docs/DECISIONS.md` 2026-08-18): a hero on its own clock, then sections
 * whose scroll entrances (`animation-timeline: view()`) do not exist under reduced motion
 * (`tests/contract/reduced-motion-equivalent.contract.test.ts`). The install section went on
 * purpose (`docs/DECISIONS.md` 2026-08-19); the facts strip and closing band still carry the checksum.
 */
export function DownloadPage() {
  const pathname = usePathname() ?? '/';
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  const primaryAsset = published ? macosAssetFor('aarch64') : null;
  /** The tab bar's own function: `/` shows the bar and `/download` hides it, and two lists drift. */
  const bottomTabBarPresent = !shouldHideBottomTabBar(pathname, false);
  /** One graph for the hero, the map and the caption, so the numbers and the drawing agree. */
  const graph = useStageGraph();
  /** Decided once for the CTA, trust line, facts strip and closing band, or they disagree. */
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
          graph={graph}
        />
        <DemoSection />
        <EvidenceSection graph={graph} />
        <ScreensSection />
        <AgentSection />

        <div
          data-testid="download-bottom-band"
          data-gateway-bottom-reserve-token={
            bottomTabBarPresent ? '--topology-mobile-bottom-tab-reserve' : undefined
          }
          data-gateway-bottom-reserve-active={bottomTabBarPresent ? 'true' : undefined}
          className={cn(
            PAGE_GUTTER,
            SECTION_GAP,
            'shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={PAGE_COLUMN}>
            <ClosingBand
              published={published}
              primaryAsset={primaryAsset}
              windowsInstaller={windowsInstaller}
              windowsPrimary={windowsPrimary}
              winner={winner}
            />
            <footer className="mt-14 border-t border-[color:var(--color-divider)] pt-5 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <GatewayReadingLinks />
              <ReleasePolicyNotes published={published} />
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

/** Every head starts at the origin; eyebrow words are localized, never an English label first. */
function SectionIntro({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  /* Still: only the stage below it moves, one entrance per section. */
  return (
    <>
      <p className="flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {/* Static: there is no state for it to signal. */}
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {eyebrow}
      </p>
      <h2 className="mt-4 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
        {title}
      </h2>
      {sub ? (
        <p className="mt-3 max-w-[40rem] text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">
          {sub}
        </p>
      ) : null}
    </>
  );
}

/**
 * Every entrance delay lives in CSS (`gateway-t***`); JS adds one `is-in` class after mount, and
 * the foreground is still afterwards. The headline is the owner's sentence verbatim, one line per
 * sentence at every width, so it measures against the full column.
 */
function HeroSection({
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary: heroWindowsPrimary,
  winner,
  graph,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  winner: 'file' | 'web';
  graph: StageGraph;
}) {
  const fileWins = winner === 'file' && published && primaryAsset !== null;
  const t = useTranslations('download');
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    // The frame after the still first paint; not a synchronous setState in the effect body.
    const id = requestAnimationFrame(() => setHeroIn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const [typing, setTyping] = useState({ typed: 0, total: 0 });
  const onTyping = useCallback((typed: number, total: number) => {
    setTyping((prev) => (prev.typed === typed && prev.total === total ? prev : { typed, total }));
  }, []);

  /**
   * Every branch keeps all four destinations reachable. Windows' unsigned status is stated before
   * pressing, in the trust line or beside a demoted label; this line and the closing band are the
   * only places it lives, so shortening the copy deletes the fact.
   */
  const releaseTag = published
    ? MACOS_RELEASE.tag
    : resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      });
  const rise = (extra: string) => cn('gateway-rise', extra, heroIn && 'is-in');

  const heroLines = [
    { text: t('heroTitleLine1'), className: 'text-[color:var(--color-text-secondary)]' },
    { text: t('heroTitleLine2') },
  ];

  return (
    /* As tall as its copy, not the viewport, or the fold holds an empty band instead of the demo. */
    <section
      data-testid="gateway-hero"
      className={cn(PAGE_GUTTER, 'relative flex w-full flex-col')}
    >
      {/* Behind the type at every width; the text stacks above it on `z-[1]`. */}
      <HeroAtlas graph={graph} typed={typing.typed} total={typing.total} />

      {/* Wrappers pass the pointer through, so the stage behind takes the hand wherever the type is not.
          The container sizes `--text-monument` against the full column, one line per sentence. */}
      <div className={cn(PAGE_COLUMN, '@container pointer-events-none relative z-[1] min-w-0 pt-12 md:pt-16')}>
        <p
          className={cn(
            rise('gateway-t240'),
            'pointer-events-auto flex w-fit flex-wrap items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]',
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
          <span>{releaseTag}</span>
          <span aria-hidden>·</span>
          <span>{t('eyebrow')}</span>
        </p>

        <h1
          // The visible characters are aria-hidden.
          aria-label={heroSentence(heroLines)}
          className={cn(
            'pointer-events-auto mt-6 w-fit break-keep text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]',
          )}
        >
          {/* The first line is a step down in ink: the second line is the sentence's subject. */}
          <HeroTypewriter start={heroIn} lines={heroLines} onProgress={onTyping} />
        </h1>
      </div>

      <div
        className={cn(
          PAGE_COLUMN,
          'pointer-events-none relative z-[1] min-w-0 pb-6 pt-7 min-[90rem]:pb-7',
        )}
      >
        {/* Wider than the lead's 40rem so the three English controls share one line at the split. */}
        <div className="pointer-events-auto min-w-0 max-w-[45rem]">
          <p
            className={cn(
              rise('gateway-t240'),
              'max-w-[40rem] break-keep text-title font-normal leading-title text-[color:var(--color-text-secondary)]',
            )}
          >
            {t('heroLead')}
          </p>

          {/* Three controls: the visitor's platform filled, the others outlined at the same height. */}
          <div className={cn(rise('gateway-t320'), 'mt-9 flex flex-wrap items-center gap-3')}>
            {fileWins ? (
              heroWindowsPrimary ? (
                <>
                  <a
                    href={windowsInstaller!.downloadUrl}
                    data-testid="gateway-hero-cta"
                    className={cn(buttonVariants({ size: 'lg' }), HERO_CTA_WRAP)}
                  >
                    <Download size={ICON_SIZE.lg} aria-hidden />
                    {t('windowsDownloadCta')}
                    <AssetSize bytes={windowsInstaller!.sizeBytes} onFill />
                  </a>
                  <HeroMacMenu variant="outline" testId="gateway-hero-mac" />
                </>
              ) : (
                <>
                  <HeroMacMenu variant="primary" testId="gateway-hero-cta" />
                  {windowsInstaller ? (
                    /* Needed before downloading, so the unsigned marker rides on the button. */
                    <a
                      href={windowsInstaller.downloadUrl}
                      data-testid="gateway-hero-windows"
                      className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'px-4 sm:px-6', HERO_CTA_WRAP)}
                    >
                      <Download size={ICON_SIZE.lg} aria-hidden />
                      {t('heroWindowsCta')}
                      <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                        {t('windowsUnsignedShort')}
                      </span>
                    </a>
                  ) : null}
                </>
              )
            ) : (
              <Link
                href="/topology"
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), HERO_CTA_WRAP)}
              >
                {t('webCta')}
              </Link>
            )}
            {/* The browser route is always open. */}
            {fileWins ? (
              <Link
                href="/topology"
                data-testid="gateway-hero-web-cta"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'px-4 sm:px-6', HERO_CTA_WRAP)}
              >
                {t('heroPlaygroundCta')}
              </Link>
            ) : null}
          </div>

          <p
            data-testid="gateway-hero-trust"
            className={cn(
              rise('gateway-t400'),
              'mt-5 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]',
            )}
          >
            {/* The fact needed before pressing, about the winning file. */}
            {heroWindowsPrimary ? t('trustLineWindows') : t('trustLine')}
          </p>
        </div>

      </div>

      <FactsStrip
        className="relative z-[1]"
        published={published}
        primaryAsset={primaryAsset}
        windowsAsset={windowsInstaller}
        windowsPrimary={heroWindowsPrimary}
        heroIn={heroIn}
      />
      {/* Below the split the plane draws in this plinth under the strip; no graph, no plinth. */}
      {graph.nodes.length > 0 ? (
        <div
          aria-hidden
          data-testid="gateway-hero-plinth"
          // Follows the plane's height, or a phone scrolls through empty space.
          className="h-[clamp(0rem,62vw,22rem)] min-[90rem]:hidden"
        />
      ) : null}
    </section>
  );
}

/**
 * Release facts for the file the CTA points at, taking the page's one platform decision, or a
 * visitor checks another file's checksum. Unpublished, size and checksum rows do not exist.
 */
function FactsStrip({
  className,
  published,
  primaryAsset,
  windowsAsset: windowsInstaller,
  windowsPrimary,
  heroIn,
}: {
  className?: string;
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsAsset: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
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
  const facts: { label: string; value: string; code?: boolean }[] = [
    { label: t('factVersionLabel'), value: version },
    {
      label: t('factRequiresLabel'),
      value: `${subjectIsWindows ? RELEASE_MIN_WINDOWS : RELEASE_MIN_MACOS}${t('factMinOsSuffix')}`,
    },
  ];
  if (published && subject) {
    facts.push({
      label: subjectIsWindows ? 'EXE' : 'DMG',
      value: formatAssetSize(subject.sizeBytes),
    });
    facts.push({
      label: 'SHA-256',
      value: `${subject.sha256.slice(0, 8)}…${subject.sha256.slice(-8)}`,
      code: true,
    });
  }

  const tag = published
    ? MACOS_RELEASE.tag
    : resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      });
  /** Links, not facts, so they take the link grammar instead of the engraved face. */
  const links = [
    {
      label: t('factChangelogLabel'),
      text: t('factChangelogValue', { tag }),
      href: '/changelog' as const,
      external: false,
      testId: 'gateway-facts-changelog',
      code: false,
    },
    {
      label: t('factSourceLabel'),
      text: t('factSourceValue'),
      href: GITHUB_REPO_URL,
      external: true,
      testId: 'gateway-facts-source',
      // A path, so mono.
      code: true,
    },
  ];

  return (
    <div className={cn('gateway-rise gateway-t400', heroIn && 'is-in', 'w-full', className)}>
      {/* One line when all six fit; otherwise one subgrid of equal columns that fill the width, so
          every row shares a start line. A container query, since the column decides the fit. 54rem:
          four equal columns hold the widest fact (the Korean requirements value, 173px). */}
      <div
        data-testid="gateway-facts"
        className={cn(
          PAGE_COLUMN,
          '@container/gateway-facts border-t border-[color:var(--color-border-soft)] py-5',
        )}
      >
        <div className="grid grid-cols-1 gap-x-12 gap-y-4 @min-[21rem]/gateway-facts:grid-cols-2 @min-[54rem]/gateway-facts:grid-cols-[repeat(4,minmax(0,1fr))] @min-[66rem]/gateway-facts:flex">
        <dl className="col-span-full grid min-w-0 grid-cols-subgrid gap-y-4 @min-[66rem]/gateway-facts:flex @min-[66rem]/gateway-facts:gap-x-12">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className={FACT_LABEL}>{fact.label}</dt>
              <dd
                data-token="engraved-numeral"
                className={cn(
                  'mt-1 text-body leading-body tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]',
                  fact.code && 'font-mono',
                )}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="col-span-full grid min-w-0 grid-cols-subgrid gap-y-4 @min-[66rem]/gateway-facts:ml-auto @min-[66rem]/gateway-facts:flex @min-[66rem]/gateway-facts:gap-x-12">
          {links.map((link) => (
            <div key={link.label} className="min-w-0">
              <span className={cn(FACT_LABEL, 'block')}>{link.label}</span>
              <span className="mt-1 block">
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid={link.testId}
                    className={cn(FACT_LINK, link.code && 'font-mono')}
                  >
                    <span aria-hidden data-external-link-marker>
                      ↗
                    </span>
                    {link.text}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    data-testid={link.testId}
                    className={cn(FACT_LINK, link.code && 'font-mono')}
                  >
                    {link.text}
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

const FACT_LABEL =
  'font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]';

/** The same underline and ink as the evidence section's file link. */
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
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <ScreensStage intro={<SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />} />
      </div>
    </section>
  );
}

function DemoSection() {
  const t = useTranslations('download');
  const hasClip = availableDemoClips().length > 0;

  return (
    <section
      id="demo"
      data-testid="gateway-demo-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      {/* The stage is narrower than the column, so from 90rem the head stands beside it instead of centring. `pb-9` discounts the caption. */}
      <div
        className={cn(
          PAGE_COLUMN,
          'min-w-0 min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_minmax(0,var(--gateway-stage-max))] min-[90rem]:gap-12',
        )}
      >
        <div data-testid="gateway-demo-head" className="min-w-0 min-[90rem]:self-center min-[90rem]:pb-9">
          <SectionIntro eyebrow={t('demoEyebrow')} title={t('demoTitle')} sub={t('demoSub')} />
          {hasClip ? <DemoPrompt text={t('demoAgentPrompt')} label={t('demoPromptLabel')} /> : null}
        </div>
        <div className="gateway-scroll-stage mt-9 min-w-0 min-[90rem]:mt-0">
          <DemoStage />
        </div>
      </div>
    </section>
  );
}

/**
 * The request the take was filmed on (`docs/launch/demo-scenario.md` §3), so a visitor can read
 * what the agent answers. The chat scene's user-bubble shape: it is what a person typed.
 */
function DemoPrompt({ text, label }: { text: string; label: string }) {
  return (
    <figure data-testid="gateway-demo-prompt" className="mt-7 min-w-0 max-w-[40rem]">
      <figcaption className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">
        {label}
      </figcaption>
      <blockquote className="mt-1.5 break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-body leading-body text-[color:var(--color-text-secondary)]">
        {text.split('`').map((part, i) =>
          i % 2 === 1 ? (
            <code key={i} className="break-words font-mono text-[color:var(--color-text-primary)] sm:whitespace-nowrap">
              {part}
            </code>
          ) : (
            part
          ),
        )}
      </blockquote>
    </figure>
  );
}

/**
 * Three beats, each a file line paired with what it is on the live map, using the generator's
 * node ids. Slower than the chat scene's rhythm: the eye travels between two panels.
 */
const DEMO_SCRIPT: readonly { focus: StageScriptedFocus; line: EvidenceDemoKey }[] = [
  {
    focus: { selectedSlug: EVIDENCE_SPECIMEN.facts.name.nodeId, emphasizedSlug: null },
    line: 'title',
  },
  {
    focus: {
      selectedSlug: EVIDENCE_SPECIMEN.facts.name.nodeId,
      emphasizedSlug: EVIDENCE_SPECIMEN.facts.domain.nodeId,
    },
    line: 'domain',
  },
  {
    focus: {
      selectedSlug: EVIDENCE_SPECIMEN.facts.name.nodeId,
      emphasizedSlug: EVIDENCE_SPECIMEN.facts.dependency.nodeId,
    },
    line: 'dependencies',
  },
];
const DEMO_START_MS = 900;
const DEMO_BEAT_MS = 1700;

/** The live map, whose census caption arrives once assembly settles: the numbers are its result. */
function EvidenceSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.25);
  const [captionIn, setCaptionIn] = useState(false);
  /** −1 is idle or finished. */
  const [demoStep, setDemoStep] = useState(-1);
  /** The demo never replays after a pointer act or one full run. */
  const demoDoneRef = useRef(false);

  useEffect(() => {
    if (!inView) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => setCaptionIn(true), reduced ? 0 : 1400);
    return () => window.clearTimeout(id);
  }, [inView]);

  /** Waits for the caption; never under reduced motion, where the resting section says everything. */
  useEffect(() => {
    if (!captionIn || demoDoneRef.current) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const timers: number[] = [];
    DEMO_SCRIPT.forEach((_, i) => {
      timers.push(window.setTimeout(() => setDemoStep(i), DEMO_START_MS + i * DEMO_BEAT_MS));
    });
    timers.push(
      window.setTimeout(() => {
        demoDoneRef.current = true;
        setDemoStep(-1);
      }, DEMO_START_MS + DEMO_SCRIPT.length * DEMO_BEAT_MS),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [captionIn]);

  const cancelDemo = useCallback(() => {
    demoDoneRef.current = true;
    setDemoStep(-1);
  }, []);

  const beat = demoStep >= 0 ? DEMO_SCRIPT[demoStep] : null;

  return (
    <section
      id="evidence"
      data-testid="gateway-evidence-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro
          eyebrow={t('evidenceEyebrow')}
          title={t('evidenceTitle')}
          sub={t('evidenceSub')}
        />

        {/* From `xl` the file is a card inside the map frame, and `--map-safe-inset-right` fits the graph left of it. */}
        <div ref={ref} className="gateway-scroll-stage relative mt-9 min-w-0">
          <div
            data-testid="download-stage-map-frame"
            className="relative h-[24rem] min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] md:h-[30rem] lg:h-[40rem]"
          >
            <StageMap graph={graph} scripted={beat?.focus ?? null} onUserInteract={cancelDemo} />
          </div>
          <aside
            data-testid="download-evidence-card"
            className="mt-6 min-w-0 xl:absolute xl:inset-y-5 xl:right-5 xl:mt-0 xl:w-[22rem] xl:overflow-y-auto xl:rounded-panel xl:border xl:border-[color:var(--color-border-soft)] xl:bg-[color:var(--color-elevated)] xl:p-5 xl:shadow-[var(--shadow-elevation-1)]"
          >
            <EvidenceSpecimen demoKey={beat?.line ?? null} />
          </aside>
        </div>

        <p
          data-testid="download-portrait-caption"
          className={cn('gateway-map-after', captionIn && 'is-in', 'pointer-events-none mt-5')}
        >
          {/* Mono only for data; Hangul in the mono face reads as a printout. */}
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption leading-caption text-[color:var(--color-text-tertiary)]">
            <span className="font-mono text-[color:var(--color-text-quaternary)]">docs/ontology</span>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <span
              data-token="engraved-numeral"
              className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {t.rich('portraitCensus', {
                concepts: graph.nodes.length,
                relations: graph.edges.length,
                c: () => (
                  <span className="font-mono">
                    <CountUp value={graph.nodes.length} />
                  </span>
                ),
                r: () => (
                  <span className="font-mono">
                    <CountUp value={graph.edges.length} />
                  </span>
                ),
              })}
            </span>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <span className="min-w-0 break-keep text-[color:var(--color-text-secondary)]">
              {t('portraitHint')}
            </span>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <span className="min-w-0 break-keep">{t('portraitScope')}</span>
          </span>
        </p>
      </div>
    </section>
  );
}

/**
 * A guarded agent lives inside the app; others connect through MCP (see `CHAT_ELIGIBLE` in
 * the file src-tauri/src/acp.rs). Copy follows `docs/DECISIONS.md` 2026-08-16 (5): nothing redistributed,
 * registry names only, never implying we provide model access.
 */
function AgentSection() {
  const t = useTranslations('download');

  const columns = [
    { title: t('col1Title'), body: t('col1Body'), code: t('col1Code') },
    { title: t('col2Title'), body: t('col2Body'), code: t('col2Code') },
    { title: t('col3Title'), body: t('col3Body'), code: 'git diff docs/ontology/', command: true },
  ];

  return (
    <section
      id="agents"
      data-testid="gateway-agents-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      {/* Head and scene left, cards right from 90rem, so both columns are one height class; narrower tracks broke the chat lines. */}
      <div
        className={cn(
          PAGE_COLUMN,
          'grid min-w-0 gap-y-10 min-[90rem]:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] min-[90rem]:gap-x-12',
        )}
      >
        <div className="min-w-0">
          <SectionIntro eyebrow={t('agentsEyebrow')} title={t('agentsTitle')} sub={t('agentsSub')} />
          <div data-testid="gateway-agent-scene" className="gateway-scroll-stage mt-9 min-w-0">
            <AcpChatScene />
          </div>
        </div>
        {/* Still: one moving thing per section. */}
        <div className="grid min-w-0 content-start">
          {columns.map((column, i) => (
            <div
              key={column.title}
              className={cn(
                'min-w-0 py-6 first:pt-0 last:pb-0',
                i > 0 && 'border-t border-[color:var(--color-border-soft)]',
              )}
            >
              <h3 className="break-keep text-title font-[var(--font-weight-emphasis)] leading-title text-[color:var(--color-text-primary)]">
                {column.title}
              </h3>
              <p className="mt-2.5 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                {column.body}
              </p>
              <AgentFactRow text={column.code} command={column.command} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Wraps only between facts, each an unbreakable run; only a literal command is mono. */
function AgentFactRow({ text, command = false }: { text: string; command?: boolean }) {
  const rowClass =
    'mt-4 flex flex-wrap gap-x-2 break-keep border-l border-[color:var(--color-border-strong)] pl-3 text-body leading-body text-[color:var(--color-text-tertiary)]';
  if (command) return <code className={cn(rowClass, 'font-mono')}>{text}</code>;
  return (
    <p className={rowClass}>
      {text.split(' · ').map((part, i) => (
        // Position is identity in a fixed sentence; equal facts still get distinct keys.
        <span key={i} className="whitespace-nowrap">
          {i > 0 ? <span className="mr-2 text-[color:var(--color-text-quaternary)]">·</span> : null}
          {part}
        </span>
      ))}
    </p>
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

/**
 * The winner's file again at the foot, outlined since the hero holds the one filled control,
 * with the verification command and hash for that same file. Unpublished, only the browser route.
 */
function ClosingBand({
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary,
  winner,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  windowsInstaller: ReturnType<typeof windowsAsset>;
  windowsPrimary: boolean;
  winner: 'file' | 'web';
}) {
  const t = useTranslations('download');
  const subject =
    winner === 'file' ? (windowsPrimary && windowsInstaller ? windowsInstaller : primaryAsset) : null;
  const subjectIsWindows = subject !== null && subject === windowsInstaller;
  const fileName = subject ? subject.downloadUrl.slice(subject.downloadUrl.lastIndexOf('/') + 1) : '';
  const format = useFormatter();
  const publishedAt = macosPublishedDate();
  /** The strip's facts again, beside the file they describe. */
  const versionLine = [
    published
      ? MACOS_RELEASE.tag
      : resolveDisplayReleaseTag({
          published: false,
          publishedTag: MACOS_RELEASE.tag,
          releaseVersion: RELEASE_VERSION,
        }),
    published && publishedAt
      ? format.dateTime(publishedAt, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      : null,
    `${subjectIsWindows ? RELEASE_MIN_WINDOWS : RELEASE_MIN_MACOS}${t('factMinOsSuffix')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      data-testid="download-closing-band"
      className="grid min-w-0 gap-10 border-t border-[color:var(--color-border-soft)] pt-10 lg:grid-cols-2 lg:gap-12"
    >
      <div className="min-w-0">
        <p className={FACT_LABEL}>{t('downloadSectionLabel')}</p>
        <p
          data-token="engraved-numeral"
          className="mt-2 text-body leading-body tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
        >
          {versionLine}
        </p>
        <div className="mt-5">
          {published && subject ? (
            <a
              href={subject.downloadUrl}
              data-testid="download-closing-cta"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), HERO_CTA_WRAP)}
            >
              <Download size={ICON_SIZE.lg} aria-hidden />
              {subjectIsWindows ? t('windowsDownloadCta') : t('primaryCtaPublished')}
              <AssetSize bytes={subject.sizeBytes} />
            </a>
          ) : (
            <Link
              href="/topology"
              data-testid="download-closing-cta"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), HERO_CTA_WRAP)}
            >
              {t('webCta')}
            </Link>
          )}
        </div>
        <p className="mt-4 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {subjectIsWindows ? t('trustLineWindows') : t('trustLine')}
        </p>
      </div>

      {published && subject ? (
        <div className="min-w-0">
          <p className={FACT_LABEL}>{t('closingVerifyLabel')}</p>
          <p className="mt-2 max-w-[34rem] break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
            {t('closingVerifyBody')}
          </p>
          <code
            data-testid="download-closing-command"
            className="mt-4 block break-all border-l border-[color:var(--color-border-strong)] pl-3 font-mono text-body leading-body text-[color:var(--color-text-primary)]"
          >
            {subjectIsWindows
              ? t('trustVerifyCommandWindows', { file: fileName })
              : t('trustVerifyCommand', { file: fileName })}
          </code>
          <p className={cn(FACT_LABEL, 'mt-4')}>{t('closingShaLabel')}</p>
          <p
            data-testid="download-closing-sha"
            data-token="engraved-numeral"
            className="mt-1 break-all font-mono text-body leading-body text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {subject.sha256}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The page's only release-policy sentences, kept in the colophon since they are not decision material. */
function ReleasePolicyNotes({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <>
      <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {published
          ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
          : /* Unpublished, `MACOS_RELEASE.tag` is stale by definition. */
            t('trustPolicyPending', {
                tag: resolveDisplayReleaseTag({
                  published: false,
                  publishedTag: MACOS_RELEASE.tag,
                  releaseVersion: RELEASE_VERSION,
                }),
              })}
      </p>
      <p className="mt-2 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('windowsPolicy')}
      </p>
    </>
  );
}
