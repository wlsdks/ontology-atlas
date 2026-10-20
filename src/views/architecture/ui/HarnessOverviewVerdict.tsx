'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, TriangleAlert } from 'lucide-react';

import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';
import { cn } from '@/shared/lib/cn';
import { Button, RowDisclosure } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { HarnessOverview } from '../model/harness-overview';
import { COLUMN_KEYS } from './harness-overview-labels';

const AMBER_INK = 'text-[color:var(--color-amber-source-text-a95)]';

/** The answer first: how many gaps, which one, and the one action that hands them to an agent. */
export function HarnessOverviewVerdict({
  overview,
  sourceRoot,
  readingIsEmpty,
}: {
  overview: HarnessOverview;
  sourceRoot: string | null;
  readingIsEmpty: boolean;
}) {
  const t = useTranslations('harness');
  const requestId = useId();
  const [requestOpen, setRequestOpen] = useState(false);
  const [copyRefused, setCopyRefused] = useState(false);
  const feedback = useCopyFeedback();
  const gapCount = overview.gaps.length;
  const first = overview.gaps[0];
  const firstTitle = first ? (overview.rows.find((row) => row.slug === first.slug)?.title ?? first.slug) : '';

  const requestText = useMemo(() => {
    const [told, gated, watched] = overview.everywhere.map((cell) => cell.entries.length);
    return t('overviewRequest', {
      count: overview.gaps.length,
      folder: sourceRoot ?? '',
      everywhere: t('overviewRequestEverywhere', { told, gated, watched }),
      gaps: overview.gaps
        .map((gap) =>
          t('overviewRequestGapLine', {
            slug: gap.slug,
            column: t(COLUMN_KEYS[gap.column].head),
            paths: gap.paths.join(', '),
          }),
        )
        .join('\n'),
    });
  }, [overview, sourceRoot, t]);

  const copyRequest = async () => {
    setCopyRefused(false);
    setCopyRefused(!(await feedback.copy(requestText)));
  };

  const statusText = copyRefused
    ? t('overviewHandoffCopyFailed')
    : feedback.state === 'copied'
      ? t('overviewHandoffCopied')
      : t('overviewVerdictCaption');

  const name = (chunks: ReactNode) => (
    <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{chunks}</strong>
  );

  return (
    <section
      data-testid="harness-overview-gaps"
      data-gap-count={gapCount}
      className="shrink-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
    >
      <div className="flex flex-col gap-4 px-6 py-5 @[44rem]/slot:flex-row @[44rem]/slot:items-center @[44rem]/slot:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {first ? (
            <>
              <p className="flex items-center gap-2.5 text-display leading-display font-[var(--font-weight-strong)] tracking-[var(--tracking-display)] tabular-nums text-[color:var(--color-text-primary)]">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" />
                {t('overviewGapCount', { count: gapCount })}
              </p>
              <p className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                {gapCount === 1
                  ? t.rich('overviewVerdictOne', {
                      domain: firstTitle,
                      column: t(COLUMN_KEYS[first.column].head),
                      name,
                    })
                  : t.rich('overviewVerdictMany', {
                      domain: firstTitle,
                      column: t(COLUMN_KEYS[first.column].head),
                      rest: gapCount - 1,
                      name,
                    })}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2.5 text-title text-[color:var(--color-text-primary)]">
              <Check
                size={ICON_SIZE.md}
                aria-hidden
                className="shrink-0 text-[color:var(--color-success-text-a94)]"
              />
              {t('overviewNoGaps', { domains: overview.pathedDomainCount })}
            </p>
          )}
          {readingIsEmpty ? (
            <p className="text-body text-[color:var(--color-text-secondary)]">{t('emptyBody')}</p>
          ) : null}
        </div>
        {first ? (
          <div className="grid grid-cols-2 gap-2 @[44rem]/slot:flex @[44rem]/slot:flex-col @[44rem]/slot:items-end">
            <div className="contents @[44rem]/slot:flex @[44rem]/slot:gap-2">
              <Button
                variant="outline"
                size="md"
                data-testid="harness-overview-request-toggle"
                aria-expanded={requestOpen}
                aria-controls={requestId}
                onClick={() => setRequestOpen((open) => !open)}
              >
                {requestOpen ? t('overviewRequestHide') : t('overviewRequestShow')}
              </Button>
              <Button variant="primary" size="md" data-testid="harness-overview-handoff" onClick={copyRequest}>
                {t('overviewHandoff')}
              </Button>
            </div>
            <p
              role="status"
              data-testid="harness-overview-handoff-status"
              className={cn(
                'col-span-2 text-label @[44rem]/slot:col-auto',
                copyRefused ? AMBER_INK : 'text-[color:var(--color-text-quaternary)]',
              )}
            >
              {statusText}
            </p>
          </div>
        ) : null}
      </div>
      {first ? (
        <RowDisclosure open={requestOpen} id={requestId}>
          <pre
            data-testid="harness-overview-request"
            tabIndex={0}
            className="mx-6 mb-5 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-3 font-mono text-label text-[color:var(--color-text-secondary)]"
          >
            {requestText}
          </pre>
        </RowDisclosure>
      ) : null}
    </section>
  );
}

/** A calm note under the table: a script a config names that is not on disk is a guard that never runs. */
export function HarnessOverviewSilent({
  overview,
  onOpenGuides,
}: {
  overview: HarnessOverview;
  onOpenGuides: () => void;
}) {
  const t = useTranslations('harness');
  if (overview.missingHookScripts.length === 0) return null;
  return (
    <div
      data-testid="harness-overview-silent"
      className="shrink-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-body text-[color:var(--color-text-secondary)]">
        <span className="flex min-w-0 flex-1 basis-80 items-start gap-2.5">
          <TriangleAlert size={ICON_SIZE.sm} aria-hidden className={cn('mt-0.5 shrink-0', AMBER_INK)} />
          <span className="min-w-0">
            {t('anatomySilentGuards', {
              count: overview.missingHookScripts.length,
              scripts: overview.missingHookScripts.join(' · '),
            })}
          </span>
        </span>
        <Button variant="outline" size="sm" data-testid="harness-overview-silent-guides" onClick={onOpenGuides}>
          {t('overviewSilentOpenGuides')}
        </Button>
      </div>
    </div>
  );
}
