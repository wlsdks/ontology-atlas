'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveDisplayReleaseTag } from '../lib/pending-release-tag';
import { Link, usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { DemoStage } from './DemoStage';
import { HeroTypewriter, heroSentence } from './HeroTypewriter';
import { EvidenceSpecimen, type EvidenceDemoKey } from './EvidenceSpecimen';
import { CountUp } from './CountUp';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';
import { buttonVariants } from '@/shared/ui';
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
import { HeroObject } from './HeroObject';
import { AcpChatScene } from './AcpChatScene';
import { useInViewOnce } from '../lib/use-in-view-once';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';
import type { StageGraph } from '../lib/stage-graph';

/**
 * **This page's grid is one grid** (council verdict, 2026-07-29 — it survives the remake).
 *
 * Everything starts at one alignment origin and stops at `--gateway-page-max`. Five
 * elements, one x: GNB, headline, map section, caption, footer.
 *
 * ```
 * origin = max(--gateway-gutter, (viewport − --gateway-page-max) / 2)   ← --gateway-origin
 * ```
 *
 * The owner's report (*"The left and right must match"* — the left and right must match) and why `mx-auto`
 * was rejected live in the origin doc-blocks of `shared/lib/gateway-frame.ts` and
 * `app/globals.css`. This file's only job is seating every section's content inside
 * `PAGE_GUTTER` + `PAGE_COLUMN`. Gate: `tests/e2e/download-gateway-grid.spec.ts` reads the
 * origin live and measures equal side margins and resize tracking.
 *
 * [Retired 2026-08-18] The old camera reserve width (derived from
 * `--topology-v2-safe-inset-left`) was arithmetic from when the map was the background behind
 * the panel. Once the map moved down into its own (evidence) section the two became
 * structurally unable to overlap, and the derivation (`computeGatewaySafeInset`) and its
 * consumers were deleted.
 *
 * [Retired 2026-08-19] The install section (three steps, the panel, the verification rail)
 * disappeared entirely, taking with it the assertions that used the panel as their yardstick —
 * owner: *"The last one can go; it's all at the top anyway"* (the last one can go; it's
 * all at the top anyway). The hero carries all four destinations.
 */

/** Rhythm between sections — the value's source of truth is `--gateway-section-gap` (160px). */
const SECTION_GAP = 'mt-[var(--gateway-section-gap)]';

/**
 * `/download` — **the living screen** (owner-approved remake, 2026-08-18, `docs/DECISIONS.md`).
 *
 * ## This screen's job
 *
 * > A first-time visitor recognizes, within 30 seconds, the problem of «cognitive debt piling
 * > up while agents write the code» as their own problem, watches the product **move**, and
 * > downloads the file for their machine without getting lost.
 *
 * ## Four sections, one idea each (owner-confirmed skeleton, revised 2026-08-19)
 *
 * ① Hero — type (the monument headline, the owner's sentence verbatim) plus the hero object
 *    (a depth projection of the real graph) plus one filled CTA. The map was **pulled out** of
 *    the first screen (owner call) and returns to its own place in the evidence section.
 * ② Demo — plays itself once it enters the viewport, and the screen says honestly that the
 *    attached clip is provisional.
 * ③ Evidence — the real map engine assembles once in front of the viewer, and the census
 *    caption arrives after assembly finishes (the numbers are the *result* of assembly). The
 *    caption lives in the same section as the map.
 * ④ Agents — one measured round trip of the in-app conversation (ACP), plus three still cards
 *    (reworked 2026-08-18 — the old `mcp-verify` terminal was rejected by the owner).
 *
 * ## [Deleted 2026-08-19] ⑤ Install and download
 *
 * Owner: *"The last one can go; it's all at the top anyway"* (the last one can go; it's
 * all at the top anyway). The hero carries all four destinations (my platform, Intel, Windows,
 * browser), so the panel was asking the same decision a second time. Gone with it: the three
 * install steps, the download panel, and the verification rail — and the **four honesty facts**
 * that rail alone carried (SHA-256 checksum, Developer ID signature, notarization, "nothing is
 * sent to a server") are now nowhere on this page. The owner accepted that cost explicitly
 * (`docs/DECISIONS.md` 2026-08-19). Only two sentences of release policy remain, in the colophon.
 *
 * The motion discipline is "informational motion only" (owner: *"Motion matters on the download page, since showing is the best we can do"* — motion matters on the download page, since showing is the
 * best we can do). The effect layer (the current field, the grain, the cursor ring) is the
 * sealed `--gateway-fx-*` exception (see the `GatewayFx` doc-block).
 *
 * ## Two clocks — the first screen runs on time, everything below runs on scroll (2026-08-22)
 *
 * ① **The hero is owned by time.** The first-three-seconds choreography (150/220 headline →
 *    700 lead → 800 CTA → 950 facts strip) is unchanged. What changed is one trigger: the start
 *    frame moved into `@starting-style`, so **the first style computation** begins the
 *    choreography (it used to be a rAF after hydration). So a late or failed JS load no longer
 *    leaves the hero blank. It used to — measured, the first screenshot held only the GNB, and
 *    what stood behind it was 32 JS files, 2,572 KB decoded. The full story is in the
 *    `.gateway-rise` doc-block in `app/globals.css`.
 *
 * ② **The three sections below are owned by scroll.** Owner: *"We want smooth motion too, something nice as you scroll"* (we want smooth motion too, something nice as you
 *    scroll). With `animation-timeline: view()` the sole input to progress is how far the
 *    element has entered the scrollport — scroll slowly and it arrives slowly, stop and it
 *    stops. It uses neither rAF nor a scroll listener, so it adds not one frame to this page's
 *    single frame loop. `useInViewOnce` was **not removed** — it carries the same entrance in
 *    browsers without `view()` (two paths, one choreography).
 *
 * So "the foreground is permanently still after it appears" is still true. Nothing fades back
 * out or rewinds, and what has arrived stays put — only what *calls* the arrival differs per
 * section. Measured across three widths (1512, 834, 390) × 21 scroll positions: **zero** elements
 * fully inside the viewport and stuck faded.
 *
 * Under `prefers-reduced-motion: reduce` the scroll-choreography declarations **do not exist** —
 * the sections are fully visible from the start (measured: zero animations on those elements).
 * Contract: `tests/contract/reduced-motion-equivalent.contract.test.ts` turns red if those
 * declarations leak outside `no-preference`.
 */
/**
 * The hero's download CTA **wraps at 320px**.
 *
 * `buttonVariants` sets `whitespace-nowrap`, so a long label pushes the button through its
 * container. That is the right default — button text wrapping anywhere stops reading as a
 * control. The problem was that at the narrowest width the slack was zero: measured at 320px,
 * `en`, macOS fonts, "Download Windows x64 beta + unsigned" was 296px wide with overflow of
 * **exactly 0**. Zero is not passing, it is **waiting for the next pixel** — on Linux CI's font
 * stack the same label overflowed by 9px and the gate went red (2026-08-19).
 *
 * Three fixes were possible and two were rejected. ① Shorten the label — dropping "x64" or
 * "beta" blurs what file you get. ② Hide "unsigned" at narrow widths — that a build is unsigned
 * is something a visitor must know **before pressing** (the honest-degradation contract in
 * `.claude/rules/surfaces.md`), so a narrow screen cannot erase it. That leaves ③ **wrapping**:
 * a two-line button at 320px is not a flaw, and from `sm:` it is one line as before.
 *
 * `text-left` is required with it — a centred two-line wrap misaligns the left edges of icon and
 * text, and the label reads as two fragments.
 */
const HERO_CTA_WRAP = 'min-w-0 whitespace-normal text-left sm:whitespace-nowrap';

export function DownloadPage() {
  const pathname = usePathname() ?? '/';
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  // Apple Silicon is the default suggestion — nearly every Mac sold since late 2020 is one.
  const primaryAsset = published ? macosAssetFor('aarch64') : null;
  /**
   * Does the bottom tab bar stand on this screen? This view lives at two addresses and they
   * differ: `/download` hides the tab bar, `/` raises it. The verdict uses the same function as
   * the tab bar itself — each listing its own routes lets one side drift (measured 17px, 2026-08-06).
   */
  const bottomTabBarPresent = !shouldHideBottomTabBar(pathname, false);
  /**
   * One hook feeds the hero object, the evidence section's map, and the census caption — this
   * single line is the honesty contract that the numbers the screen claims and the graph it
   * draws are the same object (locked by `DownloadPage.test.tsx`).
   */
  const graph = useStageGraph();

  return (
    <div className="gateway-fx-stage relative flex min-h-full w-full flex-col">
      <GatewayFx />
      <GatewayNav />

      <main id="main" tabIndex={-1} className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <HeroSection published={published} primaryAsset={primaryAsset} graph={graph} />
        <DemoSection />
        <EvidenceSection graph={graph} />
        <AgentSection />

        {/*
         * **The bottom band** — the colophon. Only the reading links, the two release-policy
         * sentences, and the license live here (the verification list went with the install
         * section on 2026-08-19). The tab-bar reserve idiom is unchanged from before the
         * remake (only `/` raises a tab bar).
         */}
        <div
          data-testid="download-bottom-band"
          data-gateway-bottom-reserve-token={
            bottomTabBarPresent ? '--topology-mobile-bottom-tab-reserve' : undefined
          }
          data-gateway-bottom-reserve-active={bottomTabBarPresent ? 'true' : undefined}
          className={cn(
            PAGE_GUTTER,
            'mt-24 shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={PAGE_COLUMN}>
            <footer className="border-t border-[color:var(--color-divider)] pt-5 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <GatewayReadingLinks />
              <ReleasePolicyNotes published={published} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono uppercase tracking-[var(--tracking-caps-14)]">
                  {tFooter('license')}
                </span>
                <span aria-hidden>·</span>
                <span className="font-mono">{tFooter('stack')}</span>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Shared section parts ───────────────────────────────────────────────────

/**
 * Section head — eyebrow (mono caps plus an accent dot), title, subtitle.
 *
 * The title is `--text-display` (23px), correcting the hierarchy inversion where the old
 * section title (14px) was smaller than a card title (16px). The eyebrow labels (Demo,
 * Evidence, Agents, Install) are mono notation shared by both locales and are not translated.
 *
 * With `still` it renders without the entrance choreography — the install section's stillness
 * was its consumer.
 */
function SectionIntro({
  eyebrow,
  title,
  sub,
  inView,
  still = false,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  inView?: boolean;
  still?: boolean;
  /**
   * Centre the head on the same axis as the section's content.
   *
   * ⚠️ **This is a property of the section, not a preference of the head.** The demo section is
   * the page's one *stage* — a single object narrower than the column, with a caption — so it is
   * centred, and its head has to be centred with it or the section runs two axes. Every other
   * section fills its column and stays left. The 2026-08-23 defect was exactly this half-applied:
   * the stage was centred and its head was not (`docs/DECISIONS.md` 2026-08-23).
   */
  centered?: boolean;
}) {
  /**
   * A section head's entrance is **owned by scroll** (2026-08-22).
   *
   * Where `gateway-scroll-rise` applies, the `view()` timeline owns progress and `is-in` does
   * nothing (an animation beats a plain declaration). Where it does not apply, `is-in` carries
   * the entrance exactly as before — **which is why `useInViewOnce` was not removed.** They are
   * two paths of one choreography, not two choreographies.
   */
  const rise = (step?: string) =>
    still ? undefined : cn('gateway-rise', 'gateway-scroll-rise', step, inView && 'is-in');

  return (
    <>
      <p
        className={cn(
          rise(),
          'flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]',
          centered && 'justify-center',
        )}
      >
        {/* A static dot — a signal is a state, and there is no state here, so it does not blink. */}
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {eyebrow}
      </p>
      <h2
        className={cn(
          rise('gateway-rise-d2'),
          'mt-4 break-keep text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]',
          centered && 'text-center',
        )}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            rise('gateway-rise-d3'),
            'mt-3 max-w-[40rem] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]',
            centered && 'mx-auto text-center',
          )}
        >
          {sub}
        </p>
      ) : null}
    </>
  );
}

// ─── ① Hero — type, object, one filled CTA ──────────────────────────────────

/**
 * The first three seconds (owner-confirmed): 0–150ms the background paints in its still state →
 * 150/220ms the two headline lines rise from their own line boxes → 700ms eyebrow and lead →
 * 800ms CTA → 950ms trust line and instrument strip. After that the foreground is permanently
 * still. Every delay lives in CSS (`gateway-t***`); JS only adds one `is-in` class on the frame
 * after mount.
 *
 * ## The headline is the owner's sentence, verbatim — not one character is polished
 *
 * "Agents write the code / a person's cognitive debt piles up". The size is `--text-monument` (clamp 40px–96px) — with
 * the map out of the first screen, the type inherits that weight (ramp registration in
 * `app/globals.css` and `cn.ts`).
 *
 * ## Layout — a monument measure plus a split band (second revision of the approved mockup, 2026-08-18)
 *
 * Implementing the mockup's "headline left / object right" split with the headline inside the
 * column broke the monument when measured: at 1728 the text column was 800px against a Korean
 * line budget of 916/1009px — the two sentences split into four lines, leaving `write code` and
 * `piles up` stranded as rag lines. A monument is a monument only when **sentence = line**. So
 * the headline uses the full column as its measure (an `@container` wrapper declares it, and
 * `--text-monument`'s 4.8cqw sizes against that measure), and the split starts with the band
 * below it: lead, CTA, and trust line on the left, the hero object (a depth projection of the
 * real graph) as the right column. Below `lg` the object drops beneath the type as a plinth.
 */
function HeroSection({
  published,
  primaryAsset,
  graph,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  graph: StageGraph;
}) {
  const t = useTranslations('download');
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    // Inside a rAF callback, so this is not a synchronous setState in the effect body — the
    // choreography starts on the frame after the first paint (the still background).
    const id = requestAnimationFrame(() => setHeroIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * The hero CTA's four destinations (owner, 2026-08-18: *"There is no Windows download button and no web playground button.. I don't even know if 'see the demo first' is a button"* — there is no
   * Windows download button and no web playground button, and "see the demo first" does not even
   * read as a button):
   * ① get it for my platform (filled — the sole attention winner) ② see the demo first
   * (outline lg) ③ every other desktop file (outline md, one step down) ④ open in the browser
   * (outline md). Detection happens in one client place (`useVisitorDesktopPlatform`) and falls
   * back to macOS — every branch keeps all four destinations reachable.
   *
   * When Windows is the winner, the unsigned fact is stated **before pressing**, in the trust
   * line slot (`trustLineWindows`) — exactly the grammar by which a macOS visitor reads about
   * signing and notarization in the same slot. In the demoted version (the Windows button on the
   * second row) the `unsigned` marker beside the label does the same job. [2026-08-19] The
   * install section that carried the full warning text and the checksum was deleted, so this
   * trust line is now the **only** place that fact lives — shortening the copy here deletes the fact.
   */
  const visitorPlatform = useVisitorDesktopPlatform();
  const windowsInstaller = windowsAsset();
  const heroWindowsPrimary = visitorPlatform === 'windows' && windowsInstaller !== null;

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
    <section data-testid="gateway-hero" className={cn(PAGE_GUTTER, 'w-full')}>
      {/* The monument measure — the headline uses the full column as its measure. `@container`
          declares that measure and `--text-monument` (4.8cqw) sizes against it, so both sentences
          stay on one line each at every width of the split hero (the budget arithmetic is in the
          token doc-block). */}
      <div className={cn(PAGE_COLUMN, '@container min-w-0 pt-12 md:pt-16')}>
        <p
          className={cn(
            rise('gateway-t700'),
            'flex flex-wrap items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]',
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
          <span>{releaseTag}</span>
          <span aria-hidden>·</span>
          <span>{t('eyebrow')}</span>
        </p>

        <h1
          // The visible characters are `aria-hidden`, so the heading is named here — once.
          aria-label={heroSentence(heroLines)}
          className={cn(
            'mt-6 break-keep text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]',
          )}
        >
          {/* Typed one character at a time (`HeroTypewriter` owns the cadence and the caret).
              The first line is one step down in ink, making the hierarchy — the second line
              (a person's debt) is the sentence's subject — out of brightness. */}
          <HeroTypewriter start={heroIn} lines={heroLines} />
        </h1>
      </div>

      {/* The split band — lead, CTA, and trust line on the left, the object as the right column.
          `items-center` puts the object's centre of mass on the same axis as the decision block
          (lead → CTA). */}
      <div
        className={cn(
          PAGE_COLUMN,
          'grid min-w-0 items-center gap-x-12 gap-y-10 pb-6 pt-7 lg:pb-7',
          'lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]',
        )}
      >
        {/* The old `lg:pb-14` optical correction was returned (owner, 2026-08-18: *"Too much space at the top"* — too much space at the top; measured at 1512, the correction lifted the
            decision block 28px, leaving 108px of empty lower-left between the block's bottom and
            the canvas bottom, which in turn made the object look pushed down). Now that the CTA
            wraps to two lines and the block is closer to the canvas height, plain `items-center`
            is also optically correct. */}
        <div className="min-w-0">
          <p
            className={cn(
              rise('gateway-t700'),
              'max-w-[40rem] break-keep text-title font-normal leading-title text-[color:var(--color-text-secondary)]',
            )}
          >
            {t('heroLead')}
          </p>

          <div className={cn(rise('gateway-t800'), 'mt-9 flex flex-wrap items-center gap-3')}>
            {published && primaryAsset ? (
              /* The filled CTA — a direct link to the real file. Since the install section was
                 deleted on 2026-08-19 this is the **only** primary download on the page. The file
                 follows the visitor's platform — the defect this branch fixes was a Windows
                 visitor seeing only "get it for Apple Silicon". */
              <a
                href={heroWindowsPrimary ? windowsInstaller!.downloadUrl : primaryAsset.downloadUrl}
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6', HERO_CTA_WRAP)}
              >
                <Download size={ICON_SIZE.lg} aria-hidden />
                {heroWindowsPrimary ? t('windowsDownloadCta') : t('primaryCtaPublished')}
                <AssetSize
                  bytes={heroWindowsPrimary ? windowsInstaller!.sizeBytes : primaryAsset.sizeBytes}
                  onFill
                />
              </a>
            ) : (
              /* With nothing to download, the winner is what does work — the map in the browser. */
              <Link
                href="/topology"
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6', HERO_CTA_WRAP)}
              >
                {t('webCta')}
              </Link>
            )}
            {/* `outline` — ghost has neither a face nor a border and read as prose (owner: *"I can't even tell it's a button"* — I can't even tell it's a button). Something pressable has to look
                pressable, and in this ramp `outline` is the minimum unit of that. */}
            <a
              href="#demo"
              data-testid="gateway-hero-demo-link"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-chip px-4 sm:px-6', HERO_CTA_WRAP)}
            >
              {t('heroDemoCta')}
            </a>
          </div>

          {published && primaryAsset ? (
            /* The second row — every destination that is not the winner, one step down (`md`, h-10
               vs h-11). Only the primary CTA carries a size: decision material belongs to the
               winner. The `unsigned` marker on Windows cannot be dropped even here, because
               signing status is a fact you need before downloading.

               The `px-3` below `sm` is arithmetic, not taste (measured 2026-08-19). At 320px in
               `en` the "Download Windows x64 beta + unsigned" button broke 8px past the screen, and
               because `gateway-fx-stage` is `overflow-hidden` it was **simply clipped, with no
               scrollbar**. Returning 4px on each side fits it exactly. All four drop **together**
               because exits standing side by side with differing padding is a defect this
               repository already caught once (the squeezed padding of 2026-08-08).
               Gate: the 320px overflow test in `download-gateway-grid.spec.ts`. */
            <div
              data-testid="gateway-hero-alt-row"
              className={cn(rise('gateway-t800'), 'mt-2.5 flex flex-wrap items-center gap-2.5')}
            >
              {heroWindowsPrimary ? (
                <a
                  href={primaryAsset.downloadUrl}
                  data-testid="gateway-hero-macos-aarch64"
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
                >
                  <Download size={ICON_SIZE.md} aria-hidden />
                  {t('primaryCtaPublished')}
                </a>
              ) : null}
              <HeroIntelLink />
              {!heroWindowsPrimary && windowsInstaller ? (
                <a
                  href={windowsInstaller.downloadUrl}
                  data-testid="gateway-hero-windows"
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
                >
                  <Download size={ICON_SIZE.md} aria-hidden />
                  {t('windowsDownloadCta')}
                  <span className="font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('windowsUnsignedShort')}
                  </span>
                </a>
              ) : null}
              {/* The gateway's second promise — the path to look without installing is always open.
                  The old `webCta` lived only in the unpublished branch, so now that a release is
                  published it never appeared at all (owner: *"The web playground button is missing"
                  — the web playground button is missing). The label is shorter than `webCta`'s
                  because of the line budget: a longer label drops this line alone onto a third row
                  in the 575px Korean measure (measured at 1512). */}
              <Link
                href="/topology"
                data-testid="gateway-hero-web-cta"
                className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
              >
                {t('heroWebCta')}
              </Link>
            </div>
          ) : null}

          <p
            className={cn(
              rise('gateway-t950'),
              'mt-5 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]',
            )}
          >
            {/* The trust line's slot is "the fact you need before pressing". When the winner is
                Windows, the Apple signing sentence is not a fact about that file — unsigned and the
                SmartScreen warning are the honest sentence for that slot. */}
            {heroWindowsPrimary ? t('trustLineWindows') : t('trustLine')}
          </p>
        </div>

        <div className="min-w-0">
          <HeroObject graph={graph} />
        </div>
      </div>

      <FactsStrip
        published={published}
        primaryAsset={primaryAsset}
        windowsAsset={windowsInstaller}
        windowsPrimary={heroWindowsPrimary}
        heroIn={heroIn}
      />
    </section>
  );
}

/**
 * The Intel Mac file on the hero's second row — always present, regardless of the detection
 * branch. A browser cannot tell which chip a Mac has (see the architecture note), so Apple
 * Silicon is the default and Intel stays reachable by **being permanently visible** rather than
 * by detection.
 */
function HeroIntelLink() {
  const t = useTranslations('download');
  const intel = macosAssetFor('x64');
  if (!intel) return null;

  return (
    <a
      href={intel.downloadUrl}
      data-testid="gateway-hero-macos-x64"
      className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
    >
      <Download size={ICON_SIZE.md} aria-hidden />
      {t('archIntelCta')}
    </a>
  );
}

/**
 * The engraved instrument strip — **facts never move.** Version, date, minimum OS, size, and
 * SHA-256 all come from the release generation module, and in an unpublished state it honestly
 * shrinks (rows for the size and checksum of a file that does not exist simply do not exist).
 *
 * The census is not here — the caption for that number lives in **the same section as the map it
 * counts** (③, owner-confirmed). A definition written twice on one page makes both copies footnotes.
 *
 * ## This rail describes **the file the primary CTA points at** (2026-08-22)
 *
 * While it did not, this page broke its own promise. Opened with a Windows UA, the winner button
 * read "Get Windows x64 beta · 47.8 MB" while the rail directly beneath said
 * `Requires macOS 12 or later · DMG 53.5 MB · SHA-256 c420d0b4…` — **the checksum of a file that
 * would never be downloaded**. A checksum is offered so someone can verify that what they got
 * matches what we published, so showing another file's checksum has a value that is not zero but
 * **negative**: anyone who checks will necessarily see a mismatch, and at that moment what they
 * doubt is the file they downloaded.
 *
 * The hero's CTA (`heroWindowsPrimary`) and trust line (`trustLineWindows`) already followed the
 * detected platform — only this rail was left tied to `macosAssetFor`. So rather than inventing a
 * second verdict it **takes the same boolean down**: which file a screen is talking about must be
 * decided in exactly one place.
 *
 * The mac branch's values and ordering **did not change by one byte** — the server snapshot is
 * always mac (`visitor-platform.ts`), so the first paint is unchanged too.
 */
function FactsStrip({
  published,
  primaryAsset,
  windowsAsset: windowsInstaller,
  windowsPrimary,
  heroIn,
}: {
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

  /** The winning file — precisely what the hero CTA points at. */
  const subject = windowsPrimary && windowsInstaller ? windowsInstaller : primaryAsset;
  const subjectIsWindows = subject !== null && subject === windowsInstaller;

  const facts: { label: string; value: string }[] = [
    { label: 'Version', value: version },
    {
      label: 'Requires',
      value: `${subjectIsWindows ? RELEASE_MIN_WINDOWS : RELEASE_MIN_MACOS}${t('factMinOsSuffix')}`,
    },
  ];
  if (published && subject) {
    facts.push({
      // The file format is the label — it states "what you are getting" once more, beside the size.
      label: subjectIsWindows ? 'EXE' : 'DMG',
      value: formatAssetSize(subject.sizeBytes),
    });
    facts.push({
      label: 'SHA-256',
      value: `${subject.sha256.slice(0, 8)}…${subject.sha256.slice(-8)}`,
    });
  }

  return (
    <div className={cn('gateway-rise gateway-t950', heroIn && 'is-in', 'w-full')}>
      <dl
        data-testid="gateway-facts"
        className={cn(
          PAGE_COLUMN,
          'flex flex-wrap gap-x-12 gap-y-4 border-t border-[color:var(--color-border-soft)] py-5',
        )}
      >
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {fact.label}
            </dt>
            <dd
              data-token="engraved-numeral"
              className="mt-1 font-mono text-body leading-body text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── ② Demo — plays itself once visible ─────────────────────────────────────

function DemoSection() {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLElement>();

  return (
    <section
      id="demo"
      ref={ref}
      data-testid="gateway-demo-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro
          eyebrow="Demo"
          title={t('demoTitle')}
          sub={t('demoSub')}
          inView={inView}
          centered
        />
        <div
          className={cn(
            'gateway-rise gateway-scroll-stage gateway-rise-d3',
            inView && 'is-in',
            'mt-9',
          )}
        >
          <DemoStage />
        </div>
      </div>
    </section>
  );
}

// ─── ③ Evidence — the map assembles in front of you, and the numbers arrive when it finishes ──

/**
 * The map left the first screen (owner call) but did not disappear — it has its own section, as
 * **evidence**. When the section enters the viewport the real engine (`StageMap` →
 * `TopologyMapV2`) fires its arrival choreography (the homing spring) once, and the census
 * caption arrives after assembly completes (1400ms) — the numbers are the **result** of assembly.
 *
 * The caption's honesty contract is unchanged from before the remake: the number the caption
 * counts and the graph the map draws come from one hook, `useStageGraph()`.
 */
/**
 * The linked demo's score — step index → (what the map focuses, which file line lights).
 *
 * One run, three beats, then release. Each beat is the pair the section's whole claim is made
 * of: a line of the file on the right, and the thing that line **is** on the live map to the
 * left. The map side drives the engine's own focus states (`StageScriptedFocus`) with node ids
 * the generator derived from the same vault file — nothing here is a second source.
 *
 *  1. the `title` line ↔ the node itself (ego focus: its neighbourhood stays, the rest recedes)
 *  2. the `domain` line ↔ the domain node, emphasised inside that neighbourhood
 *  3. the `dependencies` line ↔ the dependency node, emphasised the same way
 *
 * The beats sit `DEMO_BEAT_MS` apart — slower than the reading rhythm of the agent scene's
 * choreography because each beat asks the eye to travel between two panels. One pointer act on
 * the map cancels the run for good: the map is an object to handle, and a hand beats a script.
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

function EvidenceSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.25);
  const [captionIn, setCaptionIn] = useState(false);
  /** −1 = idle/finished, 0..2 = a beat of `DEMO_SCRIPT` is on. */
  const [demoStep, setDemoStep] = useState(-1);
  /** Set forever on the first pointer act or after one full run — the demo never replays. */
  const demoDoneRef = useRef(false);

  useEffect(() => {
    if (!inView) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => setCaptionIn(true), reduced ? 0 : 1400);
    return () => window.clearTimeout(id);
  }, [inView]);

  /**
   * The demo waits for the caption (i.e. for assembly to have settled) and runs once. Under
   * reduced motion it never runs — the resting section already carries every fact, so the demo
   * is strictly additive and skipping it loses nothing a reader cannot get by hovering.
   */
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
          eyebrow="Evidence"
          title={t('evidenceTitle')}
          sub={t('evidenceSub')}
          inView={inView}
        />

        {/*
         * Map 55 / real data 45 (owner report 2026-08-18 — in the full-width frame the graph used
         * 20% of the width and 80% was empty black). One half gives the graph a near-square frame
         * it fills by bbox fit (camera and tier reveal are in `StageMap` and
         * `--topology-v2-overview-entry-ratio`), and the other half is filled by real data derived
         * from the same graph (the kind census, verbatim relations, impact radius) — this section
         * is called evidence.
         */}
        <div
          ref={ref}
          className={cn(
            'gateway-scroll-stage',
            'mt-9 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:gap-12',
          )}
        >
          <div
            data-testid="download-stage-map-frame"
            className="relative h-[24rem] min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] md:h-[30rem] lg:h-[34rem]"
          >
            <StageMap graph={graph} scripted={beat?.focus ?? null} onUserInteract={cancelDemo} />
          </div>
          <div
            className={cn('gateway-rise gateway-rise-d3', inView && 'is-in', 'min-w-0 lg:self-center')}
          >
            <EvidenceSpecimen demoKey={beat?.line ?? null} />
          </div>
        </div>

        {/* This number is the graph drawn directly above it. The lineage of the source, the scope
            label, and the tactile hint is in the pre-remake comments and the decision ledger. */}
        <p
          data-testid="download-portrait-caption"
          className={cn('gateway-map-after', captionIn && 'is-in', 'pointer-events-none mt-5')}
        >
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
            <span>docs/ontology</span>
            <span aria-hidden>·</span>
            <span
              data-token="engraved-numeral"
              className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {t.rich('portraitCensus', {
                concepts: graph.nodes.length,
                relations: graph.edges.length,
                // Owner-picked count-up (survey 2026-08-23). The DOM always carries the final
                // value (CountUp's contract), so the caption-honesty test reads truth at any time.
                c: () => <CountUp value={graph.nodes.length} />,
                r: () => <CountUp value={graph.edges.length} />,
              })}
            </span>
            <span aria-hidden>·</span>
            <span className="min-w-0 break-keep text-[color:var(--color-text-tertiary)]">
              {t('portraitHint')}
            </span>
            <span aria-hidden>·</span>
            <span className="min-w-0 break-keep">{t('portraitScope')}</span>
          </span>
        </p>
      </div>
    </section>
  );
}

// ─── ④ Agents — a measured in-app (ACP) round trip plus three still cards ───

/**
 * This section's one idea (reworked 2026-08-18, `docs/DECISIONS.md`):
 *
 * > **The agent lives inside the app — it analyzes and repairs the ontology through conversation alone.**
 *
 * The previous version was an `mcp-verify` terminal and the owner rejected it (*"I have no idea what this means"* — I have no idea what this means; it showed a developer verifying configuration, not
 * the thing being sold). The real thing already exists: `AcpChatPanel` (the in-app conversation),
 * `AcpRuntimeSettings`, and the vault capability "in-app coding agent runner (ACP)". The scene
 * (`AcpChatScene`) re-enacts a measured round trip of that real thing (ledger 2026-08-16 (7)).
 *
 * Copy boundaries come from ledger 2026-08-16 (5): ① we redistribute nothing (the adapter runs
 * via npx on the user's machine) ② "Claude Code" is forbidden where our runner list is described —
 * only the registry's permitted name (Claude Agent) ③ it stands only on **"connect the agent you
 * already use"** — never implying we provide model access.
 */
function AgentSection() {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLElement>();

  const columns = [
    { title: t('col1Title'), body: t('col1Body'), code: t('col1Code') },
    { title: t('col2Title'), body: t('col2Body'), code: t('col2Code') },
    { title: t('col3Title'), body: t('col3Body'), code: 'git diff docs/ontology/' },
  ];

  return (
    <section
      id="agents"
      ref={ref}
      data-testid="gateway-agents-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow="Agents" title={t('agentsTitle')} sub={t('agentsSub')} inView={inView} />

        {/* The stage width uses the same token as the demo section (`--gateway-stage-max`), so the
            page states "this much is the stage" only once. At ≤1920 it is the previous 48rem; only
            at wider widths does it grow proportionally (rationale in the token doc-block). */}
        <div
          data-testid="gateway-agent-scene"
          className={cn(
            'gateway-rise gateway-scroll-stage gateway-rise-d3',
            inView && 'is-in',
            'mt-9 max-w-[var(--gateway-stage-max)]',
          )}
        >
          <AcpChatScene />
        </div>
        {/* The three cards are still — one moving thing above is enough. */}
        <div className="mt-14 grid min-w-0 gap-y-10 md:grid-cols-3">
          {columns.map((column, i) => (
            <div
              key={column.title}
              className={cn(
                'min-w-0 md:px-8',
                i === 0 && 'md:pl-0',
                i > 0 && 'md:border-l md:border-[color:var(--color-border-soft)]',
              )}
            >
              <h3 className="break-keep text-title font-[var(--font-weight-emphasis)] leading-title text-[color:var(--color-text-primary)]">
                {column.title}
              </h3>
              <p className="mt-2.5 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                {column.body}
              </p>
              <code className="mt-4 block border-l border-[color:var(--color-border-strong)] pl-3 font-mono text-body leading-body text-[color:var(--color-text-tertiary)]">
                {column.code}
              </code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The file size attached to a button — **not attached below `sm`** (verdict ④, 2026-07-29).
 *
 * `buttonVariants` sets `whitespace-nowrap`, so a long label pushes the button through its
 * container. Measured at 320px: the primary CTA's content was 261px against 216px of real width →
 * horizontal overflow. No scrollbar appeared; it was **simply clipped**.
 *
 * The size is what got cut because a 320px phone cannot install a macOS DMG. The size is **a fact
 * for the person deciding to install**, and that person is at a desktop.
 *
 * Both buttons sharing one grammar is a bonus — the primary CTA used to put `· {size}` **inside
 * the translated string** while Intel drew it as a separate span, so two buttons on one row stated
 * the same fact in different typefaces with different punctuation.
 *
 * ⚠️ **Engraved numerals are a grammar for neutral surfaces** (`--engraved-numeral-face` #8c8c94
 * plus a 1px `#08080a` highlight below — the look of being pressed into a dark panel). Placed
 * straight onto filled indigo (#5e6ad2) the contrast collapses to **1.41:1** (measured 2026-07-29
 * — the first draft made exactly this mistake). On a filled button it uses the button's own
 * foreground colour: it is part of the same sentence, so there is no reason for the colour to differ.
 */
function AssetSize({ bytes, onFill = false }: { bytes: number; onFill?: boolean }) {
  return (
    <span
      className={cn(
        'hidden font-mono text-label leading-label sm:inline',
        // On a filled button it is **not even weakened**. Adding `opacity-80` dropped the composite
        // contrast to 3.45:1 (11px text, measured 2026-07-29) — one step down already breaks
        // through. Separating the size from the label is already done by the mono face and the spacing.
        //
        // The ink must be the **same token** as the label. Until 2026-08-03 this slot was
        // `--color-text-primary`, which is 4.42:1 on filled indigo and below AA. The label moved up
        // to `--color-text-on-accent` (4.70:1), so the size badge moves with it — two inks inside
        // one button is the next regression.
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
 * Release policy prose belongs to the colophon (verdict 2026-07-29: policy prose is not decision
 * material). Since the install section and the verification rail were deleted on 2026-08-19, these
 * two sentences are the **only** release-policy facts left on the page.
 */
function ReleasePolicyNotes({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <>
      <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {published
          ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
          : /* An unreleased build is named by the development version — while unpublished,
               `MACOS_RELEASE.tag` is by definition a stale value. */
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
