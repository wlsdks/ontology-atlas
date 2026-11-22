"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';

import { fillStep, type ImportCell, type ImportMatrix } from '../model/import-matrix';

/** The smallest cell that still holds a two-line row header and an abbreviated `1.2k`. */
const CELL_MIN_PX = 34;
/** Cells widen to fill the figure, but past this a count floats in an empty slab. */
const CELL_WIDTH_MAX_PX = 176;
const CELL_HEIGHT_MAX_PX = 96;
const CELL_FALLBACK_PX = 48;
/** Below this width a count of four digits or more abbreviates (`1.2k`). */
const COMPACT_BELOW_PX = 52;
/** Below this width the column header names the role by its number instead of its name. */
const COLUMN_NAME_MIN_PX = 48;
/** Below this figure width the row header keeps only its number and name, so the columns fit. */
const ROW_HEADER_DETAIL_MIN_PX = 480;
const GRID_GAP_PX = 1;
/* Two `text-label` lines, so a two-word name such as "Shared foundation" wraps instead of cutting. */
const COLUMN_HEADER_PX = 34;
const ROW_HEADER_FALLBACK_PX = 200;

/* Written out because runtime-assembled class names are invisible to the CSS compiler. */
const FILL_CLASSES = [
  'bg-[color:var(--color-indigo-a08)]',
  'bg-[color:var(--color-indigo-a12)]',
  'bg-[color:var(--color-indigo-a16)]',
  'bg-[color:var(--color-indigo-a22)]',
  'bg-[color:var(--color-indigo-a28)]',
  'bg-[color:var(--color-indigo-a34)]',
  'bg-[color:var(--color-indigo-a40)]',
  'bg-[color:var(--color-indigo-a50)]',
] as const;

interface FigureSize {
  width: number;
  height: number;
}

/**
 * The room the grid may take: the figure's box less its readout and caption lines, so the caption
 * sits right under the grid instead of at the bottom of the window. Height counts only when the
 * workbench holds the figure to the window.
 */
function useFigureSize(heightBound: boolean): [FigureSize, (element: HTMLDivElement | null) => void] {
  const [size, setSize] = useState<FigureSize>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback(
    (figure: HTMLDivElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!figure || typeof ResizeObserver === 'undefined') return;
      const read = () => {
        const lines = [...figure.querySelectorAll<HTMLElement>('[data-figure-line]')];
        const linesPx = lines.reduce((sum, line) => {
          const style = getComputedStyle(line);
          return sum + line.offsetHeight + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom);
        }, 0);
        setSize({ width: figure.clientWidth, height: heightBound ? Math.max(0, figure.clientHeight - linesPx) : 0 });
      };
      read();
      observer.current = new ResizeObserver(read);
      observer.current.observe(figure);
    },
    [heightBound],
  );
  return [size, attach];
}

interface CellSize {
  widthPx: number;
  heightPx: number;
}

function cellSize(roles: number, size: FigureSize, rowHeaderPx: number): CellSize {
  if (size.width === 0 || roles === 0) return { widthPx: CELL_FALLBACK_PX, heightPx: CELL_FALLBACK_PX };
  const gaps = roles * GRID_GAP_PX;
  const byWidth = Math.floor((size.width - rowHeaderPx - gaps) / roles);
  const widthPx = Math.max(CELL_MIN_PX, Math.min(CELL_WIDTH_MAX_PX, byWidth));
  const byHeight = size.height > 0 ? Math.floor((size.height - COLUMN_HEADER_PX - gaps) / roles) : Infinity;
  const heightPx = Math.max(CELL_MIN_PX, Math.min(CELL_HEIGHT_MAX_PX, widthPx, byHeight));
  return { widthPx, heightPx };
}

function useRowHeaderWidth(): [number, (header: HTMLElement | null) => void] {
  const [widthPx, setWidthPx] = useState(ROW_HEADER_FALLBACK_PX);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((header: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!header) return;
    setWidthPx(header.offsetWidth);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(() => setWidthPx(header.offsetWidth));
    observer.current.observe(header);
  }, []);
  return [widthPx, attach];
}

export function ArchitectureImportMatrix({
  matrix,
  measured,
  heightBound,
  selectedRole,
  markedRole,
  roleLabel,
  pathLabelOf,
  moduleCountOf,
  sentenceOf,
  onSelectRole,
  onSelectCell,
}: {
  matrix: ImportMatrix;
  /** Whether a record exists; without one the table draws the rules only. */
  measured: boolean;
  /** At workbench width the figure fits the window's height; stacked, only its width. */
  heightBound: boolean;
  selectedRole: string | null;
  markedRole: string | null;
  roleLabel: (id: string) => string;
  pathLabelOf: (id: string) => string;
  moduleCountOf: (id: string) => number | null;
  sentenceOf: (cell: ImportCell) => string;
  onSelectRole: (id: string) => void;
  onSelectCell: (cell: ImportCell) => void;
}) {
  const t = useTranslations('architecture');
  const locale = useLocale();
  const [size, attachFigure] = useFigureSize(heightBound);
  const [rowHeaderPx, measureRowHeader] = useRowHeaderWidth();
  const roles = matrix.order.length;
  const { widthPx: cellWidthPx, heightPx: cellHeightPx } = cellSize(roles, size, rowHeaderPx);
  const compact = cellWidthPx < COMPACT_BELOW_PX;
  const namesColumns = cellWidthPx >= COLUMN_NAME_MIN_PX;
  const showsRowDetail = size.width === 0 || size.width >= ROW_HEADER_DETAIL_MIN_PX;
  /* `1.2k` in every locale: developers read it, and a localized unit can double the glyph width. */
  const countFormat = compact
    ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
    : new Intl.NumberFormat(locale);

  const [pointed, setPointed] = useState<ImportCell | null>(null);
  const [focusAt, setFocusAt] = useState<{ row: number; column: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selectedRow = selectedRole === null ? -1 : matrix.order.indexOf(selectedRole);
  const markedColumn = markedRole === null ? -1 : matrix.order.indexOf(markedRole);
  const rovingAt = focusAt ?? { row: Math.max(0, selectedRow), column: Math.max(0, markedColumn) };

  const cells = matrix.cells.flat();
  const firstViolation = cells.find((cell) => cell.kind === 'violation') ?? null;
  const busiest = cells.reduce<ImportCell | null>(
    (best, cell) => (cell.kind === 'observed' && (!best || cell.count > best.count) ? cell : best),
    null,
  );
  const marked = selectedRow >= 0 && markedColumn >= 0 ? matrix.cells[selectedRow]![markedColumn]! : null;
  const readout = pointed ?? marked ?? firstViolation ?? (measured ? busiest : null);
  const hasViolation = firstViolation !== null;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) {
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = {
      row: Math.min(roles - 1, Math.max(0, row + delta[0])),
      column: Math.min(roles - 1, Math.max(0, column + delta[1])),
    };
    setFocusAt(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell-row="${next.row}"][data-cell-column="${next.column}"]`)
      ?.focus();
  }

  const pointedRow = pointed ? matrix.order.indexOf(pointed.from) : -1;
  const pointedColumn = pointed ? matrix.order.indexOf(pointed.to) : -1;

  return (
    <div ref={attachFigure} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="architecture-figure">
      <p
        data-figure-line
        className={cn(
          'mb-2 h-5 shrink-0 truncate text-body tabular-nums',
          readout?.kind === 'violation'
            ? 'text-[color:var(--color-danger-text)]'
            : 'text-[color:var(--color-text-secondary)]',
        )}
        data-testid="architecture-readout"
      >
        {readout ? sentenceOf(readout) : null}
      </p>
      <div className="min-h-0 min-w-0 shrink overflow-auto">
        <div
          ref={gridRef}
          role="group"
          aria-label={t('matrixLabel')}
          data-testid="architecture-matrix"
          className="grid w-max"
          style={{
            gridTemplateColumns: `max-content repeat(${roles}, ${cellWidthPx}px)`,
            gridTemplateRows: `${COLUMN_HEADER_PX}px repeat(${roles}, ${cellHeightPx}px)`,
            gap: GRID_GAP_PX,
          }}
          onPointerLeave={() => setPointed(null)}
        >
          <span aria-hidden />
          {matrix.order.map((id, column) => (
            <span
              key={id}
              aria-hidden
              title={roleLabel(id)}
              className={cn(
                'flex min-w-0 items-end justify-center px-0.5 pb-1 text-center text-label transition-colors',
                column === pointedColumn || column === markedColumn
                  ? 'text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-tertiary)]',
                !namesColumns && 'font-mono tabular-nums',
              )}
              data-testid={`architecture-column-${id}`}
            >
              <span className="line-clamp-2 break-words">
                {namesColumns ? roleLabel(id) : String(column + 1).padStart(2, '0')}
              </span>
            </span>
          ))}
          {matrix.cells.map((row, rowIndex) => {
            const id = matrix.order[rowIndex]!;
            const modules = moduleCountOf(id);
            const active = rowIndex === selectedRow;
            return [
              <button
                key={`${id}:header`}
                ref={rowIndex === 0 ? measureRowHeader : undefined}
                type="button"
                aria-pressed={active}
                data-testid={`architecture-role-${id}`}
                data-role={id}
                onClick={() => onSelectRole(id)}
                className={cn(
                  'flex min-w-0 max-w-[16rem] flex-col justify-center rounded-micro pl-2 pr-3 text-left transition-colors',
                  'hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
                  active && 'bg-[color:var(--color-overlay-2)]',
                )}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
                    {String(rowIndex + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'truncate text-body font-[var(--font-weight-emphasis)]',
                      active || rowIndex === pointedRow
                        ? 'text-[color:var(--color-text-primary)]'
                        : 'text-[color:var(--color-text-secondary)]',
                    )}
                  >
                    {roleLabel(id)}
                  </span>
                </span>
                {showsRowDetail ? (
                  <span className="truncate text-caption text-[color:var(--color-text-quaternary)]">
                    <span className="font-mono">{pathLabelOf(id)}</span>
                    {modules === null ? null : ` · ${t('moduleCount', { count: modules })}`}
                  </span>
                ) : null}
              </button>,
              ...row.map((cell, column) => (
                <MatrixCell
                  key={`${cell.from}>${cell.to}`}
                  cell={cell}
                  row={rowIndex}
                  column={column}
                  measured={measured}
                  sentence={sentenceOf(cell)}
                  fill={fillStep(cell.count, matrix.maxCount, FILL_CLASSES.length)}
                  countText={countFormat.format(cell.kind === 'violation' ? cell.violations : cell.count).toLowerCase()}
                  marked={rowIndex === selectedRow && column === markedColumn}
                  tabbable={rowIndex === rovingAt.row && column === rovingAt.column}
                  onPoint={setPointed}
                  onFocusCell={() => {
                    setFocusAt({ row: rowIndex, column });
                    setPointed(cell);
                  }}
                  onKeyDown={(event) => moveFocus(event, rowIndex, column)}
                  onSelect={() => onSelectCell(cell)}
                />
              )),
            ];
          })}
        </div>
      </div>
      <p
        data-figure-line
        className="mt-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-label text-[color:var(--color-text-tertiary)]"
        data-testid="architecture-matrix-caption"
      >
        <span className="break-keep">{t('matrixHowToRead')}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1 rounded-full bg-[color:var(--color-text-quaternary)]" />
          {t('legendAllowed')}
        </span>
        {hasViolation ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-micro border border-[color:var(--color-danger-a50)] bg-[color:var(--color-danger-a10)]"
            />
            {t('legendViolation')}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function MatrixCell({
  cell,
  row,
  column,
  measured,
  sentence,
  fill,
  countText,
  marked,
  tabbable,
  onPoint,
  onFocusCell,
  onKeyDown,
  onSelect,
}: {
  cell: ImportCell;
  row: number;
  column: number;
  measured: boolean;
  sentence: string;
  fill: number;
  countText: string;
  marked: boolean;
  tabbable: boolean;
  onPoint: (cell: ImportCell | null) => void;
  onFocusCell: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}) {
  const showsCount = measured && (cell.kind === 'observed' || cell.kind === 'violation' || cell.kind === 'uncounted');
  return (
    <button
      type="button"
      aria-label={sentence}
      tabIndex={tabbable ? 0 : -1}
      data-testid={`architecture-cell-${cell.from}-${cell.to}`}
      data-cell-kind={cell.kind}
      data-cell-row={row}
      data-cell-column={column}
      data-marked={marked ? 'true' : undefined}
      onPointerEnter={() => onPoint(cell)}
      onFocus={onFocusCell}
      onBlur={() => onPoint(null)}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      className={cn(
        'relative flex items-center justify-center rounded-micro font-mono text-label tabular-nums transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
        cell.kind === 'violation'
          ? 'border border-[color:var(--color-danger-a50)] bg-[color:var(--color-danger-a10)] font-[var(--font-weight-strong)] text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a12)]'
          : cell.kind === 'self'
            ? 'text-[color:var(--color-text-quaternary)] hover:bg-[color:var(--color-overlay-2)]'
            : cn(
                fill > 0 && cell.kind === 'observed' ? FILL_CLASSES[fill - 1] : 'bg-[color:var(--color-overlay-1)]',
                cell.kind === 'uncounted'
                  ? 'text-[color:var(--color-text-quaternary)]'
                  : 'text-[color:var(--color-text-primary)]',
                'hover:ring-1 hover:ring-inset hover:ring-[color:var(--color-border-strong)]',
              ),
        marked && cell.kind !== 'violation' && 'ring-1 ring-inset ring-[color:var(--color-text-tertiary)]',
        marked && cell.kind === 'violation' && 'ring-1 ring-[color:var(--color-danger-text)]',
      )}
    >
      {cell.kind === 'self' ? (
        <span aria-hidden>–</span>
      ) : showsCount ? (
        <span aria-hidden>{countText}</span>
      ) : cell.kind === 'allowed' ? (
        <span aria-hidden className="size-1 rounded-full bg-[color:var(--color-text-quaternary)]" />
      ) : null}
    </button>
  );
}
