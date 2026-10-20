'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import type { CoverageColumn } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';

import {
  EVERYWHERE_ROW,
  OVERVIEW_COLUMNS,
  originCounts,
  overviewCellKey,
  type HarnessOverview,
  type OverviewCell,
  type OverviewRow,
} from '../model/harness-overview';
import { COLUMN_KEYS, ORIGIN_LABEL } from './harness-overview-labels';
import { PlacedInfoHint } from './PlacedInfoHint';

const HINT_ANCHOR: Readonly<Record<CoverageColumn, 'left' | 'center' | 'right'>> = {
  told: 'left',
  gated: 'center',
  watched: 'right',
};

const GRID = 'grid grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))] @max-[47.5rem]/table:grid-cols-3';

const ROW_MIN = 'min-h-[5.5rem] @max-[47.5rem]/table:min-h-0';

const DIVIDER = 'border-b border-[color:var(--color-divider)]';

const AMBER_INK = 'text-[color:var(--color-amber-source-text-a95)]';

/** A value tile is a bordered box so every state shares one footprint, and a column's text keeps one start line. */
const TILE_BASE =
  'h-13.5 min-h-0 gap-3 rounded-card border border-transparent px-3.5 py-0 text-left @max-[47.5rem]/table:px-2.5'

/** Hover is a fill: neutral on a count, amber on a gap, so a gap stays calm until it is reached for. */
const HOVER_FILL = 'hover:bg-[color:var(--color-overlay-2)]';
const HOVER_GAP = 'hover:bg-[color:var(--color-amber-signal-a07)]';

type CellState = 'filled' | 'gap' | 'everywhere';

export function HarnessOverviewMatrix({
  overview,
  openKey,
  below,
  onPress,
  registerCell,
  panelHostId,
  renderPanelRow,
}: {
  overview: HarnessOverview;
  openKey: string | null;
  below: boolean;
  onPress: (key: string) => void;
  registerCell: (key: string, node: HTMLButtonElement | null) => void;
  panelHostId: (slug: string) => string;
  renderPanelRow: (slug: string) => ReactNode;
}) {
  const t = useTranslations('harness');

  const tile = (cell: OverviewCell, state: CellState, label: string) => {
    const open = openKey === cell.key;
    const count = cell.entries.length;
    const kinds = originCounts(cell.entries).map(({ origin, count: n }) => `${t(ORIGIN_LABEL[origin])} ${n}`);
    return (
      <div key={cell.column} role="cell" className="flex min-w-0 items-center px-3 py-2.5 @max-[47.5rem]/table:flex-col @max-[47.5rem]/table:items-stretch @max-[47.5rem]/table:gap-1 @max-[47.5rem]/table:pt-0">
        <span aria-hidden className="hidden px-1 text-label text-[color:var(--color-text-quaternary)] @max-[47.5rem]/table:block">
          {t(COLUMN_KEYS[cell.column].head)}
        </span>
        <button
          type="button"
          ref={(node) => registerCell(cell.key, node)}
          onClick={() => onPress(cell.key)}
          aria-expanded={open}
          aria-controls={open ? panelHostId(cell.row) : undefined}
          aria-label={t('coverageOpenNames', {
            area: label,
            column: t(COLUMN_KEYS[cell.column].head),
            count,
          })}
          data-harness-cell={cell.column}
          data-harness-cell-state={state}
          className={cn(
            controlClass({
              shape: 'row',
              size: 'md',
              hoverSurface: 'lift',
              active: open,
              className: cn(
                TILE_BASE,
                state === 'gap' ? 'border-dashed border-[color:var(--color-amber-source-a45)] bg-transparent' : null,
                open && state !== 'gap' && 'bg-[color:var(--color-indigo-a14)] shadow-[inset_0_0_0_1px_var(--color-indigo-accent-a50)]',
                open && state === 'gap' && 'border-transparent bg-[color:var(--color-amber-signal-a16)] shadow-[inset_0_0_0_1px_var(--color-amber-source-a90)]',
              ),
            }),
            !open && (state === 'gap' ? HOVER_GAP : HOVER_FILL),
          )}
        >
          {state === 'gap' ? (
            <>
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" />
              <span className={cn('whitespace-nowrap text-body-lg font-[var(--font-weight-emphasis)]', AMBER_INK)}>
                {t('coverageNone')}
              </span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  'min-w-[22px] text-title font-[var(--font-weight-strong)] tabular-nums',
                  count === 0 ? 'text-[color:var(--color-text-quaternary)]' : 'text-[color:var(--color-text-primary)]',
                )}
              >
                {count}
              </span>
              <span className="line-clamp-2 min-w-0 text-label text-[color:var(--color-text-tertiary)]">
                {kinds.map((kind, at) => (
                  <Fragment key={kind}>
                    {at > 0 ? ' · ' : null}
                    <span className="whitespace-nowrap">{kind}</span>
                  </Fragment>
                ))}
              </span>
            </>
          )}
        </button>
      </div>
    );
  };

  const domainCell = (title: string, meta: string | null, line: string, titleClass: string) => (
    <div role="rowheader" className="flex min-w-0 flex-col justify-center gap-1 px-5 py-2.5 text-left @max-[47.5rem]/table:col-span-3">
      <span title={title} className={cn('min-w-0 line-clamp-2', titleClass)}>
        {title}
      </span>
      <span title={line} className="truncate text-body text-[color:var(--color-text-tertiary)]">
        {meta ? <span className="tabular-nums text-[color:var(--color-text-quaternary)]">{meta} · </span> : null}
        {line}
      </span>
    </div>
  );

  const renderRow = (row: OverviewRow) => {
    const pathKey = overviewCellKey(row.slug, 'path');
    return [
      <div key={row.slug} role="row" data-harness-area={row.slug} className={cn(GRID, ROW_MIN, DIVIDER)}>
        {domainCell(
          row.title,
          t('coveragePathCount', { count: row.paths.length }),
          row.purpose,
          'text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]',
        )}
        {row.cells === null ? (
          <div role="cell" className="col-span-3 flex min-w-0 items-center px-3 py-2.5 @max-[47.5rem]/table:pt-0">
            <button
              type="button"
              ref={(node) => registerCell(pathKey, node)}
              onClick={() => onPress(pathKey)}
              aria-expanded={openKey === pathKey}
              aria-controls={openKey === pathKey ? panelHostId(row.slug) : undefined}
              data-harness-cell="path"
              data-harness-cell-state="no-path"
              className={cn(
                controlClass({
                  shape: 'row',
                  size: 'md',
                  hoverSurface: 'lift',
                  active: openKey === pathKey,
                  className: cn(TILE_BASE, 'text-body text-[color:var(--color-text-tertiary)]'),
                }),
                openKey !== pathKey && HOVER_FILL,
              )}
            >
              {t('overviewNoPath')}
            </button>
          </div>
        ) : (
          row.cells.map((cell) => tile(cell, cell.gap ? 'gap' : 'filled', row.title))
        )}
      </div>,
      below ? renderPanelRow(row.slug) : null,
    ];
  };

  return (
    <div
      role="table"
      aria-label={t('coverageTableCaption')}
      data-testid="harness-overview-table"
      className="@container/table shrink-0 overflow-clip rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
    >
      <div role="rowgroup" data-harness-head className={cn('sticky top-0 z-10 bg-[color:var(--color-panel)] @max-[47.5rem]/table:hidden', DIVIDER)}>
        <div role="row" className={cn(GRID, 'bg-[color:var(--color-overlay-1)]')}>
          <div role="columnheader" className="flex min-h-14 items-center px-5 text-body text-[color:var(--color-text-quaternary)]">
            {t('coverageColumnArea')}
          </div>
          {OVERVIEW_COLUMNS.map((column) => {
            const head = t(COLUMN_KEYS[column].head);
            return (
              <div key={column} role="columnheader" aria-label={head} className="flex min-h-14 items-center px-3 py-2">
                <div className="flex min-w-0 flex-col justify-center gap-0.5 border border-transparent px-3.5">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                    <span aria-hidden>{head}</span>
                    <PlacedInfoHint preferred={HINT_ANCHOR[column]} label={head}>
                      {t(COLUMN_KEYS[column].hint)}
                    </PlacedInfoHint>
                  </span>
                  <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)] @max-[56rem]/table:hidden">
                    {t(COLUMN_KEYS[column].gloss)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div role="rowgroup">
        {overview.rows.flatMap(renderRow)}
        <div role="row" data-harness-area={EVERYWHERE_ROW} className={cn(GRID, ROW_MIN, 'bg-[color:var(--color-overlay-1)]')}>
          {domainCell(
            t('coverageEverywhereTitle'),
            null,
            t('overviewEverywhereGloss'),
            'text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]',
          )}
          {overview.everywhere.map((cell) => tile(cell, 'everywhere', t('coverageEverywhereTitle')))}
        </div>
        {below ? renderPanelRow(EVERYWHERE_ROW) : null}
      </div>
    </div>
  );
}
