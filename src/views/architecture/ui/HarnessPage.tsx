import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useDataSourceMode, useLocalVault, useOpenFolderManifest } from '@/entities/vault-session';
import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import { RefreshCw } from 'lucide-react';

import { Button, FeatureStage, PageHeaderBar, RouteLoadingFallback, Surface, TabBar } from '@/shared/ui';
import { BrandPortrait } from '@/shared/ui/marks/moru/brand-portrait';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { cn } from '@/shared/lib/cn';

import {
  buildHarnessViewHref,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
  type HarnessSearch,
  type HarnessView,
} from '../lib/harness-view-state';
import { useHarnessReport } from '@/features/harness-report';
import { HarnessScanProgressPanel, HarnessSetupView } from '@/widgets/harness-setup';
import {
  useHarnessScopes,
  WhereSettingsButton,
  WhereSettingsDialog,
  type WhereSettingsRequest,
} from '@/widgets/harness-scopes';
import { ArchitecturePage } from './ArchitecturePage';
import { HarnessConnectSource } from './HarnessConnectSource';
import { HARNESS_FRAME_CONTAINER, HARNESS_GUTTER_X } from './harness-frame';
import { currentAddress, guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

/**
 * How long a read may take before the progress screen is shown: the app's anti-flash delay, the
 * same 400ms `route-loading-in` waits. No minimum visible duration: holding the panel would delay
 * the answer.
 */
const PROGRESS_REVEAL_MS = 400;

function failedReasonKey(code: string | null) {
  if (code === 'source-root-not-granted') return 'failedNotGranted';
  if (code === 'harness-source-missing') return 'failedMissing';
  if (code === 'harness-unsupported-platform') return 'failedUnsupported';
  return 'failedBody';
}

function HarnessPageInner({ search }: { search: HarnessSearch }) {
  const t = useTranslations('harness');
  /* A press shows its view at once and wins until the address next moves; the router hands the address back a moment later. */
  const [viewOverride, setViewOverride] = useState<HarnessView | null>(null);
  const [seenSearch, setSeenSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    setViewOverride(null);
  }
  const [reloadNonce, setReloadNonce] = useState(0);
  const tabpanelRef = useRef<HTMLDivElement>(null);
  const rereadHarness = useCallback(() => {
    tabpanelRef.current?.focus({ preventScroll: true });
    setReloadNonce((n) => n + 1);
  }, []);
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const docs = useOpenFolderManifest().docs;
  const projectSlugs = useMemo(
    () =>
      docs
        .filter((doc) => doc.frontmatter.kind === 'project')
        .map((doc) => doc.frontmatter.slug)
        .filter((slug): slug is string => typeof slug === 'string'),
    [docs],
  );

  /* Not gated on the view: a reading decides what Overview shows. With no folder loaded the hook returns `unsupported` at no cost. */
  const reportState = useHarnessReport(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    reloadNonce,
  );
  const scopesRead = useHarnessScopes(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    reloadNonce,
  );
  const scopes = scopesRead.state.status === 'ready' ? scopesRead.state.scopes : null;
  const [whereRequest, setWhereRequest] = useState<WhereSettingsRequest | null>(null);
  const draftSource = useMemo(() => {
    if (reportState.status !== 'ready' || reportState.report.topLevelFolders.length === 0) return null;
    const name = reportState.sourceRoot.split(/[\\/]+/).filter(Boolean).pop();
    return name ? { name, folders: reportState.report.topLevelFolders } : null;
  }, [reportState]);
  const view: HarnessView = viewOverride ?? resolveAddressView(search);

  const setView = useCallback(
    (next: HarnessView) => {
      setViewOverride(next);
      /*
       * A replace through the history door, not a router push: a view switch is not a new place, and Back should
       * leave the screen.
       */
      const written = currentAddress();
      guardedHistoryWrite('replace', buildHarnessViewHref(next, written.pathname, written.search) + written.hash);
    },
    [],
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
      items={HARNESS_VIEW_ORDER.map((id) => ({ key: id, label: t(`views.${id}`) }))}
    />
  );

  const overviewFills = view === 'overview' && reportState.status === 'ready';
  const staged = (reportState.status === 'no-source' || reportState.status === 'failed') && view !== 'architecture';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', HARNESS_FRAME_CONTAINER)}>
      <PageHeaderBar
        frame="harness"
        title={t('title')}
        tabsTestId="harness-views"
        tabs={switcher}
        actions={
          <>
          {view !== 'architecture' ? <WhereSettingsButton onClick={() => setWhereRequest({})} /> : null}
          {overviewFills ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="harness-overview-retry"
              className="border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]"
              onClick={rereadHarness}
            >
              <RefreshCw size={ICON_SIZE.sm} aria-hidden />
              <span className="max-sm:sr-only">{t('reread')}</span>
            </Button>
          ) : null}
          </>
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
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
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
            (staged || loading) && 'flex flex-col')}
        >
          <div className={cn('w-full', (overviewFills || staged || loading) && 'flex min-h-0 flex-1 flex-col')}>
            {reportState.status === 'ready' ? (
              <div className="architecture-result-arrive flex min-h-0 flex-1 flex-col">
                <HarnessSetupView
                  key={reloadNonce}
                  report={reportState.report}
                  sourceRoot={reportState.sourceRoot}
                  scopes={scopes}
                  scopesReading={scopesRead.state.status === 'reading'}
                  onExplainScope={(tool, row) => setWhereRequest({ tool, kind: 'hooks', row })}
                />
              </div>
            ) : reportState.status === 'loading' ? (
              /*
                Entrance only: the ternary unmounts the branch as the read finishes. An `overlay`, not a
                `chrome`, surface: the `globals.css` note records why a large surface moves on brightness alone.
              */
              <Surface
                open={waitedPastThreshold}
                motion="overlay"
                className="flex min-h-0 flex-1 flex-col justify-center"
              >
                <HarnessScanProgressPanel progress={reportState.progress} />
              </Surface>
            ) : reportState.status === 'no-source' && localVault.handle ? (
              <HarnessConnectSource
                vaultHandle={localVault.handle}
                projectSlug={projectSlugs[0] ?? null}
                docs={localVault.manifest?.docs}
                onConnected={rereadHarness}
              />
            ) : reportState.status === 'failed' ? (
              <FeatureStage
                data-testid="harness-failed-stage"
                art={() => <div className="flex justify-center"><BrandPortrait expression="curious" /></div>}
                title={t('failed')}
                body={
                  <span className="break-words" data-testid="harness-failed-reason" data-failure-code={reportState.code ?? ''} data-failure-detail={reportState.message}>
                    {t(failedReasonKey(reportState.code), { path: reportState.sourceRoot })}
                  </span>
                }
                action={
                  <Button variant="outline" size="lg" data-testid="harness-retry" className="atlas-touch-floor atlas-touch-floor-wide" onClick={() => setReloadNonce((n) => n + 1)}>
                    {t('retry')}
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
        </main>
      )}
      <WhereSettingsDialog
        request={whereRequest}
        onClose={() => setWhereRequest(null)}
        scopes={scopes}
        report={reportState.status === 'ready' ? reportState.report : null}
        pickOutcome={scopesRead.lastPick}
        onPick={(title) => void scopesRead.pick(title)}
      />
    </div>
  );
}

/** The exported HTML holds only the neutral loading surface: a restored folder is known after hydration. */
export function HarnessPage({ search }: { search: HarnessSearch }) {
  const hydrated = useHydrated();
  return hydrated ? <HarnessPageInner search={search} /> : <RouteLoadingFallback />;
}
