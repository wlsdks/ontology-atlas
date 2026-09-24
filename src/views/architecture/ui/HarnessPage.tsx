'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import {
  useDataSourceMode,
  useLocalVault,
  useStaticVaultSource,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { Chip, EmptyState, InfoHint, Surface, TabBar } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { PAGE_TOP_PAD } from '@/shared/ui/page-frame';
import { GuidanceRelationshipPreview } from '@/widgets/relationship-preview';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

import {
  buildHarnessViewHref,
  defaultViewForSurface,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
  type HarnessView,
} from '../lib/harness-view-state';
import { deriveCoverageAreas } from '@/features/harness-report';
import { useHarnessReport } from '@/features/harness-report';
import { ArchitecturePage } from './ArchitecturePage';
import { buildHarnessAnatomy } from '../model/harness-anatomy';
import { HarnessAnatomyView } from './HarnessAnatomyView';
import { HarnessCoverageView } from './HarnessCoverageView';
import { HarnessGuidesView } from './HarnessGuidesView';
import { HarnessScanProgressPanel } from './HarnessScanProgressPanel';
import { HARNESS_FRAME_CONTAINER, HARNESS_GUTTER_X } from './harness-frame';

/**
 * **The Harness destination: one spine, and two views that detail it.**
 *
 * The spine is the **coverage matrix** — this repository's own domains on the rows, and what tells,
 * gates and watches each one on the columns. That is the view this destination is *for*, and it is
 * one press away at `?view=coverage`; the view a person walks into is the reviewed layer ladder
 * (owner, 2026-09-13), which also keeps the plain `/architecture/` address meaning exactly what
 * every link written before this slice meant. `?view=sensors` — the view that named the coverage
 * question and said it was not built — resolves to the matrix (`harness-view-state.ts`).
 *
 * ⚠️ **One chrome row, and the name shares it with the tabs.** Three measurements decided this
 * shape, in order:
 *
 * 1. A document header over the blueprint cost **168px** at 1280×800; the canvas column fell from
 *    612 to 444, below even the tight ladder's 573, and the seventh role went behind a fold — the
 *    defect the 2026-09-03 record and `architecture-workbench.spec.ts` exist to prevent.
 * 2. Pushing the identity *into* the workbench recovered the canvas but put the tab set inside the
 *    panel it switches: the blueprint's own `!selected` empty state returns early, so a repository
 *    with no architecture profile lost every path to the other two views, and a second `TabBar`
 *    instance meant a keyboard activation unmounted the focused tab and dropped focus to `<body>`
 *    (design-interaction, 2026-09-13).
 * 3. So the tab set is **one instance, in the shell, above every panel**, and it shares its row
 *    with the `h1` — which is what the design-lead and design-responsive seats independently
 *    prescribed (`PAGE_HEADER_ROW`'s own grammar: the title's `y` never depends on what sits
 *    beside it).
 *
 * **The sentence is the screen's thesis and its main risk.** Two numbers are computed from files —
 * guide documents found, checks declared — and both print their working: the check count shows its
 * three parts, and a caption states the counting rule, because a bare number invites the reader to
 * hear "N things are protecting you" when what was measured is "N things are declared".
 *
 * The third clause the first sketch wanted — "N domains nobody guards" — used to sit below the
 * sentence as a deferral, because asserting it needed a measurement that did not exist. It exists
 * now and it is not that sentence: the matrix says **no check names N of the areas**, which is what
 * the files support, while the row above every area names the lanes that run over all of them. The
 * stronger claim, that nothing watches them, would still be unreadable from a repository.
 */

/**
 * **How long a read may take before the progress screen is worth showing.**
 *
 * The owner watched the scan panel flash past and asked whether that was unavoidable. It is not a
 * problem to solve by slowing down: the read is 0.6s on this repository precisely because the last
 * slice made it fast, and animating a wait that is not happening is dishonesty with a gradient on
 * it. So the panel is **held back** instead. Under this threshold the reader sees no wait screen at
 * all and the result simply arrives; over it, the stages are the thing that makes a long read
 * bearable, and this repository's 506 documents are not the ceiling — someone else's checkout has
 * five thousand.
 *
 * 1000ms is the response-time limit at which a person stops experiencing a system as answering and
 * starts wondering whether it is working (Miller 1968; Card, Robertson and Mackinlay 1991 —
 * the same boundary Nielsen's three response limits are built on). Below it the flow of thought is
 * uninterrupted and a screen that appears and vanishes is noise; above it, silence is the defect
 * the progress panel was built to fix.
 *
 * There is deliberately **no minimum visible duration**. Holding the panel on screen after the read
 * has finished, so that it does not flash, would delay the answer to display an animation — the
 * exact trade this threshold exists to refuse. The arrival carries the transition instead.
 */
const PROGRESS_REVEAL_MS = 1000;

/** The read never changes within a session, so nothing has to be watched. */
const subscribeNever = () => () => {};

/**
 * The server's answer, which is the browser's: a static export is built with no desktop bridge, and
 * the exported HTML is what a web visitor gets.
 */
const readHarnessSurfaceOnServer = () => false;

const EMPTY_DOCS: Array<{
  slug: string;
  title: string;
  description?: string;
  excerpt: string;
  frontmatter: Record<string, unknown>;
}> = [];

function HarnessPageInner() {
  const t = useTranslations('harness');
  const locale = useLocale();
  const searchParams = useSearchParams();
  /*
   * ⚠️ **The address is read on every render, not captured once.** `useSearchParams()` returns an
   * empty set during the prerender pass of a static export and fills in after hydration, so a
   * `useState` initializer keeps the empty one — the view the URL named was simply lost. The old
   * default hid this: the empty read and `?view=structure` happened to agree. The moment the
   * default moved, `/ko/architecture/?view=structure` started opening the matrix, and the a11y
   * sweep caught it by pressing a trigger that only the ladder has (measured 2026-09-13).
   *
   * A press still wins over the address until the next history move, because `setView` rewrites the
   * URL with `replaceState`, which `useSearchParams` does not observe.
   */
  const [viewOverride, setViewOverride] = useState<HarnessView | null>(null);
  /*
   * ⚠️ **The surface decides the arrival view, and a static export cannot know it on the server.**
   * So the server snapshot is `false` — the browser's answer, and the one the exported HTML has to
   * carry — while the client reads the real runtime. `useSyncExternalStore` rather than an effect
   * plus state: the read never changes, the subscription is a no-op, and the first client render
   * is already correct with no hydration mismatch (the same shape `FirstRunStarterModule` uses for
   * the platform badge).
   */
  const surfaceHasBridge = useSyncExternalStore(
    subscribeNever,
    isTauriVaultRuntime,
    readHarnessSurfaceOnServer,
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();
  const docs = useMemo(
    () => (mode === 'static' ? staticManifest.docs : (localVault.manifest?.docs ?? EMPTY_DOCS)),
    [localVault.manifest, mode, staticManifest.docs],
  );
  /*
   * The matrix's rows. Derived here rather than inside the view so the scan can be told which
   * implementation paths exist before it resolves a scope against the disk — the probe is the only
   * part of the read that costs a round trip per candidate, and it is pointless without them.
   */
  const coverage = useMemo(() => deriveCoverageAreas(docs, locale), [docs, locale]);
  const projectSlugs = useMemo(
    () =>
      docs
        .filter((doc) => doc.frontmatter.kind === 'project')
        .map((doc) => doc.frontmatter.slug)
        .filter((slug): slug is string => typeof slug === 'string'),
    [docs],
  );

  useEffect(() => {
    /* Back and forward must move the view too; the address and the screen disagreeing is exactly
       what putting the view in the URL was meant to prevent. */
    const onPopState = () => {
      const params = new URL(window.location.href).searchParams;
      setViewOverride(resolveAddressView(params, isTauriVaultRuntime()));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /*
   * ⚠️ **The read is not gated on the view any more, and it cannot be.** The arrival view is chosen
   * from whether this surface can actually produce a harness reading, so gating the reading on the
   * view would have each waiting for the other. It costs nothing where it cannot run: without the
   * bridge the hook returns `unsupported` without a round trip.
   */
  const reportState = useHarnessReport(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    surfaceHasBridge,
    coverage.capabilityPaths,
    reloadNonce,
  );
  const report = reportState.status === 'ready' ? reportState.report : null;
  /*
   * ⚠️ **A bridge is not a harness.** The first version of this asked only whether the desktop
   * bridge existed, and CI found the gap: a browser session that mounts a local folder through a
   * Tauri-shaped stub has the bridge and no connected project source, so the destination opened the
   * structure view and drew "this browser cannot read dot directories" over a repository whose
   * architecture profile was right there to show (`local-vault-route-identity`, 2026-09-20).
   *
   * So the question is the one that matters: can a reading be produced here at all? `unsupported`
   * and `no-source` are the two answers that mean no, and both send the arrival to the blueprint,
   * which answers from the profile. A named `?view=` still wins over this, so a shared link opens
   * what it says on either surface.
   */
  const harnessUnavailable =
    reportState.status === 'unsupported' || reportState.status === 'no-source';
  const canReadHarness = surfaceHasBridge && !harnessUnavailable;
  const addressView = resolveAddressView(searchParams, canReadHarness);
  /* A press wins over the address until the next history move; see `setView`. */
  const requestedView = viewOverride ?? addressView;
  /*
   * ⚠️ **Before a reading exists, the three harness tabs are one tab.** Structure, coverage and
   * guides all draw the same example and the same connect door when no source can be read, so
   * three tabs that switch nothing told a person there were three things to see here (owner chose
   * this, 2026-09-24). They collapse into one tab beside the blueprint, which does answer from the
   * vault, and all three return the moment a reading arrives. A `?view=coverage` link still lands
   * on that one tab rather than on a view that cannot draw.
   */
  const view: HarnessView =
    harnessUnavailable && requestedView !== 'architecture' ? 'structure' : requestedView;

  const setView = useCallback(
    (next: HarnessView) => {
      setViewOverride(next);
      /*
       * `history.replaceState`, not a router push: switching view inside one destination is not a
       * new place a person navigated to, and pushing would make Back walk the segmented control
       * instead of leaving the screen. The address still carries the view so a refresh or a shared
       * link reopens it — the same grammar `/mcp` uses for its tabs.
       *
       * ⚠️ **The surface's own arrival view is what may be left unwritten, not the constant.** The
       * address is read back through `resolveAddressView(..., canReadHarness)`, so the only view
       * that survives a refresh unwritten is the one *this* surface opens with. On the web that is
       * the blueprint, and omitting `?view=` for `structure` there meant pressing that tab and
       * refreshing reopened the ladder — the one surface where no bridge exists to argue otherwise.
       * So the writer is handed the same value the reader uses.
       */
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      window.history.replaceState(
        window.history.state,
        '',
        buildHarnessViewHref(next, url.pathname, url.search, defaultViewForSurface(canReadHarness)) +
          url.hash,
      );
    },
    [canReadHarness],
  );

  /*
   * The wait screen is held back rather than the read being slowed down. `loading` flips identity on
   * every progress report but stays `true` for the whole spell, so this effect starts exactly one
   * timer per read and the panel appears only if the read is still running when it fires.
   */
  const loading = reportState.status === 'loading';
  const [waitedPastThreshold, setWaitedPastThreshold] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setWaitedPastThreshold(true), PROGRESS_REVEAL_MS);
    /*
     * The reset lives in the cleanup, not in the effect body. Written in the body it was a
     * synchronous setState inside an effect — the cascading-render shape `use-harness-report.ts`
     * already avoids by computing its gate in render — and `react-hooks/set-state-in-effect`
     * refuses it. Cleanup runs exactly when `loading` stops being true, which is the moment the
     * flag has to fall so a retry earns its own second.
     */
    return () => {
      window.clearTimeout(timer);
      setWaitedPastThreshold(false);
    };
  }, [loading]);

  const switcher = (
    /*
     * A tab set, not a radiogroup: these three labels swap whole panels, which is the tab pattern
     * (APG) and the grammar `/mcp` already uses. It is also not a free choice — two existing specs
     * assert `getByRole('radio')` is absent from this route, and a `SegmentedControl` here put three
     * radios on it (measured 2026-09-13).
     */
    <TabBar
      ariaLabel={t('viewsAria')}
      idPrefix="harness"
      activeKey={view}
      onSelect={(key) => setView(parseHarnessView(key))}
      items={
        harnessUnavailable
          ? [
              { key: 'structure', label: t('views.structure') },
              { key: 'architecture', label: t('views.architecture') },
            ]
          : HARNESS_VIEW_ORDER.map((id) => ({ key: id, label: t(`views.${id}`) }))
      }
    />
  );

  /*
   * ⚠️ **`relative z-10` on the wrapper is what keeps this block's hint panel readable.** The
   * results block below is a later sibling, so without an explicit z-index every mark it draws —
   * the "Guides: what the agents were told" heading, the file table, the matrix — paints over the
   * `InfoHint` panel that hangs out of this block, and the two texts read as one smear (owner,
   * 2026-09-14, on the installed app). The panel's own `z-30` cannot fix that: it orders the panel
   * against its siblings inside this element, never against the element that follows it.
   */
  const structureCount = useMemo(() => {
    if (!report) return null;
    const places = buildHarnessAnatomy(report).slots.filter((slot) => slot.band !== 'tool');
    return {
      total: places.length,
      filled: places.filter((slot) => slot.status === 'present').length,
    };
  }, [report]);

  const sentence = report ? (
    <div data-testid="harness-sentence" className="architecture-result-arrive relative z-10">
      {/*
        ⚠️ **The thesis takes the one step above body, at regular weight.** It was demoted to body
        size in 2026-09-13 so it would not share `text-title` · emphasis with a coverage headline;
        that headline is now the three column cards, and at 12.5px the sentence the screen is about
        measured smaller than the 14px subtitle above it (design audit, 2026-09-25). So the eyebrow
        drops to body and this rises to `text-title` without the emphasis weight — one step above
        everything around it, and still lighter than the cards' display numerals below.
      */}
      <div className="flex max-w-prose flex-wrap items-center gap-x-1 break-keep text-title text-[color:var(--color-text-primary)]">
        <span className="tabular-nums">
          {t('sentence', {
            documents: report.guideDocumentCount,
            checks: report.checks.total,
          })}
        </span>
        {/* `left`: this hint sits at the start of the lead paragraph, so a right-anchored panel
            ran 84.9% off the left edge at 390 (design-responsive, 2026-09-13). */}
        {/* `static`, so the panel anchors to the sentence block rather than to the button: at the
            title step the sentence runs long enough to put the button near the right edge at 768,
            and a panel hung from it ran 29px off-screen. */}
        <InfoHint
          align="left"
          className="static"
          panelClassName="max-w-full max-h-[35dvh] overflow-y-auto"
          label={t('checksBreakdownLabel')}
        >
          {t('checksHint')}
        </InfoHint>
      </div>
      <p className="mt-1 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
        {t('checksBreakdown', {
          hooks: report.checks.wiredHooks,
          gitHooks: report.checks.gitHooks,
          scripts: report.checks.scripts.length,
        })}
      </p>
    </div>
  ) : null;

  /*
   * **The structure view's thesis, in the structure view's own unit.** The census above counts
   * declarations and a mirrored guard twice, so it cannot stand over the bands (see below). What
   * the bands can say in one sentence is how many of the harness's places this repository fills —
   * the same present/absent split every row below prints — so every data view opens on the same
   * three-step block: eyebrow, thesis, and the rule it was counted by.
   */
  const structureSentence = structureCount ? (
    <div data-testid="harness-structure-sentence" className="architecture-result-arrive relative z-10">
      <p className="max-w-prose break-keep text-title tabular-nums text-[color:var(--color-text-primary)]">
        {t('structureSentence', structureCount)}
      </p>
      {/* Inline flow rather than flex: as a flex item the caption took the whole measure and
          pushed its hint onto a line of its own. Not held to the prose measure either: at that
          width it broke into two ragged lines with the hint hanging off the second, beside a
          panel that runs the full frame (design review, 2026-09-25). One label line at desktop
          widths, and the one place this view says what its numbers are not. */}
      <div className="mt-1 break-keep text-label text-[color:var(--color-text-tertiary)]">
        <span>{t('anatomyCaption')} </span>
        <InfoHint
          align="left"
          className="static align-middle"
          label={t('anatomyProvenanceLabel')}
          panelClassName="max-w-full max-h-[35dvh] overflow-y-auto"
        >
          {t('anatomyProvenance')}
        </InfoHint>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', HARNESS_FRAME_CONTAINER)}>
      {/*
        The chrome row: the destination's name and the one tab set share a line, so the title's `y`
        does not depend on which view is open and the tabs never move out from under the pointer
        that just pressed them.
      */}
      <div
        /*
         * ⚠️ **The rail is what makes these read as tabs.** Structure · Coverage · Guides sat as small
         * text in the top-right corner with a 2px stub under one word, and the owner said the
         * decisive thing: *"I would not even think of that as a tab."* He is right — a short
         * underline floating beside a title reads as a byline or a breadcrumb. Every other
         * `TabBar` in this product (`/mcp`, `/ontology/insights`, project detail) sits on a rule
         * that spans its container, and one lit segment on a continuous rail is the tab
         * affordance itself.
         *
         * Giving the tabs their own row would have bought that rail for **36px** of height, and
         * the blueprint below has 39px of headroom before the seventh role falls behind the fold
         * at 1280×800 (`architecture-workbench.spec.ts`). So the row keeps the title and the tabs
         * together and grows the rail instead: `border-b` on the row, `items-end` so the tab
         * strip's own bottom border lands on it, `-mb-px` so the two rules are one. One pixel,
         * not thirty-six. When the row wraps at narrow widths the tab strip takes the rail alone,
         * which is the same shape and still continuous.
         */
        className={cn('flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-[color:var(--color-divider)] pb-0', HARNESS_GUTTER_X, PAGE_TOP_PAD)}
      >
        <h1 className="pb-3 text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <div data-testid="harness-views" className="-mb-px min-w-0">
          {switcher}
        </div>
      </div>

      {view === 'architecture' ? (
        <ArchitecturePage
          embedded
          harnessPanelId="harness-tabpanel-architecture"
          harnessPanelLabelledBy="harness-tab-architecture"
        />
      ) : (
        /*
          ⚠️ **The panel is the `main` landmark, and it has to be.** The blueprint branch gets one
          from `ArchitectureWorkbench`; this branch did not, so the moment the default view stopped
          being the blueprint the route rendered with no `main` at all — the skip link pointed at
          `#main` and landed nowhere, and every shared sweep that waits for the landmark
          (`waitForDocumentPaint`, the scroll-end gate, the a11y ratchet) timed out on a screen that
          looked perfectly fine. `role="tabpanel"` overrides the implicit landmark role, so the two
          cannot be the same element: the landmark is outside, the tabpanel inside it.
        */
        <main
          id="main"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
        <div
          role="tabpanel"
          id={`harness-tabpanel-${view}`}
          aria-labelledby={`harness-tab-${view}`}
          tabIndex={-1}
          /* The tab-bar reserve alone left 5px of clearance with the provenance disclosure closed
             and −1px with it open. Reserve plus breath is the calc `globals.css` already uses for
             the download band below `lg` (design-responsive, 2026-09-13). */
          /* `pt-4`, because the header row now ends in a rule rather than in padding: without it the
             explainer's first line sat at y 85.4 against a rail whose own y was 85.4 (measured
             1512×901, 2026-09-13) — the cramping the owner reported, reintroduced by the fix for
             it. */
          className={cn('min-h-0 flex-1 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-4 lg:pb-[var(--page-bottom-breath)] max-lg:scroll-pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
            HARNESS_GUTTER_X,
            view === 'structure' && reportState.status === 'ready' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}
        >
          <div className={cn('w-full', view === 'structure' && reportState.status === 'ready' && 'flex min-h-0 flex-1 flex-col')}>
            {/*
              ⚠️ **One lead, not four stacked lines.** The owner read the header as four things of
              descending size with nothing grouping them: the name, the explainer, the census
              sentence, its breakdown caption — and then a fifth, the finding, at a size between
              two of them. The explainer says what the screen is and the census says what it found
              in this repository; they are one paragraph and its measurement, so they share a block
              and the census takes the step below the explainer rather than sitting beside it as an
              equal. What the finding used to be is now the three column cards, which carry it per
              question instead of only for Watched.
            */}
            <div className="mb-3 flex shrink-0 flex-col gap-1">
              <p className="max-w-prose text-body text-[color:var(--color-text-tertiary)]">
                {t('explainer')}
              </p>
              {/*
                ⚠️ **Not on the structure view, because it contradicts it.** The census counts
                declarations in one bucket — "N checks in place" is wired hooks plus `.githooks/`
                files plus `package.json` scripts, and a guard mirrored for Claude Code and Codex
                counts twice. The view below splits exactly that bucket into what gates and what
                watches, and counts a mirrored guard **once**, which is the distinction the two
                files carry. So a reader met "80 checks" over rows adding to 77 under a different
                definition, one screen arguing with itself (2026-09-20). The bands *are* the
                census there, and they say it in the vocabulary the rest of the view uses.

                It stays on the coverage and guides views, where the matrix and the table use the
                same counting rule it does.
              */}
              {view === 'structure' ? structureSentence : sentence}
            </div>
            {reportState.status === 'ready' ? (
              <div className={cn('architecture-result-arrive', view === 'structure' && 'flex min-h-0 flex-1 flex-col')}>
                {view === 'structure' ? (
                  <>
                    <HarnessAnatomyView
                      report={reportState.report}
                      sourceRoot={reportState.sourceRoot}
                    />
                  </>
                ) : view === 'coverage' ? (
                  <HarnessCoverageView
                    report={reportState.report}
                    areas={coverage.areas}
                    pathlessCapabilities={coverage.pathlessCapabilities}
                    sourceRoot={reportState.sourceRoot}
                  />
                ) : (
                  <>
                    <HarnessGuidesView report={reportState.report} locale={locale} />
                    {/* The coverage view prints the read path inside its own closing line; the
                        guides view has no such line, so it keeps this one. */}
                    <p className="mt-6 font-mono text-label text-[color:var(--color-text-quaternary)]">
                      {t('sourceRoot', { path: reportState.sourceRoot })}
                    </p>
                  </>
                )}
              </div>
            ) : reportState.status === 'loading' ? (
              /*
                Nothing at all until the read has actually taken longer than the threshold. A
                sub-second read now shows no wait screen, which is the honest picture of a read
                that did not make anybody wait.

                Born as a `Surface`, because a panel that appears one second into a read is a state
                change and not a repaint — it says *this one is taking a while* — so it gets a real
                entrance: 180ms of opacity on `map-overlay-in`, measured.

                ⚠️ **It gets no exit, and that is deliberate rather than an oversight.** The status
                ternary around it unmounts the whole branch in the same commit the read finishes, so
                `map-overlay-out` can never play from this call site; `Surface` is here for the
                entrance and for the exit window this slot would need if it ever gained an
                open→closed path of its own. Crossfading a 288px panel against a ~900px matrix in
                one flow slot would buy a height bounce `useSwapHeight` would then have to wrap, for
                a frame nobody is watching (design-motion, 2026-09-13).

                `overlay` rather than `chrome`: the panel is 1368×≥288 at 1512, about 29% of the
                viewport, and under `chrome` the `scale(0.98)` would move each vertical edge 13.7px
                — `globals.css` records why a large surface moves on nothing but brightness, since
                one that travels reads as the screen itself shaking.
              */
              <Surface
                open={waitedPastThreshold}
                motion="overlay"
                className="flex flex-1 flex-col"
              >
                <HarnessScanProgressPanel progress={reportState.progress} />
              </Surface>
            ) : reportState.status === 'no-source' ? (
              <GuidanceRelationshipPreview footer={<>
                <div className="min-w-0 max-w-prose">
                  <p className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('noSource')}</p>
                  <p className="mt-2 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('noSourceBody')}</p>
                  {/* Under the sentence it answers, on that sentence's start line: a pill at the
                      far edge of the card stood ~900px from its reason and read as a stray
                      control (design audit, 2026-09-25). */}
                  <Link href="/projects/" className={controlClass({shape:'pill',size:'lg',tone:'accent',className:'atlas-touch-floor atlas-touch-floor-wide mt-4'})}>{t('connectSourceAction')}</Link>
                </div>
              </>} />
            ) : reportState.status === 'failed' ? (
              /* A dead end with no way out was the one irreversible state on a read-only screen. */
              <EmptyState
                title={t('failed')}
                description={reportState.message}
                action={
                  <Chip data-testid="harness-retry" onClick={() => setReloadNonce((n) => n + 1)}>
                    {t('retry')}
                  </Chip>
                }
              />
            ) : (
              /* The browser can see no dot directory at all, so it does not draw a shorter list
                 and call it the harness. */
              <GuidanceRelationshipPreview footer={<>
                <div className="min-w-0 max-w-prose">
                  <p className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('browserOnly')}</p>
                  <p className="mt-2 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('browserOnlyBody')}</p>
                  <Link href="/download/" className={controlClass({shape:'pill',size:'lg',tone:'accent',className:'atlas-touch-floor atlas-touch-floor-wide mt-4'})}>{t('browserAction')}</Link>
                </div>
              </>} />
            )}
          </div>
        </div>
        </main>
      )}
    </div>
  );
}

export function HarnessPage() {
  return (
    <VaultSourceHydrationBoundary>
      <HarnessPageInner />
    </VaultSourceHydrationBoundary>
  );
}
