'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import {
  useDataSourceMode,
  useLocalVault,
  useStaticVaultSource,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { isTauriVaultRuntime } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { RefreshCw } from 'lucide-react';

import { Button, buttonVariants, Chip, EmptyState, PageHeaderBar, Surface, TabBar } from '@/shared/ui';
import { PlacedInfoHint } from './PlacedInfoHint';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { GuidanceRelationshipPreview } from '@/widgets/relationship-preview';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

import {
  buildHarnessViewHref,
  defaultViewForSurface,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
  rewriteRetiredView,
  type HarnessView,
} from '../lib/harness-view-state';
import { deriveCoverageAreas } from '@/features/harness-report';
import { useHarnessReport } from '@/features/harness-report';
import { ArchitecturePage } from './ArchitecturePage';
import { HarnessGuidesView } from './HarnessGuidesView';
import { HarnessOverviewView } from './HarnessOverviewView';
import { HarnessScanProgressPanel } from './HarnessScanProgressPanel';
import { HARNESS_FRAME_CONTAINER, HARNESS_GUTTER_X } from './harness-frame';

/** The Harness destination. One chrome row holds the `h1` and the single tab set, so the ladder keeps its height. */

/**
 * How long a read may take before the progress screen is shown. 1000ms is the response-time limit
 * where a person starts wondering whether the system is working (Miller 1968; Card, Robertson and
 * Mackinlay 1991). No minimum visible duration: holding the panel would delay the answer.
 */
const PROGRESS_REVEAL_MS = 1000;

/** The guides workbench owns the panel's height where its two panes sit side by side, and scrolls with the page below that. */
const GUIDES_FILL = 'flex flex-1 flex-col @min-[48rem]/harness:min-h-0';

/** The read never changes within a session, so nothing has to be watched. */
const subscribeNever = () => () => {};

/** The server's answer is the browser's: a static export is built with no desktop bridge. */
const readHarnessSurfaceOnServer = () => false;

function failedReasonKey(code: string | null) {
  if (code === 'source-root-not-granted') return 'failedNotGranted';
  if (code === 'harness-source-missing') return 'failedMissing';
  if (code === 'harness-unsupported-platform') return 'failedUnsupported';
  return 'failedBody';
}

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
  const tabpanelRef = useRef<HTMLDivElement>(null);
  const rereadHarness = useCallback(() => {
    tabpanelRef.current?.focus({ preventScroll: true });
    setReloadNonce((n) => n + 1);
  }, []);
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
    const rewritten = rewriteRetiredView(window.location.search);
    if (rewritten === null) return;
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, '', pathname + rewritten + hash);
  }, [searchParams]);

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
  const draftSource = useMemo(() => {
    if (reportState.status !== 'ready' || reportState.report.topLevelFolders.length === 0) return null;
    const name = reportState.sourceRoot.split(/[\\/]+/).filter(Boolean).pop();
    return name ? { name, folders: reportState.report.topLevelFolders } : null;
  }, [reportState]);
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
    harnessUnavailable && requestedView !== 'architecture' ? 'overview' : requestedView;

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
      variant="segmented"
      idPrefix="harness"
      activeKey={view}
      onSelect={(key) => setView(parseHarnessView(key))}
      items={
        harnessUnavailable
          ? [
              { key: 'overview', label: t('views.overview') },
              { key: 'architecture', label: t('views.architecture') },
            ]
          : HARNESS_VIEW_ORDER.map((id) => ({ key: id, label: t(`views.${id}`) }))
      }
    />
  );

  /* `relative z-10` on the wrapper keeps this block's hint panel above the later results block; the panel's own `z-30` only orders it among siblings. */
  const sentence = report ? (
    <div data-testid="harness-sentence" className="architecture-result-arrive relative z-10">
      {/* The thesis takes the one step above body, at regular weight, still lighter than the cards' numerals. */}
      <div className="max-w-prose text-pretty text-title text-[color:var(--color-text-primary)]">
        <span className="tabular-nums">
          {t('sentence', {
            documents: report.guideDocumentCount,
            checks: report.checks.total,
          })}
        </span>
        {/* No-break space in a nowrap run: the hint never wraps away from the last word. */}
        <span className="whitespace-nowrap">
          {'\u00a0'}
          <PlacedInfoHint preferred="left" className="align-middle" label={t('checksBreakdownLabel')}>
            {t('checksHint')}
          </PlacedInfoHint>
        </span>
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

  const fillsPanel = view === 'guides' && reportState.status === 'ready';
  const overviewFills = view === 'overview' && reportState.status === 'ready';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', HARNESS_FRAME_CONTAINER)}>
      <PageHeaderBar
        frame="harness"
        title={t('title')}
        tabsTestId="harness-views"
        tabs={switcher}
        actions={
          overviewFills ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="harness-overview-retry"
              className="border-[color:var(--color-border-soft)] text-body text-[color:var(--color-text-secondary)]"
              onClick={rereadHarness}
            >
              <RefreshCw size={ICON_SIZE.sm} aria-hidden />
              <span className="max-sm:sr-only">{t('overviewReread')}</span>
            </Button>
          ) : null
        }
      />

      {view === 'architecture' ? (
        <ArchitecturePage
          embedded
          draftSource={draftSource}
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
          ref={tabpanelRef}
          /* Tab-bar reserve plus breath, the calc `globals.css` uses for the download band below `lg`. */
          /* The header row ends in a rule, not padding, so the body brings its own top inset. */
          className={cn('min-h-0 flex-1 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] lg:pb-[var(--page-bottom-breath)] max-lg:scroll-pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
            HARNESS_GUTTER_X,
            overviewFills ? 'flex flex-col overflow-hidden pt-6' : 'overflow-y-auto pt-4',
            fillsPanel && 'flex flex-col')}
        >
          <div className={cn('w-full', overviewFills && 'flex min-h-0 flex-1 flex-col', fillsPanel && GUIDES_FILL)}>
            {/* One lead: the explainer and the census are a paragraph and its measurement, so they share a block. */}
            {overviewFills ? null : (
              <div className="mb-3 flex shrink-0 flex-col gap-1">
                <p className="max-w-prose text-body text-[color:var(--color-text-tertiary)]">
                  {t('explainer')}
                </p>
                {view === 'guides' ? sentence : null}
              </div>
            )}
            {reportState.status === 'ready' ? (
              <div className={cn('architecture-result-arrive', view === 'overview' && 'flex min-h-0 flex-1 flex-col', fillsPanel && GUIDES_FILL)}>
                {view === 'overview' ? (
                  <HarnessOverviewView
                    key={reloadNonce}
                    report={reportState.report}
                    areas={coverage.areas}
                    pathlessCapabilities={coverage.pathlessCapabilities}
                    sourceRoot={reportState.sourceRoot}
                    onOpenGuides={() => setView('guides')}
                  />
                ) : (
                  <HarnessGuidesView report={reportState.report} locale={locale} sourceRoot={reportState.sourceRoot} />
                )}
              </div>
            ) : reportState.status === 'loading' ? (
              /*
                Nothing until the read outlasts the threshold; a `Surface` for its entrance but no exit,
                since the ternary unmounts the branch as the read finishes. an `overlay`,
                not a `chrome`, surface: the `globals.css` note records why a large surface moves on brightness alone.
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
                description={
                  <span data-testid="harness-failed-reason" data-failure-code={reportState.code ?? ''} data-failure-detail={reportState.message}>
                    {t(failedReasonKey(reportState.code), { path: reportState.sourceRoot })}
                  </span>
                }
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
