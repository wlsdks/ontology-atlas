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
import { useHarnessReport } from '../model/use-harness-report';
import { ArchitecturePage } from './ArchitecturePage';
import { HarnessGuidesView } from './HarnessGuidesView';
import { HarnessSensorsPlaceholder } from './HarnessSensorsPlaceholder';

/**
 * **The Harness destination: three views, and one sentence that only says what it measured.**
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
 *    beside it). The row costs the canvas far less than a stacked header, and the blueprint gives
 *    back the eyebrow and description it no longer needs to repeat.
 *
 * Everything that is the guides view's own data — the counted sentence and its parts — opens that
 * view's scrolling column rather than sitting in the fixed row: it is the view's content, and a
 * `shrink-0` band holding it is height the canvas cannot spare (design-responsive).
 *
 * The route is still `/architecture`. Only the label and what stands beside the blueprint changed,
 * so every existing link, bookmark and `?focus=` deep link lands exactly where it always did; the
 * blueprint is the default view for the same reason.
 *
 * **The sentence is the screen's thesis and its main risk.** Two numbers are computed from files —
 * guide documents found, checks declared — and both print their working: the check count shows its
 * three parts, and a caption states the counting rule, because a bare number invites the reader to
 * hear "N things are protecting you" when what was measured is "N things are declared". The third
 * clause of the sketched sentence, "N domains nobody guards", is **not** in the sentence. Leaving a
 * deferral inside a sentence whose other slots are numbers asserts that unguarded domains exist and
 * are merely uncounted, which no static read of a repository can claim. It sits on its own line, as
 * a question, and the sensors view it points at says plainly that it is not built (Evidence seat,
 * 2026-09-13).
 */

const EMPTY_DOCS: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];

function HarnessPageInner() {
  const t = useTranslations('harness');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [view, setViewState] = useState<HarnessView>(() =>
    parseHarnessView(searchParams.get('view')),
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();
  const docs = useMemo(
    () => (mode === 'static' ? staticManifest.docs : (localVault.manifest?.docs ?? EMPTY_DOCS)),
    [localVault.manifest, mode, staticManifest.docs],
  );
  const projectSlugs = useMemo(
    () =>
      docs
        .filter((doc) => doc.frontmatter.kind === 'project')
        .map((doc) => doc.frontmatter.slug)
        .filter((slug): slug is string => typeof slug === 'string'),
    [docs],
  );

  const setView = useCallback((next: HarnessView) => {
    setViewState(next);
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
      buildHarnessViewHref(next, url.pathname) + url.hash,
    );
  }, []);

  useEffect(() => {
    /* Back and forward must move the view too; the address and the screen disagreeing is exactly
       what putting the view in the URL was meant to prevent. */
    const onPopState = () => {
      setViewState(parseHarnessView(new URL(window.location.href).searchParams.get('view')));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const reportState = useHarnessReport(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    projectSlugs,
    view === 'guides',
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
      <div className="flex max-w-prose flex-wrap items-center gap-x-1 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
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
      {/* Deliberately its own line and its own grammar — see this file's header. */}
      <p
        className="mt-1 max-w-prose text-body text-[color:var(--color-text-quaternary)]"
        data-testid="harness-sentence-deferred"
      >
        {t('sentenceDeferred')}
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
        <div
          role="tabpanel"
          id={`harness-tabpanel-${view}`}
          aria-labelledby={`harness-tab-${view}`}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-[var(--topology-mobile-bottom-tab-reserve)] md:px-10 lg:pb-[var(--page-bottom-breath)]"
        >
          <div className="mx-auto w-full max-w-[var(--page-max)]">
            <p className="mb-4 max-w-prose text-body-lg text-[color:var(--color-text-tertiary)]">
              {t('explainer')}
            </p>
            {view === 'guides' ? sentence : null}
            {view === 'sensors' ? (
              <HarnessSensorsPlaceholder />
            ) : reportState.status === 'ready' ? (
              <>
                <HarnessGuidesView report={reportState.report} locale={locale} />
                <p className="mt-6 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {t('sourceRoot', { path: reportState.sourceRoot })}
                </p>
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
