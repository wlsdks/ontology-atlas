'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import {
  useDataSourceMode,
  useLocalVault,
  useStaticVaultSource,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { Chip, EmptyState, InfoHint, Surface, TabBar } from '@/shared/ui';
import { PAGE_TOP_PAD } from '@/shared/ui/page-frame';

import {
  buildHarnessViewHref,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  type HarnessView,
} from '../lib/harness-view-state';
import { deriveCoverageAreas } from '../model/coverage-areas';
import { useHarnessReport } from '../model/use-harness-report';
import { ArchitecturePage } from './ArchitecturePage';
import { HarnessCoverageView } from './HarnessCoverageView';
import { HarnessGuidesView } from './HarnessGuidesView';
import { HarnessScanProgressPanel } from './HarnessScanProgressPanel';

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
  const addressView = parseHarnessView(searchParams.get('view'));
  const view = viewOverride ?? addressView;
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

  const setView = useCallback((next: HarnessView) => {
    setViewOverride(next);
    /*
     * `history.replaceState`, not a router push: switching view inside one destination is not a new
     * place a person navigated to, and pushing would make Back walk the segmented control instead of
     * leaving the screen. The address still carries the view so a refresh or a shared link reopens
     * it — the same grammar `/mcp` uses for its tabs.
     */
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    window.history.replaceState(
      window.history.state,
      '',
      buildHarnessViewHref(next, url.pathname, url.search) + url.hash,
    );
  }, []);

  useEffect(() => {
    /* Back and forward must move the view too; the address and the screen disagreeing is exactly
       what putting the view in the URL was meant to prevent. */
    const onPopState = () => {
      const params = new URL(window.location.href).searchParams;
      setViewOverride(parseHarnessView(params.get('view')));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const reportState = useHarnessReport(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    view !== 'structure',
    coverage.capabilityPaths,
    reloadNonce,
  );
  const report = reportState.status === 'ready' ? reportState.report : null;

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
      items={HARNESS_VIEW_ORDER.map((id) => ({ key: id, label: t(`views.${id}`) }))}
    />
  );

  const sentence = report ? (
    <div data-testid="harness-sentence" className="architecture-result-arrive">
      {/*
        ⚠️ **Demoted, so the finding can win.** This sentence and the coverage headline shared one
        token — `text-title` · emphasis · primary — 58px apart, and measured as ink-by-contrast the
        census was 2.5× the finding's mass: a reader met "N checks in place" before "no check names
        N domains" and read the reassuring one first. It is context, not the thesis, so it takes the
        subtitle step and leaves exactly one `text-title` line on the screen (design-lead,
        2026-09-13).
      */}
      <div className="flex max-w-prose flex-wrap items-center gap-x-1 break-keep text-body text-[color:var(--color-text-secondary)]">
        <span className="tabular-nums">
          {t('sentence', {
            documents: report.guideDocumentCount,
            checks: report.checks.total,
          })}
        </span>
        {/* `left`: this hint sits at the start of the lead paragraph, so a right-anchored panel
            ran 84.9% off the left edge at 390 (design-responsive, 2026-09-13). */}
        <InfoHint align="left" label={t('checksBreakdownLabel')}>
          {t('checksHint')}
        </InfoHint>
      </div>
      <p className="mt-1 text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
        {t('checksBreakdown', {
          hooks: report.checks.wiredHooks,
          gitHooks: report.checks.gitHooks,
          scripts: report.checks.scripts.length,
        })}
      </p>
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
        className={`flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-[color:var(--color-divider)] px-5 pb-0 md:px-10 ${PAGE_TOP_PAD}`}
      >
        <h1 className="pb-3 text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <div data-testid="harness-views" className="-mb-px min-w-0">
          {switcher}
        </div>
      </div>

      {view === 'structure' ? (
        <ArchitecturePage
          embedded
          harnessPanelId="harness-tabpanel-structure"
          harnessPanelLabelledBy="harness-tab-structure"
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
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-4 md:px-10 lg:pb-[var(--page-bottom-breath)]"
        >
          <div className="mx-auto w-full max-w-[var(--page-max)]">
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
            <div className="mb-5 flex flex-col gap-1">
              <p className="max-w-prose text-body-lg text-[color:var(--color-text-tertiary)]">
                {t('explainer')}
              </p>
              {sentence}
            </div>
            {reportState.status === 'ready' ? (
              <div className="architecture-result-arrive">
                {view === 'coverage' ? (
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
                    <p className="mt-6 font-mono text-caption text-[color:var(--color-text-quaternary)]">
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
              <EmptyState title={t('noSource')} description={t('noSourceBody')} />
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
              <EmptyState title={t('browserOnly')} description={t('browserOnlyBody')} />
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
