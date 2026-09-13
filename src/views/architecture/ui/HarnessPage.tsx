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
import { Chip, EmptyState, InfoHint, TabBar } from '@/shared/ui';
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

/**
 * **The Harness destination: one spine, and two views that detail it.**
 *
 * The spine is the **coverage matrix** — this repository's own areas on the rows, and what tells,
 * gates and watches each one on the columns. That is the view this destination is for, so it is the
 * default and the first tab. The other two are details of it: `guides` is the per-file inventory
 * with its citations, `structure` the reviewed layer ladder. `?view=sensors` — the view that named
 * this question and said it was not built — resolves to the matrix, and a `?role=` link still opens
 * the ladder that can show a role (`harness-view-state.ts`).
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
  const addressView = parseHarnessView(searchParams.get('view'), {
    hasRole: searchParams.has('role'),
  });
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
      setViewOverride(parseHarnessView(params.get('view'), { hasRole: params.has('role') }));
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
    <div className="mb-4" data-testid="harness-sentence">
      {/*
        ⚠️ **Demoted, so the finding can win.** This sentence and the coverage headline shared one
        token — `text-title` · emphasis · primary — 58px apart, and measured as ink-by-contrast the
        census was 2.5× the finding's mass: a reader met "N checks in place" before "no check names
        N domains" and read the reassuring one first. It is context, not the thesis, so it takes the
        subtitle step and leaves exactly one `text-title` line on the screen (design-lead,
        2026-09-13).
      */}
      <div className="flex max-w-prose flex-wrap items-center gap-x-1 break-keep text-body-lg text-[color:var(--color-text-secondary)]">
        <span className="tabular-nums">
          {t('sentence', {
            documents: report.guideDocumentCount,
            checks: report.checks.total,
          })}
        </span>
        <InfoHint label={t('checksBreakdownLabel')}>{t('checksHint')}</InfoHint>
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
        className={`flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 md:px-10 ${PAGE_TOP_PAD}`}
      >
        <h1 className="text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <div data-testid="harness-views">{switcher}</div>
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
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] md:px-10 lg:pb-[var(--page-bottom-breath)]"
        >
          <div className="mx-auto w-full max-w-[var(--page-max)]">
            <p className="mb-4 max-w-prose text-body-lg text-[color:var(--color-text-tertiary)]">
              {t('explainer')}
            </p>
            {sentence}
            {reportState.status === 'ready' ? (
              <>
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
              </>
            ) : reportState.status === 'loading' ? (
              <p className="text-body text-[color:var(--color-text-tertiary)]">{t('loading')}</p>
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
