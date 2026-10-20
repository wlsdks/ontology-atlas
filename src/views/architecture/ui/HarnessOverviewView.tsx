'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TriangleAlert } from 'lucide-react';

import type { CoverageAreaInput, CoverageColumn, HarnessReport } from '@/entities/agent-files';
import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';
import { cn } from '@/shared/lib/cn';
import { useViewportBelow } from '@/shared/lib/use-viewport-below';
import { Button, Chip, Disclosure, EmptyState, RowDisclosure, Surface } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  buildHarnessOverview,
  EVERYWHERE_ROW,
  OVERVIEW_COLUMNS,
  overviewCellKey,
  type OverviewCell,
  type OverviewRow,
  type OverviewTarget,
} from '../model/harness-overview';
import { COLUMN_KEYS, HarnessOverviewPanel, type TranslateFn } from './HarnessOverviewPanel';
import { PlacedInfoHint } from './PlacedInfoHint';

const PANEL_BESIDE_FROM_PX = 1280;

const HINT_ANCHOR: Readonly<Record<CoverageColumn, 'left' | 'center' | 'right'>> = {
  told: 'left',
  gated: 'center',
  watched: 'right',
};

const RULE = 'border-t border-[color:var(--color-border-soft)]';

const AMBER = 'text-[color:var(--color-amber-source-a90)]';

function rowSlugOf(target: OverviewTarget | undefined): string | null {
  if (!target) return null;
  if (target.kind === 'cell') return target.cell.row;
  if (target.kind === 'everywhere') return EVERYWHERE_ROW;
  return target.row.slug;
}

function hostSuffix(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function HarnessOverviewView({
  report,
  areas,
  pathlessCapabilities,
  sourceRoot,
  onReread,
  onOpenGuides,
}: {
  report: HarnessReport;
  areas: readonly CoverageAreaInput[];
  pathlessCapabilities: number;
  sourceRoot: string | null;
  onReread: () => void;
  onOpenGuides: () => void;
}) {
  const t = useTranslations('harness');
  const baseId = useId();
  const below = useViewportBelow(PANEL_BESIDE_FROM_PX);
  const overview = useMemo(() => buildHarnessOverview(report, areas), [report, areas]);

  const [touched, setTouched] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [pressedLast, setPressedLast] = useState<string | null>(null);
  const firstGap = overview.gaps[0];
  const arrivalKey = !below && firstGap ? overviewCellKey(firstGap.slug, firstGap.column) : null;
  const openKey = touched ? pressedKey : arrivalKey;
  const lastKey = touched ? pressedLast : arrivalKey;
  const [lastByRow, setLastByRow] = useState<Readonly<Record<string, string>>>({});
  const [epoch, setEpoch] = useState(0);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  const settle = useCallback(() => {
    if (touched) return;
    setTouched(true);
    setPressedLast(lastKey);
  }, [touched, lastKey]);

  const closePanel = useCallback(() => {
    settle();
    if (openKey) cellRefs.current.get(openKey)?.focus();
    setPressedKey(null);
  }, [openKey, settle]);

  const pressCell = (key: string) => {
    settle();
    if (openKey === key) {
      setPressedKey(null);
      return;
    }
    const row = rowSlugOf(overview.targets.get(key));
    if (row === null) return;
    const previousRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;
    if (below ? previousRow !== row : openKey === null) setEpoch((value) => value + 1);
    setPressedKey(key);
    setPressedLast(key);
    setLastByRow((current) => ({ ...current, [row]: key }));
  };

  useEffect(() => {
    if (openKey === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openKey, closePanel]);

  const hostRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;
  useEffect(() => {
    if (!below || hostRow === null) return;
    const host = document.getElementById(`${baseId}-panel-${hostSuffix(hostRow)}`);
    if (!host) return;
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const scroller = host.closest<HTMLElement>('[data-testid="harness-overview-scroll"]');
    const rowElement = host.closest('tr')?.previousElementSibling;
    const head = scroller?.querySelector('thead th');
    if (!scroller || !rowElement || !head) return;
    const reveal = () => {
      const frame = scroller.getBoundingClientRect();
      const fromTop = (rect: DOMRect) => rect.top - frame.top + scroller.scrollTop;
      const rowTop = fromTop(rowElement.getBoundingClientRect()) - head.getBoundingClientRect().height;
      const panelBottom = fromTop(host.getBoundingClientRect()) + host.getBoundingClientRect().height;
      const needed = panelBottom - scroller.clientHeight;
      const top = needed <= rowTop ? Math.min(Math.max(scroller.scrollTop, needed), rowTop) : rowTop;
      scroller.scrollTo({ top, behavior });
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(host);
    const stop = window.setTimeout(() => observer.disconnect(), 500);
    return () => {
      window.clearTimeout(stop);
      observer.disconnect();
    };
  }, [below, hostRow, openKey, baseId]);

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

  const feedback = useCopyFeedback();
  const [copyRefused, setCopyRefused] = useState(false);
  const copyRequest = async () => {
    setCopyRefused(false);
    setCopyRefused(!(await feedback.copy(requestText)));
  };

  if (overview.pathedDomainCount === 0) {
    return (
      <section data-testid="harness-overview" className="flex flex-col gap-4">
        <EmptyState
          title={t('coverageNoAreasTitle')}
          description={t('coverageNoAreasBody', { documents: report.guideDocumentCount })}
          action={
            <Chip data-testid="harness-overview-guides" onClick={onOpenGuides}>
              {t('views.guides')}
            </Chip>
          }
        />
      </section>
    );
  }

  const gapCount = overview.gaps.length;
  const statusText = copyRefused
    ? t('overviewHandoffCopyFailed')
    : feedback.state === 'copied'
      ? t('overviewHandoffCopied')
      : t('overviewHandoffHint');
  const panelHostId = (slug: string) => `${baseId}-panel-${below ? hostSuffix(slug) : 'beside'}`;
  const titleId = (slug: string) => `${baseId}-title-${below ? hostSuffix(slug) : 'beside'}`;
  const openRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;

  const onTabHandoff = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (below || event.key !== 'Tab' || openKey === null) return;
    const target = event.target as HTMLElement;
    const host = document.getElementById(panelHostId(''));
    if (!event.shiftKey && target.getAttribute('aria-expanded') === 'true' && host) {
      event.preventDefault();
      host.focus();
    } else if (event.shiftKey && target === host) {
      event.preventDefault();
      cellRefs.current.get(openKey)?.focus();
    }
  };

  const footer = (
    <div className={cn('flex flex-col gap-2', below ? 'mt-3 px-3' : 'max-h-48 shrink-0 overflow-y-auto')}>
      <p className="text-label text-[color:var(--color-text-quaternary)]">{t('overviewCellHint')}</p>
      <ProvenanceNotes overview={overview} pathlessCapabilities={pathlessCapabilities} t={t} />
    </div>
  );

  const renderCellButton = (
    cell: OverviewCell,
    state: 'filled' | 'gap' | 'everywhere',
    label: string,
    ruled: boolean,
  ) => {
    const open = openKey === cell.key;
    const count = cell.entries.length;
    return (
      <td key={cell.column} className={cn('h-px p-0 align-middle', ruled && RULE)}>
        <button
          type="button"
          ref={(node) => {
            if (node) cellRefs.current.set(cell.key, node);
            else cellRefs.current.delete(cell.key);
          }}
          onClick={() => pressCell(cell.key)}
          aria-expanded={open}
          aria-controls={open ? panelHostId(cell.row) : undefined}
          aria-label={t('coverageOpenNames', {
            area: label,
            column: t(COLUMN_KEYS[cell.column].head),
            count,
          })}
          data-harness-cell={cell.column}
          data-harness-cell-state={state}
          className={controlClass({
            shape: 'row',
            size: 'md',
            hoverSurface: 'lift',
            active: open,
            className: 'h-full items-center justify-start gap-2 px-3 py-3',
          })}
        >
          {state === 'gap' ? (
            <>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" />
              <span className={cn('whitespace-nowrap text-body font-[var(--font-weight-emphasis)]', AMBER)}>
                {t('coverageNone')}
              </span>
            </>
          ) : (
            <span
              className={cn(
                'text-body tabular-nums',
                count === 0 ? 'text-[color:var(--color-text-quaternary)]' : 'text-[color:var(--color-text-primary)]',
              )}
            >
              {count}
            </span>
          )}
        </button>
      </td>
    );
  };

  const panelRow = (slug: string) => {
    const key = lastByRow[slug];
    const open = openRow === slug;
    return (
      <tr key={`${slug}-panel`} aria-hidden={!open || undefined}>
        <td colSpan={4} className="p-0">
          <RowDisclosure open={open} id={panelHostId(slug)}>
            {key ? (
              <div role="region" aria-labelledby={titleId(slug)} className="px-3 pb-3">
                <HarnessOverviewPanel
                  overview={overview}
                  targetKey={key}
                  epoch={epoch}
                  placement="below"
                  onClose={closePanel}
                  titleId={titleId(slug)}
                />
              </div>
            ) : null}
          </RowDisclosure>
        </td>
      </tr>
    );
  };

  const renderRow = (row: OverviewRow, index: number) => {
    const ruled = index > 0;
    const pathKey = overviewCellKey(row.slug, 'path');
    return [
      <tr key={row.slug} data-harness-area={row.slug}>
        <th scope="row" className={cn('px-3 py-3 text-left align-middle font-normal', ruled && RULE)}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {row.title}
            </span>
            <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t('coveragePathCount', { count: row.paths.length })}
            </span>
          </span>
        </th>
        {row.cells === null ? (
          <td colSpan={3} className={cn('h-px p-0 align-middle', ruled && RULE)}>
            <button
              type="button"
              ref={(node) => {
                if (node) cellRefs.current.set(pathKey, node);
                else cellRefs.current.delete(pathKey);
              }}
              onClick={() => pressCell(pathKey)}
              aria-expanded={openKey === pathKey}
              aria-controls={openKey === pathKey ? panelHostId(row.slug) : undefined}
              data-harness-cell="path"
              data-harness-cell-state="no-path"
              className={controlClass({
                shape: 'row',
                size: 'md',
                hoverSurface: 'lift',
                active: openKey === pathKey,
                className: 'h-full items-center justify-start px-3 py-3 text-body text-[color:var(--color-text-tertiary)]',
              })}
            >
              {t('overviewNoPath')}
            </button>
          </td>
        ) : (
          row.cells.map((cell) => renderCellButton(cell, cell.gap ? 'gap' : 'filled', row.title, ruled))
        )}
      </tr>,
      below ? panelRow(row.slug) : null,
    ];
  };

  return (
    <section data-testid="harness-overview" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-2">
        <div data-testid="harness-overview-gaps" data-gap-count={gapCount} className="flex max-w-prose flex-col gap-1">
          {gapCount > 0 ? (
            <>
              <p className="text-title tabular-nums text-[color:var(--color-text-primary)]">
                {t('overviewGapCount', { count: gapCount })}
              </p>
              <p className="text-body text-[color:var(--color-text-tertiary)]">{t('overviewGapMeaning')}</p>
            </>
          ) : (
            <p className="text-title text-[color:var(--color-text-primary)]">
              {t('overviewNoGaps', { domains: overview.pathedDomainCount })}
            </p>
          )}
          {report.coverage.length === 0 ? (
            <p className="text-body text-[color:var(--color-text-secondary)]">{t('emptyBody')}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {gapCount > 0 ? (
            <Button
              variant="primary"
              size="sm"
              data-testid="harness-overview-handoff"
              className="atlas-touch-floor"
              onClick={copyRequest}
            >
              {t('overviewHandoff')}
            </Button>
          ) : null}
          <Chip
            data-testid="harness-overview-retry"
            onClick={() => {
              setTouched(false);
              setPressedKey(null);
              setPressedLast(null);
              onReread();
            }}
          >
            {t('overviewReread')}
          </Chip>
        </div>
        {gapCount > 0 ? (
          <>
            <p
              role="status"
              data-testid="harness-overview-handoff-status"
              className={cn('text-label', copyRefused ? AMBER : 'text-[color:var(--color-text-tertiary)]')}
            >
              {statusText}
            </p>
            <Disclosure summary={t('overviewRequestShow')} summaryTestId="harness-overview-request-toggle">
              <pre
                data-testid="harness-overview-request"
                tabIndex={0}
                className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-label text-[color:var(--color-text-secondary)]"
              >
                {requestText}
              </pre>
            </Disclosure>
          </>
        ) : null}
      </div>

      {overview.missingHookScripts.length > 0 ? (
        <div
          data-testid="harness-overview-silent"
          className="flex shrink-0 items-start gap-2.5 rounded-card border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] p-[var(--card-pad)] text-body text-[color:var(--color-amber-source-a90)]"
        >
          <TriangleAlert size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-keep">
            {t('anatomySilentGuards', {
              count: overview.missingHookScripts.length,
              scripts: overview.missingHookScripts.join(' · '),
            })}
          </span>
        </div>
      ) : null}

      <div
        onKeyDown={onTabHandoff}
        className={cn(
          'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]',
          below
            ? 'grid-cols-[minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)_24rem] gap-x-[var(--card-gap)]',
        )}
      >
        <div className="flex min-h-0 flex-col gap-3">
          <div data-testid="harness-overview-scroll" className="-mx-3 min-h-0 overflow-y-auto overscroll-contain pb-3">
            <table data-testid="harness-overview-table" className="w-full table-fixed border-separate border-spacing-0 text-left">
              <caption className="sr-only">{t('coverageTableCaption')}</caption>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={HEAD_CLASS}>
                    {t('coverageColumnArea')}
                  </th>
                  {OVERVIEW_COLUMNS.map((column) => {
                    const head = t(COLUMN_KEYS[column].head);
                    return (
                      <th key={column} scope="col" aria-label={head} className={HEAD_CLASS}>
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden>{head}</span>
                          <PlacedInfoHint preferred={HINT_ANCHOR[column]} label={head}>
                            {t(COLUMN_KEYS[column].hint)}
                          </PlacedInfoHint>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {overview.rows.flatMap(renderRow)}
                <tr data-harness-area={EVERYWHERE_ROW}>
                  <th scope="row" className={cn('px-3 py-3 text-left align-middle font-normal', RULE)}>
                    <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {t('coverageEverywhereTitle')}
                    </span>
                  </th>
                  {overview.everywhere.map((cell) =>
                    renderCellButton(cell, 'everywhere', t('coverageEverywhereTitle'), true),
                  )}
                </tr>
                {below ? panelRow(EVERYWHERE_ROW) : null}
              </tbody>
            </table>
            {below ? footer : null}
          </div>
          {below ? null : footer}
        </div>

        {below ? null : (
          <Surface
            as="aside"
            motion="overlay"
            open={openKey !== null}
            id={panelHostId('')}
            aria-labelledby={titleId('')}
            tabIndex={0}
            className="max-h-full min-h-0 self-start overflow-y-auto overscroll-contain rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-1)]"
          >
            <HarnessOverviewPanel
              overview={overview}
              targetKey={lastKey ?? ''}
              epoch={epoch}
              placement="beside"
              onClose={closePanel}
              titleId={titleId('')}
            />
          </Surface>
        )}
      </div>
    </section>
  );
}

function ProvenanceNotes({
  overview,
  pathlessCapabilities,
  t,
}: {
  overview: ReturnType<typeof buildHarnessOverview>;
  pathlessCapabilities: number;
  t: TranslateFn;
}) {
  const note = 'text-label tabular-nums text-[color:var(--color-text-quaternary)]';
  return (
    <Disclosure summary={t('coverageProvenance')} summaryTestId="harness-overview-provenance">
      <div className="mt-2 flex flex-col gap-2">
        <p className={note}>{t('coverageRule')}</p>
        {overview.unreachedPaths.length > 0 ? (
          <p className={note}>
            {t('coverageUnreached', {
              count: overview.unreachedPaths.length,
              paths: overview.unreachedPaths.join(' · '),
            })}
          </p>
        ) : null}
        {overview.outsideFolders.length > 0 ? (
          <p className={note}>
            {t('coverageOutside', {
              count: overview.outsideCount,
              folders: overview.outsideFolders.join(' · '),
            })}
          </p>
        ) : null}
        {pathlessCapabilities > 0 ? (
          <p className={note}>{t('coveragePathless', { count: pathlessCapabilities })}</p>
        ) : null}
        <p className={note}>{t('overviewLoopNote')}</p>
      </div>
    </Disclosure>
  );
}

const HEAD_CLASS =
  'sticky top-0 z-10 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 pb-2 pt-1 text-left text-label font-normal uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]';
