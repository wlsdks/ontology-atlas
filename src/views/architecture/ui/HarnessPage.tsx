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
import { EmptyState, InfoHint } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
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
 * **하네스 — one destination, three views, and one sentence that only says what it measured.**
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
 * a question, and the 센서 view it points at says plainly that it is not built (Evidence seat,
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
  );
  const report = reportState.status === 'ready' ? reportState.report : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className={`shrink-0 px-5 md:px-10 ${PAGE_TOP_PAD}`}>
        <p className="text-caption font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
          {t('eyebrow')}
        </p>
        <h1 className="mt-1 text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
          {t('title')}
        </h1>
        <p className="mt-1 text-body-lg text-[color:var(--color-text-tertiary)]">
          {t('explainer')}
        </p>

        {report ? (
          <div className="mt-3" data-testid="harness-sentence">
            <p className="max-w-prose text-body-lg text-[color:var(--color-text-secondary)]">
              {t('sentence', {
                documents: report.guideDocumentCount,
                checks: report.checks.total,
              })}
              <InfoHint label={t('columnSize')} className="ml-1 align-middle">
                {t('checksHint')}
              </InfoHint>
            </p>
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
        ) : null}

        <div className="mt-4">
          <SegmentedControl
            ariaLabel={t('viewsAria')}
            testId="harness-views"
            value={view}
            onChange={setView}
            options={HARNESS_VIEW_ORDER.map((id) => ({
              value: id,
              label: t(`views.${id}`),
              testId: `harness-view-${id}`,
            }))}
          />
        </div>
      </header>

      {view === 'structure' ? (
        <ArchitecturePage embedded />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4 md:px-10">
          <div className="mx-auto w-full max-w-[var(--page-max)]">
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
              <EmptyState title={t('failed')} description={reportState.message} />
            ) : (
              /* The browser can see no dot directory at all, so it does not draw a shorter list
                 and call it the harness. */
              <EmptyState
                title={t('browserOnly')}
                description={t('browserOnlyBody')}
              />
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
