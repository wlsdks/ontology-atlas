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
import { buttonVariants, Chip, EmptyState, Surface, TabBar } from '@/shared/ui';
import { PlacedInfoHint } from './PlacedInfoHint';
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
 * The Harness destination: the coverage matrix is its spine (`?view=coverage`), with views that
 * detail it; `?view=sensors` resolves to the matrix (`harness-view-state.ts`). One chrome row holds
 * the `h1` and the single tab set above every panel: a stacked header pushed the seventh role below
 * the fold at 1280x800 (`architecture-workbench.spec.ts`), and tabs inside the workbench vanish on
 * its early empty return. The census sentence prints its working, because a bare number reads as
 * "N things protect you" when what was measured is "N things are declared".
 */

/**
 * How long a read may take before the progress screen is shown. 1000ms is the response-time limit
 * where a person starts wondering whether the system is working (Miller 1968; Card, Robertson and
 * Mackinlay 1991). No minimum visible duration: holding the panel would delay the answer.
 */
const PROGRESS_REVEAL_MS = 1000;

/** The read never changes within a session, so nothing has to be watched. */
const subscribeNever = () => () => {};

/** The server's answer is the browser's: a static export is built with no desktop bridge. */
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
   * The address is read on every render: `useSearchParams()` is empty during a static export's
   * prerender, so a `useState` initializer would lose the named view. A press wins until the next
   * history move, because `setView` uses `replaceState`, which `useSearchParams` does not observe.
   */
  const [viewOverride, setViewOverride] = useState<HarnessView | null>(null);
  /*
   * The server snapshot is `false`, the browser's answer the exported HTML must carry; the client
   * reads the real runtime. `useSyncExternalStore` makes the first client render correct with no
   * hydration mismatch.
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
  /* Derived here so the scan knows which implementation paths exist before probing the disk per candidate. */
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
    /* Back and forward move the view too, so the address and the screen never disagree. */
    const onPopState = () => {
      const params = new URL(window.location.href).searchParams;
      setViewOverride(resolveAddressView(params, isTauriVaultRuntime()));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /* Not gated on the view: the arrival view depends on whether a reading exists. Without a bridge the hook returns `unsupported` at no cost. */
  const reportState = useHarnessReport(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    surfaceHasBridge,
    coverage.capabilityPaths,
    reloadNonce,
  );
  const report = reportState.status === 'ready' ? reportState.report : null;
  /*
   * A bridge is not a harness: a Tauri-shaped stub has one with no connected source. `unsupported`
   * and `no-source` send the arrival to the blueprint; a named `?view=` still wins.
   */
  const harnessUnavailable =
    reportState.status === 'unsupported' || reportState.status === 'no-source';
  const canReadHarness = surfaceHasBridge && !harnessUnavailable;
  const addressView = resolveAddressView(searchParams, canReadHarness);
  /* A press wins over the address until the next history move; see `setView`. */
  const requestedView = viewOverride ?? addressView;
  /* Before a reading exists the three harness views draw the same example, so they collapse into one tab until a reading arrives. */
  const view: HarnessView =
    harnessUnavailable && requestedView !== 'architecture' ? 'structure' : requestedView;

  const setView = useCallback(
    (next: HarnessView) => {
      setViewOverride(next);
      /*
       * `history.replaceState`, not a router push: a view switch is not a new place, and Back should
       * leave the screen. Only this surface's own arrival view may go unwritten, so the writer gets
       * the same default `resolveAddressView(..., canReadHarness)` reads with.
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

  /* `loading` stays true for the whole read, so this starts one timer per read; the panel appears only if the read outlasts it. */
  const loading = reportState.status === 'loading';
  const [waitedPastThreshold, setWaitedPastThreshold] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setWaitedPastThreshold(true), PROGRESS_REVEAL_MS);
    /* The reset lives in the cleanup: a setState in the effect body cascades renders and `react-hooks/set-state-in-effect` refuses it. */
    return () => {
      window.clearTimeout(timer);
      setWaitedPastThreshold(false);
    };
  }, [loading]);

  const switcher = (
    /* A tab set, not a radiogroup: the labels swap whole panels (APG), and specs assert no `radio` role on this route. */
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

  /* `relative z-10` on the wrapper keeps this block's hint panel above the later results block; the panel's own `z-30` only orders it among siblings. */
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
      {/* The thesis takes the one step above body, at regular weight, still lighter than the cards' numerals. */}
      <div className="flex max-w-prose flex-wrap items-center gap-x-1 text-title text-[color:var(--color-text-primary)]">
        <span className="tabular-nums">
          {t('sentence', {
            documents: report.guideDocumentCount,
            checks: report.checks.total,
          })}
        </span>
        {/* Hangs from its own button and flips to the edge that fits at every width. */}
        <PlacedInfoHint preferred="left" label={t('checksBreakdownLabel')}>
          {t('checksHint')}
        </PlacedInfoHint>
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

  /* The structure view's thesis in its own unit: how many harness places this repository fills, the split every row prints. */
  const structureSentence = structureCount ? (
    <div data-testid="harness-structure-sentence" className="architecture-result-arrive relative z-10">
      <p className="max-w-prose text-title tabular-nums text-[color:var(--color-text-primary)]">
        {t('structureSentence', structureCount)}
      </p>
      {/* Inline flow, not flex, and not held to the prose measure, so the hint stays on the caption's line. */}
      <div className="mt-1 break-keep text-label text-[color:var(--color-text-tertiary)]">
        <span>{t('anatomyCaption')} </span>
        <PlacedInfoHint preferred="left" className="align-middle" label={t('anatomyProvenanceLabel')}>
          {t('anatomyProvenance')}
        </PlacedInfoHint>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', HARNESS_FRAME_CONTAINER)}>
      {/* The name and the one tab set share a line, so the title never moves and tabs stay under the pointer. */}
      <div
        /*
         * The rail makes these read as tabs: `border-b` on the row, `items-end` and `-mb-px` so the
         * tab strip's border lands on it. A separate tab row would cost 36px the blueprint does not
         * have at 1280x800 (`architecture-workbench.spec.ts`).
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
          * The panel is the `main` landmark (the skip link and sweeps wait on it). `role="tabpanel"`
          * overrides the implicit landmark role, so the landmark is outside and the tabpanel inside.
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
          /* Tab-bar reserve plus breath, the calc `globals.css` uses for the download band below `lg`. */
          /* `pt-4`: the header row ends in a rule, not padding. */
          className={cn('min-h-0 flex-1 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-4 lg:pb-[var(--page-bottom-breath)] max-lg:scroll-pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
            HARNESS_GUTTER_X,
            view === 'structure' && reportState.status === 'ready' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}
        >
          <div className={cn('w-full', view === 'structure' && reportState.status === 'ready' && 'flex min-h-0 flex-1 flex-col')}>
            {/* One lead: the explainer and the census are a paragraph and its measurement, so they share a block. */}
            <div className="mb-3 flex shrink-0 flex-col gap-1">
              <p className="max-w-prose text-body text-[color:var(--color-text-tertiary)]">
                {t('explainer')}
              </p>
              {/* Not on the structure view: the census counts a mirrored guard twice, the bands below once, so both would argue. The matrix and table share its rule. */}
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
                    {/* The coverage view prints the read path in its closing line; the guides view keeps this one. */}
                    <p className="mt-6 font-mono text-label text-[color:var(--color-text-quaternary)]">
                      {t('sourceRoot', { path: reportState.sourceRoot })}
                    </p>
                  </>
                )}
              </div>
            ) : reportState.status === 'loading' ? (
              /*
                Nothing until the read outlasts the threshold. A `Surface` for a real 180ms entrance
                on `map-overlay-in`; no exit, because the status ternary unmounts the branch in the
                same commit the read finishes. `overlay`, not `chrome`: `globals.css` records why a
                large surface moves on brightness alone.
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
                  <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('noSource')}</p>
                  <p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('noSourceBody')}</p>
                  {/* Under the sentence it answers, on its start line; the standard primary `Button`, since the pill is for a state or a count. */}
                  <Link href="/projects/" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide mt-4')}>{t('connectSourceAction')}</Link>
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
              /* The browser sees no dot directory, so it does not draw a shorter list and call it the harness. */
              <GuidanceRelationshipPreview footer={<>
                <div className="min-w-0 max-w-prose">
                  <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('browserOnly')}</p>
                  <p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('browserOnlyBody')}</p>
                  <Link href="/download/" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide mt-4')}>{t('browserAction')}</Link>
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
